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

      // 🟢 1. แก้ไขฝั่งเส้นทางลูกค้า: ยอมให้คนที่มีสถานะ PENDING_APPROVAL, STAFF, และ ADMIN เข้ามาดูได้ด้วย เพื่อหลีกเลี่ยง Loop
      if (isCustomerRoute && 
          role !== "CUSTOMER" && 
          role !== "PENDING_APPROVAL" && 
          role !== "STAFF" && 
          role !== "ADMIN") {
        return handleUnauthorized(request, "Access restricted to Customers.");
      }

      // 🟢 2. แก้ไขฝั่งเส้นทางร้านค้า: เปิดประตูเมืองให้ระดับ ADMIN และ STAFF ผ่านเข้าไปได้ด้วย! (และยอมให้ผู้ใช้ทุกคนเข้าถึงข้อมูลผ่าน GET /api/merchant/config)
      if (isMerchantRoute && role !== "MERCHANT" && role !== "STAFF" && role !== "ADMIN") {
        const isPublicConfigGet = pathname === "/api/merchant/config" && request.method === "GET";
        if (!isPublicConfigGet) {
          return handleUnauthorized(request, "Access restricted to Merchants.");
        }
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
    } catch {
      return handleUnauthorized(request, "Invalid or expired session token.");
    }
  }

  return NextResponse.next();
}

function handleUnauthorized(request: NextRequest, message: string) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const response = NextResponse.json(
      {
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message,
      },
      { status: 401 }
    );
    if (request.cookies.has("session")) {
      response.cookies.delete("session");
    }
    return response;
  }

  // Frontend routes are redirected to root login page
  const loginUrl = new URL("/", request.url);
  const response = NextResponse.redirect(loginUrl);
  if (request.cookies.has("session")) {
    response.cookies.delete("session");
  }
  return response;
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
