import { UserRepository } from "../repository/userRepository";
import { AuthenticationError } from "../../../lib/errors";
import { signToken, JWTPayload } from "./jwt";
import * as bcrypt from "bcryptjs";
import { User, Role } from "@prisma/client";

export class AuthService {
  private userRepository = new UserRepository();

  // Sessions standard parameters
  public readonly CUSTOMER_EXPIRY = 2592000; // 30 Days
  public readonly MERCHANT_EXPIRY = 43200;  // 12 Hours

  /**
   * Process Customer Authentications & Dynamic Auto-Registrations
   * @param phoneNumber E.164 phone string
   * @param birthdate DDMMYYYY birthdate string
   */
  async loginCustomer(phoneNumber: string, birthdate: string): Promise<{ token: string; user: Omit<User, "passwordHash" | "birthdateHash"> }> {
    let user = await this.userRepository.findByPhone(phoneNumber);

    if (!user) {
      // Dynamic Auto-Registration Flow
      const birthdateHash = bcrypt.hashSync(birthdate, 12);
      user = await this.userRepository.createCustomer(phoneNumber, birthdateHash);
    } else {
      // Return authentication mismatch if user is actually a merchant
      if (user.role !== Role.CUSTOMER) {
        throw new AuthenticationError("Phone number is associated with a Merchant account.");
      }

      // Cryptographic verification comparing input with birthdate hash
      if (!user.birthdateHash || !bcrypt.compareSync(birthdate, user.birthdateHash)) {
        throw new AuthenticationError("Invalid phone number or birthdate.");
      }
    }

    const payload: JWTPayload = {
      userId: user.id,
      phoneNumber: user.phoneNumber,
      role: Role.CUSTOMER,
    };

    const token = await signToken(payload, this.CUSTOMER_EXPIRY);
    const { passwordHash, birthdateHash, ...sanitizedUser } = user;

    return { token, user: sanitizedUser };
  }

  /**
   * Process Merchant Authentications (Pre-seeded only)
   * @param phoneNumber E.164 phone string
   * @param password Raw credentials string
   */
  async loginMerchant(phoneNumber: string, password: string): Promise<{ token: string; user: Omit<User, "passwordHash" | "birthdateHash"> }> {
    const user = await this.userRepository.findByPhone(phoneNumber);

    if (!user || user.role !== Role.MERCHANT) {
      throw new AuthenticationError("Invalid phone number or password.");
    }

    // Verify credentials matching hashed passwords
    if (!user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
      throw new AuthenticationError("Invalid phone number or password.");
    }

    const payload: JWTPayload = {
      userId: user.id,
      phoneNumber: user.phoneNumber,
      role: Role.MERCHANT,
    };

    const token = await signToken(payload, this.MERCHANT_EXPIRY);
    const { passwordHash, birthdateHash, ...sanitizedUser } = user;

    return { token, user: sanitizedUser };
  }
}
