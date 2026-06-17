import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AuthService } from "../../../../features/auth/services/authService";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const MerchantLoginSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must match E.164 format."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
}).strict();

const authService = new AuthService();

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";

  try {
    const body = await request.json();
    
    // Validate request schema
    const parsed = MerchantLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "Invalid input fields.",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { phoneNumber, password } = parsed.data;

    // Enforce rate limit: 5 requests / 15 minutes per IP and Phone Number
    await checkRateLimit(`${ip}:${phoneNumber}`, {
      keyPrefix: "auth_merchant",
      limit: 5,
      windowSeconds: 900,
    });

    const { token, user } = await authService.loginMerchant(phoneNumber, password);

    // Save session in HttpOnly secure cookie for 12 hours
    const cookieStore = await cookies();
    cookieStore.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: authService.MERCHANT_EXPIRY,
      path: "/",
    });

    logger.info("MERCHANT_LOGIN_SUCCESS", { userId: user.id });

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
      user,
    });

  } catch (error: any) {
    logger.warn("MERCHANT_LOGIN_FAILED", {}, error);

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
