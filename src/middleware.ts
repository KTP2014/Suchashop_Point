import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const getSecretBytes = (): Uint8Array => {
  const secret = process.env.JWT_SECRET || "fallback-temporary-secret-for-static-compilation-purposes";
  return new TextEncoder().encode(secret);
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths requiring specific role authorization checks
  const isCustomerRoute = pathname.startsWith("/customer") || pathname.startsWith("/api/customer");
  const isMerchantRoute = pathname.startsWith("/merchant") || pathname.startsWith("/api/merchant");

  // Bypass auth check for public endpoints (login)
  const isAuthRoute = pathname.startsWith("/api/auth") || pathname === "/";
  if (isAuthRoute) {
    return NextResponse.next();
  }

  if (isCustomerRoute || isMerchantRoute) {
    const token = request.cookies.get("session")?.value;
    const isApiRequest = pathname.startsWith("/api/");

    // For frontend pages, we allow NextAuth session token as a fallback
    // so the page can load and trigger the session-sync API.
    const nextAuthToken = !isApiRequest
      ? (request.cookies.get("next-auth.session-token")?.value ||
         request.cookies.get("__Secure-next-auth.session-token")?.value)
      : undefined;

    if (!token && !nextAuthToken) {
      return handleUnauthorized(request, "Missing authentication token.");
    }

    if (!token) {
      // Bypassing middleware check for frontend pages when NextAuth session exists
      return NextResponse.next();
    }

    try {
      // Edge compatible token decryption
      const { payload } = await jwtVerify(token, getSecretBytes());
      const role = payload.role as string;

      if (isCustomerRoute && role !== "CUSTOMER") {
        return handleUnauthorized(request, "Access restricted to Customers.");
      }

      if (isMerchantRoute && role !== "MERCHANT") {
        return handleUnauthorized(request, "Access restricted to Merchants.");
      }

      // Append decoded userId and role to request headers for downstream endpoint retrievals
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-user-id", payload.userId as string);
      requestHeaders.set("x-user-phone", payload.phoneNumber as string);
      requestHeaders.set("x-user-role", role);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      return handleUnauthorized(request, "Invalid or expired session token.");
    }
  }

  return NextResponse.next();
}

function handleUnauthorized(request: NextRequest, message: string) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message,
      },
      { status: 401 }
    );
  }

  // Frontend routes are redirected to root login page
  const loginUrl = new URL("/", request.url);
  return NextResponse.redirect(loginUrl);
}

// Scopes matching middleware checks
export const config = {
  matcher: [
    "/customer/:path*",
    "/merchant/:path*",
    "/api/customer/:path*",
    "/api/merchant/:path*",
  ],
};
