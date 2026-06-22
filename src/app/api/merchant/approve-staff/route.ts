import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { prisma } from "../../../../lib/prisma";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";
import { z } from "zod";

const ApproveStaffSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "User ID รูปแบบไม่ถูกต้อง"),
  approvedRole: z.enum(["STAFF", "ADMIN", "REJECT"]),
}).strict();

export async function POST(request: Request) {
  try {
    // Authenticate caller: strictly check if caller is an ADMIN in MongoDB
    await secureRoute([Role.ADMIN]);

    const body = await request.json();
    const parsed = ApproveStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { userId, approvedRole } = parsed.data;

    // Check if target user exists and is pending
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "ไม่พบผู้ใช้ที่ต้องการอนุมัติ",
      }, { status: 404 });
    }

    if (targetUser.role !== Role.PENDING_APPROVAL) {
      return NextResponse.json({
        success: false,
        code: "INVALID_USER_STATE",
        message: "ผู้ใช้งานรายนี้ไม่ได้อยู่ในสถานะรอการอนุมัติสิทธิ์",
      }, { status: 400 });
    }

    let nextRole: Role;
    if (approvedRole === "REJECT") {
      nextRole = Role.CUSTOMER;
    } else {
      nextRole = approvedRole as Role;
    }

    // Update target user role
    await prisma.user.update({
      where: { id: userId },
      data: { role: nextRole },
    });

    logger.info("STAFF_APPROVED", { targetUserId: userId, approvedRole });

    return NextResponse.json({
      success: true,
      message: approvedRole === "REJECT" ? "ปฏิเสธคำขอสิทธิ์เรียบร้อยแล้ว" : "อนุมัติสิทธิ์พนักงานเรียบร้อยแล้ว",
    });

  } catch (error: any) {
    logger.error("APPROVE_STAFF_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการดำเนินการอนุมัติพนักงาน",
    }, { status: 500 });
  }
}
