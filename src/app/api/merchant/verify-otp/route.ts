import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { prisma } from "../../../../lib/prisma";
import { AppError, ValidationError, ConflictError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";
import { PointsMutationService } from "../../../../features/points/services/pointsMutationService";
import { TokenGenerationService } from "../../../../features/qr/services/tokenGenerationService";
import { z } from "zod";

const VerifyOtpSchema = z.object({
  otpCode: z.string().length(6, "รหัส OTP ต้องมี 6 หลัก").regex(/^[0-9]+$/, "รหัส OTP ต้องเป็นตัวเลขเท่านั้น"),
  actionType: z.enum(["EARN", "REDEEM"]),
  points: z.number().int().min(1).optional(), // Can be points to earn or deduct
  rewardId: z.string().optional(),
  rewardName: z.string().optional(),
}).strict();

const pointsMutationService = new PointsMutationService();
const tokenGenerationService = new TokenGenerationService();

export async function POST(request: Request) {
  try {
    // Authenticate operator: must be STAFF, ADMIN, or MERCHANT
    const operator = await secureRoute([Role.STAFF, Role.ADMIN, Role.MERCHANT]);
    const operatorId = operator.id;

    const body = await request.json();
    const parsed = VerifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { otpCode, actionType, points, rewardId, rewardName } = parsed.data;

    // 1. TTL Cleanup: Delete expired OtpCodes globally to prevent bloat
    await prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    // 2. Query the OTP code from DB
    const otpEntry = await prisma.otpCode.findFirst({
      where: {
        code: otpCode,
        expiresAt: { gt: new Date() }, // Not expired
      },
    });

    if (!otpEntry) {
      return NextResponse.json({
        success: false,
        code: "INVALID_OTP_CODE",
        message: "รหัส OTP ไม่ถูกต้อง หรือหมดอายุแล้ว",
      }, { status: 400 });
    }

    const customerId = otpEntry.userId;

    // 3. Immediately delete OTP code to prevent reuse / double-spending
    await prisma.otpCode.delete({
      where: { id: otpEntry.id },
    });

    // 4. Verify target Customer role
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer || (customer.role !== Role.CUSTOMER && customer.role !== Role.STAFF && customer.role !== Role.ADMIN)) {
      throw new ValidationError("บัญชีผู้ใช้งานไม่อยู่ในระบบสะสมแต้ม");
    }

    // 5. Process Points Mutation based on Action Type
    if (actionType === "REDEEM") {
      const deductPoints = points ?? 5;
      const totalPoints = customer.currentPoints + customer.pendingPoints;
      if (totalPoints < deductPoints) {
        throw new ValidationError(`ลูกค้ามีคะแนนสะสมไม่เพียงพอ (มี ${totalPoints} คะแนน ต้องการ ${deductPoints} คะแนน)`);
      }

      // Generate redemption coupon token on Redis and process it
      const { token } = await tokenGenerationService.generateRedeemToken(customerId, rewardId, deductPoints, rewardName);
      const result = await pointsMutationService.processScannedRedemption(operatorId, token);
      
      logger.info("OTP_REDEMPTION_SUCCESS", { customerId, operatorId, rewardName, deductPoints });
      return NextResponse.json({
        success: true,
        type: "REDEEM",
        message: `แลกของรางวัล "${rewardName || 'ของรางวัล'}" สำเร็จ!`,
        rewardName: rewardName || "ของรางวัล",
        balances: result.balances,
      });

    } else {
      // Action Type: EARN
      const earnPoints = points ?? 1;
      // Generate earn token on Redis and process it
      const { token } = await tokenGenerationService.generateEarnToken(operatorId, earnPoints);
      const result = await pointsMutationService.processEarnToken(customerId, token);

      logger.info("OTP_EARNING_SUCCESS", { customerId, operatorId, points: earnPoints });
      return NextResponse.json({
        success: true,
        type: "EARN",
        addedPoints: earnPoints,
        message: `สะสมแต้มสำเร็จ (+${earnPoints} แต้ม)!`,
        balances: result.balances,
      });
    }

  } catch (error: any) {
    logger.warn("VERIFY_OTP_FAILED", {}, error);

    if (error instanceof AppError) {
      return NextResponse.json({
        success: false,
        code: error.code,
        message: error.message,
      }, { status: error.statusCode });
    }

    return NextResponse.json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "เกิดข้อผิดพลาดในการตรวจสอบรหัส OTP",
    }, { status: 500 });
  }
}
