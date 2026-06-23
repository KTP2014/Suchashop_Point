import { UserRepository } from "../../auth/repository/userRepository";
import { TransactionRepository } from "../repository/transactionRepository";
import { ConflictError, ValidationError } from "../../../lib/errors";
import { redis } from "../../../lib/redis";
import { prisma } from "../../../lib/prisma";
import { logger } from "../../../lib/logger";
import { TransactionType, Role } from "@prisma/client";
import * as crypto from "crypto";

export class PointsMutationService {
  private userRepository = new UserRepository();
  private transactionRepository = new TransactionRepository();

  private readonly LOCK_DURATION = 15; // 15 seconds lock duration
  private readonly MAX_RETRIES = 3;     // OCC Retries

  /**
   * Process scan and claim points from a Merchant Earn QR code.
   * Supports custom points delta defined by the generating merchant.
   */
  async processEarnToken(customerId: string, rawToken: string): Promise<any> {
    const tokenKey = `qr:token:${rawToken}`;
    const now = Math.floor(Date.now() / 1000);
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 1. Redis Atomic State Machine Transition
    const luaScript = `
      local val = redis.call("GET", KEYS[1])
      if not val then
          return 0
      end
      local data = cjson.decode(val)
      local now = tonumber(ARGV[1])
      local lockDuration = tonumber(ARGV[2])
      
      if data.status == "USED" then
          return 3
      elseif data.status == "PROCESSING" then
          local lockedUntil = tonumber(data.lockedUntil or 0)
          if now < lockedUntil then
              return 2
          end
      end
      
      data.status = "PROCESSING"
      data.lockedUntil = now + lockDuration
      local ttl = redis.call("TTL", KEYS[1])
      if ttl > 0 then
          redis.call("SET", KEYS[1], cjson.encode(data), "EX", ttl)
      else
          redis.call("SET", KEYS[1], cjson.encode(data))
      end
      return 1
    `;

    const lockResult = await redis.eval(luaScript, [tokenKey], [now.toString(), this.LOCK_DURATION.toString()]);

    if (lockResult === 0) {
      throw new ValidationError("QR code has expired or is invalid.");
    } else if (lockResult === 2) {
      throw new ConflictError("This QR code is currently being processed by another scan.");
    } else if (lockResult === 3) {
      throw new ConflictError("This QR code has already been scanned and used.");
    }

    const tokenDataRaw = await redis.get(tokenKey);
    const tokenData = typeof tokenDataRaw === "string" ? JSON.parse(tokenDataRaw) : tokenDataRaw;
    const operatorId = tokenData?.operatorId;
    const pointsDelta = tokenData?.points ?? 1; // Retrieve merchant-defined points count!

    if (!operatorId) {
      await this.revertRedisToken(tokenKey);
      throw new ValidationError("QR code payload is malformed.");
    }

    // 2. Database Write Block inside OCC transaction retry loop
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        return await prisma.$transaction(async (tx) => {
          const customer = await tx.user.findUnique({
            where: { id: customerId },
          });

          if (!customer || (customer.role !== Role.CUSTOMER && customer.role !== Role.STAFF && customer.role !== Role.ADMIN)) {
            throw new ValidationError("Target user is not a valid customer.");
          }

          const currentOld = customer.currentPoints;
          const pendingOld = customer.pendingPoints;
          let currentNew = currentOld + pointsDelta;
          let pendingNew = pendingOld;

          const isUpdated = await this.userRepository.updateUserPointsWithLock(
            tx,
            customerId,
            currentNew,
            pendingNew,
            customer.version
          );

          if (!isUpdated) {
            throw new Error("CONCURRENCY_COLLISION");
          }

          const transaction = await this.transactionRepository.createTransaction(tx, {
            customerId,
            customerPhoneNumber: customer.phoneNumber ?? (customer.lineUserId ? `LINE:${customer.lineUserId}` : "LINE_USER"),
            type: TransactionType.EARN,
            currentChange: currentNew - currentOld,
            pendingChange: pendingNew - pendingOld,
            resultingCurrent: currentNew,
            resultingPending: pendingNew,
            tokenHash,
            operatorId,
          });

          // Transition Redis status to USED
          const remainingTtl = await redis.ttl(tokenKey);
          const finalPayload = { ...tokenData, status: "USED" };
          if (remainingTtl > 0) {
            await redis.set(tokenKey, JSON.stringify(finalPayload), { ex: remainingTtl });
          } else {
            await redis.set(tokenKey, JSON.stringify(finalPayload));
          }

          logger.info("POINT_MUTATION_EARN_SUCCESS", {
            customerId,
            operatorId,
            pointsDelta,
            currentNew,
            pendingNew,
          });

          return {
            success: true,
            transactionId: transaction.id,
            addedPoints: pointsDelta,
            resultingBalances: {
              currentPoints: currentNew,
              pendingPoints: pendingNew,
            },
          };
        });
      } catch (error: any) {
        if (error.message === "CONCURRENCY_COLLISION") {
          retries++;
          const delay = Math.floor(Math.random() * 20) + 50 * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        await this.revertRedisToken(tokenKey);
        throw error;
      }
    }

