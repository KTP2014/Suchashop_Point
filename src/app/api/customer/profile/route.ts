import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { prisma } from "../../../../lib/prisma";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";

export async function GET(request: Request) {
  try {
    // Authenticate user via secure DB lookup (allow all logged-in roles to query profile)
    const user = await secureRoute([
      Role.CUSTOMER,
      Role.PENDING_APPROVAL,
      Role.STAFF,
      Role.ADMIN,
      Role.MERCHANT,
    ]);

    const customerId = user.id;

    // 1. TTL Cleanup: Delete expired OtpCodes globally to prevent DB bloat
    await prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    // 2. Fetch or Generate active 6-digit OTP code for the user
    let otpCode = "";
    const existingOtp = await prisma.otpCode.findFirst({
      where: {
        userId: customerId,
        expiresAt: { gt: new Date(Date.now() + 30 * 1000) }, // Must have at least 30s of lifetime left
      },
    });

    if (existingOtp) {
      otpCode = existingOtp.code;
    } else {
      // Clear any outdated OTPs for this specific user
      await prisma.otpCode.deleteMany({
        where: { userId: customerId },
      });

      let attempts = 0;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

      // Loop check to prevent generating active duplicate codes
      while (attempts < 10) {
        otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const duplicate = await prisma.otpCode.findFirst({
          where: {
            code: otpCode,
            expiresAt: { gt: new Date() }, // Check if there's any active non-expired code matching
          },
        });

        if (!duplicate) {
          break;
        }
        attempts++;
      }

      await prisma.otpCode.create({
        data: {
          code: otpCode,
          userId: customerId,
          expiresAt,
        },
      });
    }

    const currentPoints = user.currentPoints;
    const pendingPoints = user.pendingPoints;

    // Fetch redeemed reward IDs from transaction history
    const redeems = await prisma.transaction.findMany({
      where: {
        customerId,
        type: "REDEEM",
        tokenHash: {
          startsWith: "redeem:",
        },
      },
      select: {
        tokenHash: true,
      },
    });

    const redeemedRewardIds = redeems
      .map((tx) => {
        const parts = tx.tokenHash?.split(":") || [];
        return parts[1]; // rewardId is at index 1
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      currentPoints,
      pendingPoints,
      totalPoints: currentPoints + pendingPoints,
      role: user.role,
      otpCode,
      redeemedRewardIds,
    });

  } catch (error: any) {
    logger.error("CUSTOMER_PROFILE_FAILED", {}, error);

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
