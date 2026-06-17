import { SignJWT, jwtVerify } from "jose";

const getSecretBytes = (): Uint8Array => {
  const secret = process.env.JWT_SECRET || "fallback-temporary-secret-for-static-compilation-purposes";
  return new TextEncoder().encode(secret);
};

export interface JWTPayload {
  userId: string;
  phoneNumber?: string;
  role: "CUSTOMER" | "MERCHANT";
}

/**
 * Sign a new JWT token
 * @param payload JWTPayload parameters
 * @param durationInSeconds Expire duration (e.g. 30 days or 12 hours)
 */
export async function signToken(payload: JWTPayload, durationInSeconds: number): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${durationInSeconds}s`)
    .sign(getSecretBytes());
}

/**
 * Verify and decode an active JWT token
 * @param token Raw cookie token string
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getSecretBytes());
  return payload as unknown as JWTPayload;
}
