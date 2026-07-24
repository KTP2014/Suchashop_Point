import { NextResponse } from "next/server";
import { signToken, JWTPayload } from "../../../../features/auth/services/jwt";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";

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
    let user = await prisma.user.findFirst({
      where: { lineUserId },
    });

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
    } else {
      // Self-Healing & Non-Destructive Auto-Repair for existing users
      const validRoles = [Role.CUSTOMER, Role.PENDING_APPROVAL, Role.STAFF, Role.ADMIN, Role.MERCHANT];
      const isRoleCorrupted = !user.role || !validRoles.includes(user.role);
      const isCurrentPointsMissing = typeof user.currentPoints !== "number" || Number.isNaN(user.currentPoints);
      const isPendingPointsMissing = typeof user.pendingPoints !== "number" || Number.isNaN(user.pendingPoints);
      const isVersionMissing = typeof user.version !== "number" || Number.isNaN(user.version);
      const isDisplayNameChanged = displayName && user.displayName !== displayName;

      if (isRoleCorrupted || isCurrentPointsMissing || isPendingPointsMissing || isVersionMissing || isDisplayNameChanged) {
        const repairData: {
          role?: Role;
          currentPoints?: number;
          pendingPoints?: number;
          version?: number;
          displayName?: string;
        } = {};

        // 1. Repair role safely: if corrupted/null, default to CUSTOMER
        if (isRoleCorrupted) {
          repairData.role = Role.CUSTOMER;
          console.warn(`[AUTO-REPAIR] Repairing corrupted role for lineUserId: ${lineUserId} -> CUSTOMER`);
        }

        // 2. Preserve existing points or recalculate from transaction ledger if missing
        if (isCurrentPointsMissing) {
          const transactions = await prisma.transaction.findMany({
            where: { customerId: user.id },
          });
          const reconstructedPoints = transactions.reduce((sum, tx) => sum + (tx.currentChange || 0), 0);
          repairData.currentPoints = Math.max(0, reconstructedPoints);
          console.warn(`[AUTO-REPAIR] Reconstructed points balance from transaction ledger for lineUserId: ${lineUserId} -> ${repairData.currentPoints} points`);
        }

        if (isPendingPointsMissing) {
          repairData.pendingPoints = 0;
        }

        if (isVersionMissing) {
          repairData.version = 0;
        }

        if (isDisplayNameChanged) {
          repairData.displayName = displayName;
        }

        // Atomically update ONLY corrupted/updated fields while keeping existing points & history intact!
        user = await prisma.user.update({
          where: { id: user.id },
          data: repairData,
        });
      }
    }

    // v2.0 Sign token with the latest database role
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
      sameSite: "lax",
      maxAge: CUSTOMER_EXPIRY,
      path: "/",
    });

    return NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        role: user.role,
        currentPoints: user.currentPoints,
        pendingPoints: user.pendingPoints,
      } 
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("LIFF login failed:", err);
    return NextResponse.json({ 
      success: false, 
      message: err.message || "Failed to process LIFF login." 
    }, { status: 500 });
  }
}
