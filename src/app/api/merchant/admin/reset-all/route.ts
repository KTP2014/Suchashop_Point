import { NextResponse } from "next/server";
import { secureRoute } from "../../../../../features/auth/services/security";
import { prisma } from "../../../../../lib/prisma";
import { AppError } from "../../../../../lib/errors";
import { logger } from "../../../../../lib/logger";
import { Role, TransactionType } from "@prisma/client";

export async function POST(request: Request) {
  try {
    // Authenticate caller: strictly check if caller is an ADMIN in MongoDB
    const admin = await secureRoute([Role.ADMIN]);
    const adminId = admin.id;

    // 1. Fetch all customer points details to calculate changes for ledger
    const targetRoles = [Role.CUSTOMER, Role.STAFF, Role.ADMIN];
    const customers = await prisma.user.findMany({
      where: { role: { in: targetRoles } },
      select: {
        id: true,
        phoneNumber: true,
        lineUserId: true,
        currentPoints: true,
        pendingPoints: true,
      },
    });

    if (customers.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "ไม่มีลูกค้าในระบบให้ทำการรีเซ็ตแต้ม",
      });
    }

    // 2. Perform bulk reset using updateMany (highly efficient)
    await prisma.user.updateMany({
      where: { role: { in: targetRoles } },
      data: {
        currentPoints: 0,
        pendingPoints: 0,
        version: { increment: 1 },
      },
    });

    // 3. Prepare bulk transaction entries
    const transactionsData = customers.map((c) => ({
      customerId: c.id,
      customerPhoneNumber: c.phoneNumber ?? (c.lineUserId ? `LINE:${c.lineUserId}` : "LINE_USER"),
      type: TransactionType.RESET,
      currentChange: -c.currentPoints,
      pendingChange: -c.pendingPoints,
      resultingCurrent: 0,
      resultingPending: 0,
      operatorId: adminId,
    }));

    // 4. Batch insert all audit transaction entries (using createMany)
    await prisma.transaction.createMany({
      data: transactionsData,
    });

    logger.info("ADMIN_RESET_ALL_POINTS_SUCCESS", { adminId, count: customers.length });

    return NextResponse.json({
      success: true,
      count: customers.length,
      message: `รีเซ็ตแต้มลูกค้าทั้งหมดสำเร็จ (${customers.length} บัญชี)`,
    });

  } catch (error: any) {
    logger.error("ADMIN_RESET_ALL_POINTS_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการรีเซ็ตแต้มลูกค้าทั้งหมด",
    }, { status: 500 });
  }
}
