import { NextResponse } from "next/server";
import { PointsMutationService } from "../../../../features/points/services/pointsMutationService";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const ScanSchema = z.object({
  token: z.string().length(64).regex(/^[a-fA-F0-9]+$/, "Token must be a valid 64-character hexadecimal string."),
}).strict();

const pointsMutationService = new PointsMutationService();

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
    
    // Validate request schema
    const parsed = ScanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "Invalid token payload.",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { token } = parsed.data;

    // Enforce rate limit: 20 requests / minute per Customer Account
    await checkRateLimit(customerId, {
      keyPrefix: "customer_scan",
      limit: 20,
      windowSeconds: 60,
    });

    const result = await pointsMutationService.processEarnToken(customerId, token);

    return NextResponse.json(result);

  } catch (error: any) {
    logger.warn("CUSTOMER_SCAN_FAILED", {}, error);

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
