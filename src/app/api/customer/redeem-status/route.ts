import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { redis } from "../../../../lib/redis";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";

export async function GET(request: Request) {
  try {
    // Authenticate caller (allowing CUSTOMER, STAFF, and ADMIN roles)
    const customer = await secureRoute([Role.CUSTOMER, Role.STAFF, Role.ADMIN]);
    const customerId = customer.id;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "กรุณาระบุรหัสคูปองเพื่อตรวจสอบสถานะ",
      }, { status: 400 });
    }

    const redisKey = `qr:token:${token}`;
    const rawData = await redis.get(redisKey);

    if (!rawData) {
      // If token not found in Redis, it has expired (since it has a 5-min TTL)
      return NextResponse.json({
        success: true,
        status: "EXPIRED",
        message: "คูปองหมดอายุหรือไม่มีอยู่จริง",
      });
    }

    const payload = typeof rawData === "string" ? JSON.parse(rawData) : rawData;

    // Security check: ensure this redemption coupon belongs to the logged-in customer
    if (payload.customerId !== customerId) {
      return NextResponse.json({
        success: false,
        code: "FORBIDDEN_RESOURCE",
        message: "ไม่มีสิทธิ์ตรวจสอบคูปองของผู้อื่น",
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      status: payload.status, // "PENDING" | "PROCESSING" | "USED"
    });

  } catch (error: any) {
    logger.error("GET_REDEEM_STATUS_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการตรวจสอบสถานะคูปอง",
    }, { status: 500 });
  }
}
