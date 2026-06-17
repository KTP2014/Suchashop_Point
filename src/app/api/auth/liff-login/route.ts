import { NextResponse } from "next/server";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { signToken, JWTPayload } from "../../../../features/auth/services/jwt";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";

const userRepository = new UserRepository();

export async function POST(request: Request) {
  try {
    const { lineUserId } = await request.json();

    if (!lineUserId) {
      return NextResponse.json({ 
        success: false, 
        message: "Missing LINE User ID." 
      }, { status: 400 });
    }

    // Check if customer already exists in MongoDB
    let user = await userRepository.findByLineUserId(lineUserId);

    if (!user) {
      // Auto-Register new LINE user
      user = await userRepository.createCustomerWithLine(lineUserId);
    }

    const payload: JWTPayload = {
      userId: user.id,
      phoneNumber: user.phoneNumber || "",
      role: Role.CUSTOMER,
    };

    // Sign custom token matching Edge middleware expectations (30 days validity)
    const CUSTOMER_EXPIRY = 2592000;
    const token = await signToken(payload, CUSTOMER_EXPIRY);

    // Save session in HttpOnly secure cookie
    const cookieStore = await cookies();
    cookieStore.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: CUSTOMER_EXPIRY,
      path: "/",
    });

    return NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        currentPoints: user.currentPoints,
        pendingPoints: user.pendingPoints,
      } 
    });
  } catch (error: any) {
    console.error("LIFF login failed:", error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || "Failed to process LIFF login." 
    }, { status: 500 });
  }
}
