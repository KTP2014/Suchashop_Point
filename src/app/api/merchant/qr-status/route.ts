import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { redis } from "../../../../lib/redis";
import { prisma } from "../../../../lib/prisma";
import { Role } from "@prisma/client";
import * as crypto from "crypto";

export async function GET(request: Request) {
  try {
    // Authenticate caller: must be Admin, Staff, or Merchant
    const merchant = await secureRoute([Role.ADMIN, Role.STAFF, Role.MERCHANT]);
    const merchantId = merchant.id;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "กรุณาระบุรหัสโทเค็นเพื่อตรวจสอบสถานะ",
      }, { status: 400 });
    }

    const redisKey = `qr:token:${token}`;
    const rawData = await redis.get(redisKey);

    if (!rawData) {
      return NextResponse.json({
        success: true,
        status: "EXPIRED",
        message: "คิวอาร์โค้ดหมดอายุหรือไม่มีอยู่จริง",
      });
    }

    const payload = typeof rawData === "string" ? JSON.parse(rawData) : rawData;

    // Security check: ensure the token belongs to the merchant who generated it
    if (payload.operatorId !== merchantId) {
      return NextResponse.json({
        success: false,
        code: "FORBIDDEN_RESOURCE",
        message: "ไม่มีสิทธิ์ตรวจสอบคิวอาร์โค้ดนี้",
      }, { status: 403 });
    }

    let customerName = "";
    if (payload.status === "USED") {
      // Find the associated transaction to get the customer's display name
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const transaction = await prisma.transaction.findFirst({
        where: { tokenHash },
        include: { customer: true },
      });
      if (transaction) {
        customerName = transaction.customer?.displayName || transaction.customerPhoneNumber;
      }
    }

    return NextResponse.json({
      success: true,
      status: payload.status, // "PENDING" | "USED"
      points: payload.points || 1,
      customerName,
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "เกิดข้อผิดพลาดในการตรวจสอบสถานะคิวอาร์",
    }, { status: 500 });
  }
}
