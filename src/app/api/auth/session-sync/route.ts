import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../[...nextauth]/route";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { signToken, JWTPayload } from "../../../../features/auth/services/jwt";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";

const userRepository = new UserRepository();

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !(session as any).userId) {
      return NextResponse.json({ 
        success: false, 
        message: "No active NextAuth session found." 
      }, { status: 401 });
    }

    const userId = (session as any).userId;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        message: "User not found in database." 
      }, { status: 404 });
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
    console.error("Session sync failed:", error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || "Failed to sync session." 
    }, { status: 500 });
  }
}
