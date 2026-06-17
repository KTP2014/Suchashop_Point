import { NextResponse } from "next/server";
import { TokenGenerationService } from "../../../../features/qr/services/tokenGenerationService";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError, ConflictError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";

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

    if (customer.currentPoints !== 5) {
      throw new ConflictError("Redemption requires exactly 5 active points.");
    }

    const result = await tokenGenerationService.generateRedeemToken(customerId);

    logger.info("CUSTOMER_GENERATE_REDEEM_QR_SUCCESS", { customerId });

    return NextResponse.json({
      success: true,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    });

  } catch (error: any) {
    logger.error("CUSTOMER_GENERATE_REDEEM_QR_FAILED", {}, error);

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
