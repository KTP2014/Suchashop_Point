import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AuthService } from "../../../../features/auth/services/authService";
import { checkRateLimit } from "../../../../lib/rateLimit";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const CustomerLoginSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "Phone number must match E.164 format."),
  birthdate: z.string().regex(/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])\d{4}$/, "Birthdate must match DDMMYYYY format."),
}).strict();

const authService = new AuthService();

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";

  try {
    const body = await request.json();
    
    // Validate request schema
    const parsed = CustomerLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "Invalid input fields.",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { phoneNumber, birthdate } = parsed.data;

    // Enforce strict rate limit: 5 requests / 15 minutes per IP and per Phone Number
    await checkRateLimit(`${ip}:${phoneNumber}`, {
      keyPrefix: "auth_customer",
      limit: 5,
      windowSeconds: 900,
    });

    const { token, user } = await authService.loginCustomer(phoneNumber, birthdate);

    // Save session in HttpOnly secure cookie
    const cookieStore = await cookies();
    cookieStore.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: authService.CUSTOMER_EXPIRY,
      path: "/",
    });

    logger.info("CUSTOMER_LOGIN_SUCCESS", { userId: user.id });

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
      user,
    });

  } catch (error: any) {
    logger.warn("CUSTOMER_LOGIN_FAILED", {}, error);

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
