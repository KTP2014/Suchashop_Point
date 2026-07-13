import { NextResponse } from "next/server";
import { PointsMutationService } from "../../../../features/points/services/pointsMutationService";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const RedeemScanSchema = z.object({
  token: z.string().length(64).regex(/^[a-fA-F0-9]+$/, "Token must be a valid 64-character hexadecimal string."),
}).strict();

const pointsMutationService = new PointsMutationService();

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

    const body = await request.json();
    
    // Validate request schema
    const parsed = RedeemScanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "Invalid token payload.",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { token } = parsed.data;

    // Enforce rate limit: 20 requests / minute per Merchant Account
    await checkRateLimit(merchantId, {
      keyPrefix: "merchant_scan_redeem",
      limit: 20,
      windowSeconds: 60,
    });

    const result = await pointsMutationService.processScannedRedemption(merchantId, token);

    return NextResponse.json(result);

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn("MERCHANT_SCAN_REDEEM_FAILED", {}, err);

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
