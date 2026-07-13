import { prisma } from "../../../lib/prisma";
import { Role, User, Prisma } from "@prisma/client";

export class UserRepository {
  /**
   * Find a user by phone number
   */
  async findByPhone(phoneNumber: string): Promise<User | null> {
    return await prisma.user.findFirst({
      where: { phoneNumber },
    });
  }

  /**
   * Find a user by LINE User ID
   */
  async findByLineUserId(lineUserId: string): Promise<User | null> {
    return await prisma.user.findFirst({
      where: { lineUserId },
    });
  }

  /**
   * Find a user by unique database ID
   */
  async findById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new Customer user via phone/birthdate
   */
  async createCustomer(phoneNumber: string, birthdateHash: string): Promise<User> {
    return await prisma.user.create({
      data: {
        phoneNumber,
        role: Role.CUSTOMER,
        birthdateHash,
        currentPoints: 0,
        pendingPoints: 0,
        version: 0,
      },
    });
  }

  /**
   * Create a new Customer user via LINE Login
   */
  async createCustomerWithLine(lineUserId: string): Promise<User> {
    return await prisma.user.create({
      data: {
        lineUserId,
        role: Role.CUSTOMER,
        currentPoints: 0,
        pendingPoints: 0,
        version: 0,
      },
    });
  }

  /**
   * Update point balances with strict Optimistic Concurrency Control (OCC) version matches.
   * Executed within the minimal transactional boundary inside Services.
   */
  async updateUserPointsWithLock(
    tx: Prisma.TransactionClient,
    userId: string,
    currentPoints: number,
    pendingPoints: number,
    expectedVersion: number
  ): Promise<boolean> {
    const result = await tx.user.updateMany({
      where: {
        id: userId,
        version: expectedVersion,
      },
      data: {
        currentPoints,
        pendingPoints,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  /**
   * Force update point balances directly (Administrative actions)
   */
  async updateUserPointsDirect(
    tx: Prisma.TransactionClient,
    userId: string,
    currentPoints: number,
    pendingPoints: number
  ): Promise<User> {
    return await tx.user.update({
      where: { id: userId },
      data: {
        currentPoints,
        pendingPoints,
        version: { increment: 1 },
      },
    });
  }
}
