import { cookies } from "next/headers";
import { verifyToken } from "./jwt";
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

  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError("Access denied: Insufficient permissions.");
  }

  return user;
}
