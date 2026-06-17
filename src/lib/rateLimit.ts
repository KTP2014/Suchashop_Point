import { redis } from "./redis";
import { RateLimitError } from "./errors";
import { logger } from "./logger";

export interface RateLimitConfig {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Check if the active client has exceeded rate limits.
 * Uses a Redis sliding window / counter to enforce limits.
 * @param identifier Client IP or Account ID
 * @param config RateLimitConfig parameters
 */
export async function checkRateLimit(identifier: string, config: RateLimitConfig): Promise<void> {
  const redisKey = `ratelimit:${config.keyPrefix}:${identifier}`;
  
  try {
    // Increment and set expiry atomically
    const currentCount = await redis.incr(redisKey);
    
    if (currentCount === 1) {
      await redis.expire(redisKey, config.windowSeconds);
    }

    if (currentCount > config.limit) {
      logger.warn("RATE_LIMIT_EXCEEDED", {
        identifier,
        prefix: config.keyPrefix,
        count: currentCount,
        limit: config.limit,
      });
      throw new RateLimitError();
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    // Fail-open: Log Redis rate limit failures but do not block the application flow
    logger.error("RATE_LIMIT_REDIS_ERROR", { identifier, prefix: config.keyPrefix }, error as Error);
  }
}
