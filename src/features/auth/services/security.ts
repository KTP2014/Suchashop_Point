import { cookies } from "next/headers";
import { verifyToken, signToken } from "./jwt";
import { prisma } from "../../../lib/prisma";
import { AuthenticationError, AuthorizationError } from "../../../lib/errors";
import { Role, User } from "@prisma/client";

/**
 * Secures an API route by extracting the session cookie, decrypting it,
 * and performing a real-time database lookup to ensure role validation.
 * @param allowedRoles List of roles permitted to access this endpoint
 */
export async function secureRoute(allowedRoles: Role[]): Promise<User> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) {
    throw new AuthenticationError("Authentication token is missing.");
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch (error) {
    throw new AuthenticationError("Authentication session is invalid or expired.");
  }

  const userId = payload.userId;
  if (!userId) {
    throw new AuthenticationError("Invalid session payload.");
  }

  // Strict MongoDB Database lookup
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AuthenticationError("User account not found.");
  }

  // Dynamic Cookie Sync: If DB role differs from the JWT payload role, silently update cookie
  if (payload.role !== user.role) {
    try {
      const CUSTOMER_EXPIRY = 2592000; // 30 days
      const newPayload = {
        userId: user.id,
        phoneNumber: user.phoneNumber || "",
        role: user.role,
      };
      const newToken = await signToken(newPayload, CUSTOMER_EXPIRY);
      cookieStore.set("session", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: CUSTOMER_EXPIRY,
        path: "/",
      });
    } catch (cookieError) {
      console.error("Failed to silently update cookie role:", cookieError);
    }
  }

  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError("Access denied: Insufficient permissions.");
  }

  return user;
}
