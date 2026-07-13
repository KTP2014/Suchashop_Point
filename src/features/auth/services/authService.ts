import { UserRepository } from "../repository/userRepository";
import { AuthenticationError } from "../../../lib/errors";
import { signToken, JWTPayload } from "./jwt";
import * as bcrypt from "bcryptjs";
import { User, Role } from "@prisma/client";

export class AuthService {
  private userRepository = new UserRepository();

  // Sessions standard parameters
  public readonly CUSTOMER_EXPIRY = 2592000; // 30 Days

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
      // Return authentication mismatch if user is actually a staff/admin/merchant
      if (user.role !== Role.CUSTOMER) {
        throw new AuthenticationError("Phone number is associated with a Staff/Admin account.");
      }

      // Cryptographic verification comparing input with birthdate hash
      if (!user.birthdateHash || !bcrypt.compareSync(birthdate, user.birthdateHash)) {
        throw new AuthenticationError("Invalid phone number or birthdate.");
      }
    }

    const payload: JWTPayload = {
      userId: user.id,
      phoneNumber: user.phoneNumber ?? "",
      role: Role.CUSTOMER,
    };

    const token = await signToken(payload, this.CUSTOMER_EXPIRY);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, birthdateHash, ...sanitizedUser } = user;

    return { token, user: sanitizedUser };
  }
}
