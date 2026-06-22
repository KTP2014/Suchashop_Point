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

    if (!token) {
      return handleUnauthorized(request, "Missing authentication token.");
    }

    try {
      // Edge compatible token decryption
      const { payload } = await jwtVerify(token, getSecretBytes());
      const role = payload.role as string;

      // 🟢 1. แก้ไขฝั่งเส้นทางลูกค้า: ยอมให้คนที่มีสถานะ PENDING_APPROVAL เข้ามาดูหน้าคั่นรอได้ด้วย
      if (isCustomerRoute && role !== "CUSTOMER" && role !== "PENDING_APPROVAL") {
        return handleUnauthorized(request, "Access restricted to Customers.");
      }

      // 🟢 2. แก้ไขฝั่งเส้นทางร้านค้า: เปิดประตูเมืองให้ระดับ ADMIN และ STAFF ผ่านเข้าไปได้ด้วย!
      if (isMerchantRoute && role !== "MERCHANT" && role !== "STAFF" && role !== "ADMIN") {
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
