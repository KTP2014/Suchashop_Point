import { NextResponse } from "next/server";
import { TransactionRepository } from "../../../../features/points/repository/transactionRepository";
import { redis } from "../../../../lib/redis";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";

const transactionRepository = new TransactionRepository();
const CACHE_TTL = 60; // 60 Seconds cache

export async function GET(request: Request) {
  try {
    const merchantId = request.headers.get("x-user-id");

    if (!merchantId) {
      return NextResponse.json({
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message: "Merchant authentication is missing.",
      }, { status: 401 });
    }

    const cacheKey = `merchant:dashboard:${merchantId}:today`;

    // Try reading from cache first
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        const payload = typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
        return NextResponse.json({
          success: true,
          fromCache: true,
          ...payload,
        });
      }
    } catch (cacheError) {
      logger.warn("MERCHANT_DASHBOARD_CACHE_READ_FAILED", { merchantId }, cacheError as Error);
    }

    // Fetch fresh stats from single-collection MongoDB indexes
    const stats = await transactionRepository.getTodaySummary(merchantId);

    // Save to cache
    try {
      await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL });
    } catch (cacheError) {
      logger.warn("MERCHANT_DASHBOARD_CACHE_WRITE_FAILED", { merchantId }, cacheError as Error);
    }

    return NextResponse.json({
      success: true,
      fromCache: false,
      ...stats,
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("MERCHANT_DASHBOARD_FAILED", {}, err);

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
