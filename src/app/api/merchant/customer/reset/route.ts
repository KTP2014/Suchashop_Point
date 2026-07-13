import { NextResponse } from "next/server";
import { PointsMutationService } from "../../../../../features/points/services/pointsMutationService";
import { checkRateLimit } from "../../../../../lib/rateLimit";
import { AppError } from "../../../../../lib/errors";
import { logger } from "../../../../../lib/logger";
import { z } from "zod";

const ResetSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Customer ID must be a valid 24-character hexadecimal MongoDB ObjectId."),
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
    const parsed = ResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "Invalid customer ID format.",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { customerId } = parsed.data;

    // Enforce rate limit: 10 requests / minute per Merchant Account
    await checkRateLimit(merchantId, {
      keyPrefix: "merchant_reset",
      limit: 10,
      windowSeconds: 60,
    });

    const result = await pointsMutationService.administrativeReset(customerId, merchantId);

    return NextResponse.json(result);

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn("MERCHANT_RESET_FAILED", {}, err);

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
