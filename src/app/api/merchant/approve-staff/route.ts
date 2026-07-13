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
    const caller = await secureRoute([Role.ADMIN]);
    const callerId = caller.id;

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

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "ไม่พบผู้ใช้ที่ต้องการจัดตั้งบทบาท",
      }, { status: 404 });
    }

    if (targetUser.role !== Role.PENDING_APPROVAL && targetUser.role !== Role.STAFF && targetUser.role !== Role.ADMIN) {
      return NextResponse.json({
        success: false,
        code: "INVALID_USER_STATE",
        message: "ไม่สามารถเปลี่ยนบทบาทของผู้ใช้งานรายนี้ได้",
      }, { status: 400 });
    }

    // Safety: prevent self-demotion/self-removal of ADMIN role
    if (userId === callerId && approvedRole !== "ADMIN") {
      return NextResponse.json({
        success: false,
        code: "SELF_DEMOTION_BLOCKED",
        message: "ไม่สามารถลดสิทธิ์หรือถอดสิทธิ์ของตัวเองได้เพื่อความปลอดภัยในการเข้าถึงระบบดูแลร้านค้า",
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

    logger.info("STAFF_ROLE_MUTATED", { targetUserId: userId, approvedRole, nextRole });

    return NextResponse.json({
      success: true,
      message: approvedRole === "REJECT" ? "ถอดถอนสิทธิ์เรียบร้อยแล้ว" : "ปรับเปลี่ยนสิทธิ์พนักงานเรียบร้อยแล้ว",
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("APPROVE_STAFF_FAILED", {}, err);

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
