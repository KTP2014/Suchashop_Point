import { prisma } from "../../../lib/prisma";
import { Transaction, TransactionType } from "@prisma/client";

export interface HistoryFilter {
  page: number;
  limit: number;
  searchPhone?: string;
  actionType?: TransactionType;
  sortBy?: "createdAt";
  sortOrder?: "asc" | "desc";
}

export class TransactionRepository {
  /**
   * Insert a new points mutation transaction entry inside an active transaction database scope.
   */
  async createTransaction(
    tx: any,
    data: {
      customerId: string;
      customerPhoneNumber: string;
      type: TransactionType;
      currentChange: number;
      pendingChange: number;
      resultingCurrent: number;
      resultingPending: number;
      tokenHash?: string | null;
      operatorId?: string | null;
    }
  ): Promise<Transaction> {
    return await tx.transaction.create({
      data: {
        customerId: data.customerId,
        customerPhoneNumber: data.customerPhoneNumber,
        type: data.type,
        currentChange: data.currentChange,
        pendingChange: data.pendingChange,
        resultingCurrent: data.resultingCurrent,
        resultingPending: data.resultingPending,
        tokenHash: data.tokenHash ?? null,
        operatorId: data.operatorId ?? null,
      },
    });
  }

  /**
   * Find paginated, sorted, and filtered transaction history for a specific merchant operator.
   */
  async findMerchantHistory(
    operatorId: string,
    filter: HistoryFilter
  ): Promise<{ transactions: any[]; total: number }> {
    const { page, limit, searchPhone, actionType, sortBy = "createdAt", sortOrder = "desc" } = filter;
    const skip = (page - 1) * limit;

    // Direct single-collection indexed lookup matching merchant operators
    const where: any = {
      operatorId,
      ...(actionType && { type: actionType }),
      ...(searchPhone && {
        customerPhoneNumber: {
          startsWith: searchPhone,
        },
      }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions, total };
  }

  /**
   * Retrieve today's aggregated transaction summary statistics for a merchant dashboard.
   * Utilizes an index-covered date-range filter for maximum performance.
   */
  async getTodaySummary(operatorId: string): Promise<{
    todayTransactions: number;
    todayCustomers: number;
    todayEarns: number;
    todayRedeems: number;
    todayResets: number;
  }> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const where = {
      operatorId,
      createdAt: {
        gte: startOfToday,
        lte: endOfToday,
      },
    };

    // Query active records matching conditions
    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        customerId: true,
        type: true,
      },
    });

    const uniqueCustomers = new Set(transactions.map((tx) => tx.customerId));
    const earnCount = transactions.filter((tx) => tx.type === TransactionType.EARN).length;
    const redeemCount = transactions.filter((tx) => tx.type === TransactionType.REDEEM).length;
    const resetCount = transactions.filter((tx) => tx.type === TransactionType.RESET).length;

    return {
      todayTransactions: transactions.length,
      todayCustomers: uniqueCustomers.size,
      todayEarns: earnCount,
      todayRedeems: redeemCount,
      todayResets: resetCount,
    };
  }
}
