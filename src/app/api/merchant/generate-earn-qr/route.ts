import { NextResponse } from "next/server";
import { TokenGenerationService } from "../../../../features/qr/services/tokenGenerationService";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const GenerateEarnQRSchema = z.object({
  points: z.number().int().min(1, "Points must be at least 1.").max(5, "Points cannot exceed 5.").default(1),
}).strict().optional();

const tokenGenerationService = new TokenGenerationService();

export async function POST(request: Request) {
  try {
    const merchantId = request.headers.get("x-user-id");

    if (!merchantId) {
      return NextResponse.json({
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message: "Merchant authentication is missing.",
      }, { status: 401 });
    }

    // Enforce rate limit: 30 requests / minute per Merchant Account
    await checkRateLimit(merchantId, {
      keyPrefix: "merchant_generate_qr",
      limit: 30,
      windowSeconds: 60,
    });

    let points = 1;

    // Parse points delta if body is supplied
    try {
      const body = await request.json();
      if (body) {
        const parsed = GenerateEarnQRSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json({
            success: false,
            code: "BAD_REQUEST_VALIDATION",
            message: "Invalid points increment parameters.",
            errors: parsed.error.issues,
          }, { status: 400 });
        }
        points = parsed.data?.points ?? 1;
      }
    } catch {
      // Body empty or malformed, fallback to default points = 1
    }

    const result = await tokenGenerationService.generateEarnToken(merchantId, points);

    logger.info("MERCHANT_GENERATE_QR_SUCCESS", { merchantId, points });

    return NextResponse.json({
      success: true,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      points,
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("MERCHANT_GENERATE_QR_FAILED", {}, err);

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
