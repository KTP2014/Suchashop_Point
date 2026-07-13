import { NextResponse } from "next/server";
import { TransactionRepository } from "../../../../features/points/repository/transactionRepository";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { z } from "zod";

const transactionRepository = new TransactionRepository();

// Query schema with default parameters
const QuerySchema = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v, 10) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v, 10) : 10),
  searchName: z.string().optional(),
  actionType: z.enum(["EARN", "REDEEM", "RESET", "ADJUSTMENT"]).optional(),
  sortBy: z.enum(["createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export async function GET(request: Request) {
  try {
    const merchantId = request.headers.get("x-user-id");
    const userRole = request.headers.get("x-user-role");

    if (!merchantId) {
      return NextResponse.json({
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message: "Merchant authentication is missing.",
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paramsObj = Object.fromEntries(searchParams.entries());

    // Validate parameters
    const parsed = QuerySchema.safeParse(paramsObj);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "Invalid query parameters.",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { page, limit, searchName, actionType, sortBy, sortOrder } = parsed.data;

    // Expand view: if caller is ADMIN or STAFF, show all transactions of the shop.
    // Otherwise (e.g. MERCHANT role or raw merchantId), show only their own operations.
    const queryOperatorId = (userRole === "ADMIN" || userRole === "STAFF") ? undefined : merchantId;

    // Direct single-collection indexed history retrieve
    const result = await transactionRepository.findMerchantHistory(queryOperatorId, {
      page,
      limit,
      searchName,
      actionType,
      sortBy,
      sortOrder,
    });

    const totalPages = Math.ceil(result.total / limit);

    return NextResponse.json({
      success: true,
      pagination: {
        page,
        limit,
        totalPages,
        totalRecords: result.total,
      },
      transactions: result.transactions,
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("MERCHANT_HISTORY_FAILED", {}, err);

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
      message: "An unexpected error occurred.",
    }, { status: 500 });
  }
}
