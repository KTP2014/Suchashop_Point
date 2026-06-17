import { redis } from "../../../lib/redis";
import * as crypto from "crypto";

export interface QRTokenPayload {
  operatorId?: string; // Present on EARN tokens
  customerId?: string; // Present on REDEEM tokens
  points?: number;     // Present on EARN tokens
  issuedAt: string;
  status: "PENDING" | "PROCESSING" | "USED";
  lockedUntil?: number;
}

export class TokenGenerationService {
  private readonly TOKEN_TTL = 300; // 5 Minutes (300 seconds)

  /**
   * Generate a secure dynamic QR token for points earning with a merchant-defined points delta.
   */
  async generateEarnToken(operatorId: string, points: number = 1): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL * 1000);

    const payload: QRTokenPayload = {
      operatorId,
      points,
      issuedAt: new Date().toISOString(),
      status: "PENDING",
    };

    const redisKey = `qr:token:${rawToken}`;
    await redis.set(redisKey, JSON.stringify(payload), { ex: this.TOKEN_TTL });

    return { token: rawToken, expiresAt };
  }

  /**
   * Generate a secure dynamic redemption token for customer reward claiming.
   */
  async generateRedeemToken(customerId: string): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL * 1000);

    const payload: QRTokenPayload = {
      customerId,
      issuedAt: new Date().toISOString(),
      status: "PENDING",
    };

    const redisKey = `qr:token:${rawToken}`;
    await redis.set(redisKey, JSON.stringify(payload), { ex: this.TOKEN_TTL });

    return { token: rawToken, expiresAt };
  }
}