    await this.revertRedisToken(tokenKey);
    throw new ConflictError("Too many concurrent updates on this account. Please scan again.");
  }

  /**
   * Process a Customer Redemption Coupon scanned by a Merchant.
   * Consumes 5 active points (reset to 0) and refills from pending points.
   */
  async processScannedRedemption(merchantId: string, rawToken: string): Promise<any> {
    const tokenKey = `qr:token:${rawToken}`;
    const now = Math.floor(Date.now() / 1000);
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 1. Redis Atomic Lock Check
    const luaScript = `
      local val = redis.call("GET", KEYS[1])
      if not val then
          return 0
      end
      local data = cjson.decode(val)
      local now = tonumber(ARGV[1])
      local lockDuration = tonumber(ARGV[2])
      
      if data.status == "USED" then
          return 3
      elseif data.status == "PROCESSING" then
          local lockedUntil = tonumber(data.lockedUntil or 0)
          if now < lockedUntil then
              return 2
          end
      end
      
      data.status = "PROCESSING"
      data.lockedUntil = now + lockDuration
      local ttl = redis.call("TTL", KEYS[1])
      if ttl > 0 then
          redis.call("SET", KEYS[1], cjson.encode(data), "EX", ttl)
      else
          redis.call("SET", KEYS[1], cjson.encode(data))
      end
      return 1
    `;

    const lockResult = await redis.eval(luaScript, [tokenKey], [now.toString(), this.LOCK_DURATION.toString()]);

    if (lockResult === 0) {
      throw new ValidationError("Redemption coupon has expired or is invalid.");
    } else if (lockResult === 2) {
      throw new ConflictError("This coupon is currently being processed by another scan.");
    } else if (lockResult === 3) {
      throw new ConflictError("This coupon has already been used.");
    }

    const tokenDataRaw = await redis.get(tokenKey);
    const tokenData = typeof tokenDataRaw === "string" ? JSON.parse(tokenDataRaw) : tokenDataRaw;
    const customerId = tokenData?.customerId;

    if (!customerId) {
      await this.revertRedisToken(tokenKey);
      throw new ValidationError("Redemption coupon payload is malformed.");
    }

    // 2. Database transaction OCC execution
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        return await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({
            where: { id: customerId },
          });

          if (!user || (user.role !== Role.CUSTOMER && user.role !== Role.STAFF && user.role !== Role.ADMIN)) {
            throw new ValidationError("User is not a valid customer.");
          }

          const rewardPoints = tokenData?.rewardPoints ?? 5;
          const rewardName = tokenData?.rewardName ?? "ของรางวัล";

          // 1. Consolidate pending points into current points inside transaction if needed
          let currentPoints = user.currentPoints;
          let pendingOld = user.pendingPoints;
          if (pendingOld > 0) {
            const consolidatedUser = await tx.user.update({
              where: { id: customerId },
              data: {
                currentPoints: { increment: pendingOld },
                pendingPoints: 0,
                version: { increment: 1 },
              },
            });
            currentPoints = consolidatedUser.currentPoints;
          }

          // 2. Atomic Point Deduction check and update
          let updatedUser;
          try {
            updatedUser = await tx.user.update({
              where: {
                id: customerId,
                currentPoints: { gte: rewardPoints },
              },
              data: {
                currentPoints: { decrement: rewardPoints },
                version: { increment: 1 },
              },
            });
          } catch (e: any) {
            throw new ConflictError(`คะแนนสะสมหลักไม่เพียงพอสำหรับการแลกของรางวัล (ต้องการ ${rewardPoints} คะแนน)`);
          }

          // 3. Write redemption transaction ledger mapped to the scanning merchant!
          const transaction = await this.transactionRepository.createTransaction(tx, {
            customerId,
            customerPhoneNumber: user.phoneNumber ?? (user.lineUserId ? `LINE:${user.lineUserId}` : "LINE_USER"),
            type: TransactionType.REDEEM,
            currentChange: -rewardPoints,
            pendingChange: -pendingOld,
            resultingCurrent: updatedUser.currentPoints,
            resultingPending: 0,
            tokenHash,
            operatorId: merchantId,
          });

          // Transition Redis status to USED
          const remainingTtl = await redis.ttl(tokenKey);
          const finalPayload = { ...tokenData, status: "USED" };
          if (remainingTtl > 0) {
            await redis.set(tokenKey, JSON.stringify(finalPayload), { ex: remainingTtl });
          } else {
            await redis.set(tokenKey, JSON.stringify(finalPayload));
          }

          logger.info("POINT_MUTATION_REDEEM_SUCCESS", {
            customerId,
            operatorId: merchantId,
            rewardName,
            rewardPoints,
            currentNew: updatedUser.currentPoints,
            pendingNew: 0,
          });

          return {
            success: true,
            message: `แลกรับของรางวัล "${rewardName}" สำเร็จ!`,
            rewardName,
            balances: {
              currentPoints: updatedUser.currentPoints,
              pendingPoints: 0,
            },
          };
        });
      } catch (error: any) {
        if (error.message === "CONCURRENCY_COLLISION") {
          retries++;
          const delay = Math.floor(Math.random() * 20) + 50 * Math.pow(2, retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        await this.revertRedisToken(tokenKey);
        throw error;
      }
    }

    await this.revertRedisToken(tokenKey);
    throw new ConflictError("Concurrency conflict during redemption scan. Please retry.");
  }

  /**
   * Administrative Point Reset executed by an authorized Merchant.
   */
  async administrativeReset(customerId: string, operatorId: string): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: customerId },
      });

      if (!user || (user.role !== Role.CUSTOMER && user.role !== Role.STAFF && user.role !== Role.ADMIN)) {
        throw new ValidationError("User is not a valid customer.");
      }

      const currentChange = -user.currentPoints;
      const pendingChange = -user.pendingPoints;

      await this.userRepository.updateUserPointsDirect(tx, customerId, 0, 0);

      const transaction = await this.transactionRepository.createTransaction(tx, {
        customerId,
        customerPhoneNumber: user.phoneNumber ?? (user.lineUserId ? `LINE:${user.lineUserId}` : "LINE_USER"),
        type: TransactionType.RESET,
        currentChange,
        pendingChange,
        resultingCurrent: 0,
        resultingPending: 0,
        tokenHash: null,
        operatorId,
      });

      logger.info("POINT_MUTATION_ADMIN_RESET", {
        customerId,
        operatorId,
        currentChange,
        pendingChange,
      });

      return {
        success: true,
        message: "Administrative reset executed successfully",
        customer: {
          id: customerId,
          currentPoints: 0,
          pendingPoints: 0,
        },
      };
    });
  }

  /**
   * Administrative Point Adjustment executed by support / merchant operations.
   */
  async administrativeAdjustment(
    customerId: string,
    operatorId: string,
    currentDelta: number,
    pendingDelta: number
  ): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: customerId },
      });

      if (!user || (user.role !== Role.CUSTOMER && user.role !== Role.STAFF && user.role !== Role.ADMIN)) {
        throw new ValidationError("User is not a valid customer.");
      }

      const maxPoints = Number(process.env.NEXT_PUBLIC_MAX_POINTS || 5);
      const currentNew = Math.max(0, Math.min(maxPoints, user.currentPoints + currentDelta));
      const pendingNew = Math.max(0, user.pendingPoints + pendingDelta);

      await this.userRepository.updateUserPointsDirect(tx, customerId, currentNew, pendingNew);

      await this.transactionRepository.createTransaction(tx, {
        customerId,
        customerPhoneNumber: user.phoneNumber ?? (user.lineUserId ? `LINE:${user.lineUserId}` : "LINE_USER"),
        type: TransactionType.ADJUSTMENT,
        currentChange: currentNew - user.currentPoints,
        pendingChange: pendingNew - user.pendingPoints,
        resultingCurrent: currentNew,
        resultingPending: pendingNew,
        tokenHash: null,
        operatorId,
      });

      return {
        success: true,
        message: "Administrative adjustment completed",
        customer: {
          id: customerId,
          currentPoints: currentNew,
          pendingPoints: pendingNew,
        },
      };
    });
  }

  private async revertRedisToken(tokenKey: string) {
    const rawVal = await redis.get(tokenKey);
    if (rawVal) {
      const data = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (data.status === "PROCESSING") {
        data.status = "PENDING";
        data.lockedUntil = 0;
        const ttl = await redis.ttl(tokenKey);
        if (ttl > 0) {
          await redis.set(tokenKey, JSON.stringify(data), { ex: ttl });
        } else {
          await redis.set(tokenKey, JSON.stringify(data));
        }
      }
    }
  }
}
