import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { prisma } from "../../../../lib/prisma";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";

export async function GET(request: Request) {
  try {
    // Authenticate caller: strictly check if caller is an ADMIN in MongoDB
    await secureRoute([Role.ADMIN]);

    // Query all users awaiting staff approval
    const pendingUsers = await prisma.user.findMany({
      where: { role: Role.PENDING_APPROVAL },
      select: {
        id: true,
        lineUserId: true,
        displayName: true,
        phoneNumber: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      users: pendingUsers,
    });

  } catch (error: any) {
    logger.error("GET_PENDING_STAFF_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการดึงรายชื่อพนักงานที่รอการอนุมัติ",
    }, { status: 500 });
  }
}
