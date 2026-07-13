import { NextResponse } from "next/server";
import { TokenGenerationService } from "../../../../features/qr/services/tokenGenerationService";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError, ConflictError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const GenerateRedeemSchema = z.object({
  rewardId: z.string(),
  rewardPoints: z.number().int().min(1),
  rewardName: z.string().min(1),
}).strict();

const tokenGenerationService = new TokenGenerationService();
const userRepository = new UserRepository();

export async function POST(request: Request) {
  try {
    const customerId = request.headers.get("x-user-id");

    if (!customerId) {
      return NextResponse.json({
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message: "Customer authentication is missing.",
      }, { status: 401 });
    }

    const body = await request.json();
    const parsed = GenerateRedeemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { rewardId, rewardPoints, rewardName } = parsed.data;

    // Enforce rate limit: 10 requests / minute per Customer Account
    await checkRateLimit(customerId, {
      keyPrefix: "customer_generate_redeem_qr",
      limit: 10,
      windowSeconds: 60,
    });

    // Verify redemption eligibility before token creation
    const customer = await userRepository.findById(customerId);
    if (!customer) {
      return NextResponse.json({
        success: false,
        code: "FORBIDDEN_RESOURCE",
        message: "Customer profile not found.",
      }, { status: 403 });
    }

    const totalPoints = customer.currentPoints + customer.pendingPoints;
    if (totalPoints < rewardPoints) {
      throw new ConflictError(`คะแนนสะสมไม่เพียงพอ (มี ${totalPoints} คะแนน ต้องการ ${rewardPoints} คะแนน)`);
    }

    // Deduplication check: check if the customer has already redeemed this rewardId
    const { prisma } = await import("../../../../lib/prisma");
    const alreadyRedeemed = await prisma.transaction.findFirst({
      where: {
        customerId,
        type: "REDEEM",
        tokenHash: {
          startsWith: `redeem:${rewardId}:`,
        },
      },
    });

    if (alreadyRedeemed) {
      throw new ConflictError("คุณเคยใช้สิทธิ์แลกของรางวัลชิ้นนี้ไปแล้ว");
    }

    const result = await tokenGenerationService.generateRedeemToken(customerId, rewardId, rewardPoints, rewardName);

    logger.info("CUSTOMER_GENERATE_REDEEM_QR_SUCCESS", { customerId, rewardId, rewardPoints });

    return NextResponse.json({
      success: true,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("CUSTOMER_GENERATE_REDEEM_QR_FAILED", {}, err);

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
      message: "An unexpected error occurred.",
    }, { status: 500 });
  }
}
