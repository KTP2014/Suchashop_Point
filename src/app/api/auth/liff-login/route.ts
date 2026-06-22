import { NextResponse } from "next/server";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { signToken, JWTPayload } from "../../../../features/auth/services/jwt";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";

const userRepository = new UserRepository();

export async function POST(request: Request) {
  try {
    const { lineUserId, displayName } = await request.json();

    if (!lineUserId) {
      return NextResponse.json({ 
        success: false, 
        message: "Missing LINE User ID." 
      }, { status: 400 });
    }

    // Check if customer already exists in MongoDB
    let user = await userRepository.findByLineUserId(lineUserId);

    if (!user) {
      // Auto-Register new LINE user with display name
      user = await prisma.user.create({
        data: {
          lineUserId,
          displayName: displayName || null,
          role: Role.CUSTOMER,
          currentPoints: 0,
          pendingPoints: 0,
          version: 0,
        },
      });
    } else if (displayName && user.displayName !== displayName) {
      // Update display name if changed
      user = await prisma.user.update({
        where: { id: user.id },
        data: { displayName },
      });
    }

    const payload: JWTPayload = {
      userId: user.id,
      phoneNumber: user.phoneNumber || "",
      role: user.role,
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
