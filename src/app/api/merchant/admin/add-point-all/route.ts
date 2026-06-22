import { NextResponse } from "next/server";
import { secureRoute } from "../../../../../features/auth/services/security";
import { prisma } from "../../../../../lib/prisma";
import { AppError } from "../../../../../lib/errors";
import { logger } from "../../../../../lib/logger";
import { Role, TransactionType } from "@prisma/client";
import { z } from "zod";

const AddPointAllSchema = z.object({
  points: z.number().min(1).max(5),
}).strict();

export async function POST(request: Request) {
  try {
    // Authenticate caller: strictly check if caller is an ADMIN in MongoDB
    const admin = await secureRoute([Role.ADMIN]);
    const adminId = admin.id;

    const body = await request.json();
    const parsed = AddPointAllSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { points } = parsed.data;

    // Load maximum points limit dynamically from configuration environment variables
    const maxPoints = Number(process.env.NEXT_PUBLIC_MAX_POINTS || 5);

    // 1. Fetch all customer, staff, and admin accounts (acting as point collectors)
    const targetRoles = [Role.CUSTOMER, Role.STAFF, Role.ADMIN];
    const customers = await prisma.user.findMany({
      where: { role: { in: targetRoles } },
    });

    if (customers.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "ไม่มีลูกค้าในระบบให้เพิ่มแต้ม",
      });
    }

    const transactionsData = [];

    // 2. Calculate transaction records for the audit ledger
    for (const c of customers) {
      const currentOld = c.currentPoints;
      const pendingOld = c.pendingPoints;

      let currentNew = currentOld + points;
      let pendingNew = pendingOld;

      if (currentNew > maxPoints) {
        pendingNew = pendingOld + (currentNew - maxPoints);
        currentNew = maxPoints;
      }

      transactionsData.push({
        customerId: c.id,
        customerPhoneNumber: c.phoneNumber ?? (c.lineUserId ? `LINE:${c.lineUserId}` : "LINE_USER"),
        type: TransactionType.EARN,
        currentChange: currentNew - currentOld,
        pendingChange: pendingNew - pendingOld,
        resultingCurrent: currentNew,
        resultingPending: pendingNew,
        operatorId: adminId,
      });
    }

    // 3. Prepare grouped updateMany promises for database efficiency
    const updatePromises = [];

    // Handle any users who might exceed maxPoints due to changes in config
    updatePromises.push(
      prisma.user.updateMany({
        where: { role: { in: targetRoles }, currentPoints: { gt: maxPoints } },
        data: {
          pendingPoints: { increment: points },
          version: { increment: 1 },
        },
      })
    );

    for (let x = 0; x <= maxPoints; x++) {
      const currentOld = x;
      let currentNew = currentOld + points;
      let overflow = 0;
      if (currentNew > maxPoints) {
        overflow = currentNew - maxPoints;
        currentNew = maxPoints;
      }

      if (overflow > 0) {
        updatePromises.push(
          prisma.user.updateMany({
            where: { role: { in: targetRoles }, currentPoints: currentOld },
            data: {
              currentPoints: currentNew,
              pendingPoints: { increment: overflow },
              version: { increment: 1 },
            },
          })
        );
      } else {
        updatePromises.push(
          prisma.user.updateMany({
            where: { role: { in: targetRoles }, currentPoints: currentOld },
            data: {
              currentPoints: currentNew,
              version: { increment: 1 },
            },
          })
        );
      }
    }

    // 4. Execute all updates and ledger creation in a single transaction
    if (updatePromises.length > 0) {
      await prisma.$transaction([
        ...updatePromises,
        prisma.transaction.createMany({ data: transactionsData }) as any,
      ]);
    }

    logger.info("ADMIN_ADD_POINTS_ALL_SUCCESS", { adminId, addedPoints: points, count: customers.length });

    return NextResponse.json({
      success: true,
      count: customers.length,
      message: `เพิ่มแต้มให้กับลูกค้าทั้งหมดสำเร็จ (+${points} แต้ม, ${customers.length} บัญชี)`,
    });

  } catch (error: any) {
    logger.error("ADMIN_ADD_POINTS_ALL_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการเพิ่มแต้มลูกค้าทั้งหมด",
    }, { status: 500 });
  }
}
