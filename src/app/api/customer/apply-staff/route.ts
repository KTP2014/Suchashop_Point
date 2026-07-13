import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { prisma } from "../../../../lib/prisma";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";
import { z } from "zod";

const ApplyStaffSchema = z.object({
  code: z.string(),
  displayName: z.string().min(1, "กรุณากรอกชื่อสำหรับแสดงผล"),
}).strict();

export async function POST(request: Request) {
  try {
    // Authenticate user via secure DB lookup
    const user = await secureRoute([Role.CUSTOMER, Role.PENDING_APPROVAL]);

    const body = await request.json();
    const parsed = ApplyStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { code, displayName } = parsed.data;

    if (code !== "3737") {
      return NextResponse.json({
        success: false,
        code: "INVALID_SECRET_CODE",
        message: "รหัสลับพนักงานไม่ถูกต้อง",
      }, { status: 400 });
    }

    // Set role to PENDING_APPROVAL and store the display name
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        role: Role.PENDING_APPROVAL,
        displayName,
      },
    });

    return NextResponse.json({
      success: true,
      role: updatedUser.role,
      displayName: updatedUser.displayName,
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.warn("CUSTOMER_APPLY_STAFF_FAILED", {}, err);

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
      message: "เกิดข้อผิดพลาดในการสมัครสิทธิ์พนักงาน",
    }, { status: 500 });
  }
}
