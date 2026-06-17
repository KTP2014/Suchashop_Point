import NextAuth, { NextAuthOptions } from "next-auth";
import LineProvider from "next-auth/providers/line";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { Role } from "@prisma/client";

const userRepository = new UserRepository();

export const authOptions: NextAuthOptions = {
  providers: [
    LineProvider({
      // ✅ ลบ "placeholder_id" และ "placeholder_secret" ออกทั้งหมดเรียบร้อย
      clientId: process.env.LINE_CHANNEL_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
      authorization: { params: { scope: "profile openid" } },
    }),
  ],
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? `__Secure-next-auth.session-token` : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  // @ts-expect-error - trustHost parameter for Vercel proxy headers
  trustHost: true,
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
      // If logging in via line, preserve the lineUserId on the JWT token
      if (account?.provider === "line") {
        const lineUserId = profile?.sub || account.providerAccountId;
        if (lineUserId) {
          token.lineUserId = lineUserId;
        }
      }

      // If we have the lineUserId but not yet resolved the MongoDB user details (e.g. on session checks)
      if (token.lineUserId && !token.userId) {
        try {
          const mongoUser = await userRepository.findByLineUserId(token.lineUserId as string);
          if (mongoUser) {
            token.userId = mongoUser.id;
            token.phoneNumber = mongoUser.phoneNumber || "";
          }
        } catch (error) {
          console.error("Error looking up user in JWT callback:", error);
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
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };