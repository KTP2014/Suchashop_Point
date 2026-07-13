import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { prisma } from "../../../../lib/prisma";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    // Authenticate caller: strictly check if caller is an ADMIN in MongoDB
    await secureRoute([Role.ADMIN]);

    // Query all staff and admin users
    const staffList = await prisma.user.findMany({
      where: {
        role: {
          in: [Role.STAFF, Role.ADMIN],
        },
      },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      users: staffList,
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("GET_STAFF_LIST_FAILED", {}, err);

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
      message: "เกิดข้อผิดพลาดในการดึงรายชื่อพนักงาน",
    }, { status: 500 });
  }
}
