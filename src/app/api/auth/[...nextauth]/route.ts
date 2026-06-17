import NextAuth, { NextAuthOptions } from "next-auth";
import LineProvider from "next-auth/providers/line";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { Role } from "@prisma/client";

const userRepository = new UserRepository();

export const authOptions: NextAuthOptions = {
  providers: [
    LineProvider({
      clientId: process.env.LINE_CLIENT_ID || "placeholder_id",
      clientSecret: process.env.LINE_CLIENT_SECRET || "placeholder_secret",
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "line") {
        const lineUserId = profile?.sub || account.providerAccountId;
        if (!lineUserId) return false;

        try {
          // Check if customer already exists in MongoDB
          let existingUser = await userRepository.findByLineUserId(lineUserId);

          if (!existingUser) {
            // Auto-Register new LINE user
            await userRepository.createCustomerWithLine(lineUserId);
          }
          return true;
        } catch (error) {
          console.error("LINE Sign In callback error:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // If logging in via line, fetch the MongoDB user and append their data to the JWT
      if (account?.provider === "line") {
        const lineUserId = profile?.sub || account.providerAccountId;
        if (lineUserId) {
          try {
            const mongoUser = await userRepository.findByLineUserId(lineUserId);
            if (mongoUser) {
              token.userId = mongoUser.id;
              token.phoneNumber = mongoUser.phoneNumber || "";
            }
          } catch (error) {
            console.error("Error looking up user in JWT callback:", error);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the custom fields to the client-side session
      if (session.user) {
        (session as any).userId = token.userId;
        (session as any).phoneNumber = token.phoneNumber;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
