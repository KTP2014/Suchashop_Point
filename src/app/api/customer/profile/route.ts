import { NextResponse } from "next/server";
import { UserRepository } from "../../../../features/auth/repository/userRepository";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";

const userRepository = new UserRepository();

export async function GET(request: Request) {
  try {
    const customerId = request.headers.get("x-user-id");

    if (!customerId) {
      return NextResponse.json({
        success: false,
        code: "UNAUTHORIZED_ACCESS",
        message: "Customer authentication is missing.",
      }, { status: 401 });
    }

    const customer = await userRepository.findById(customerId);

    if (!customer) {
      return NextResponse.json({
        success: false,
        code: "FORBIDDEN_RESOURCE",
        message: "Customer account not found.",
      }, { status: 403 });
    }

    const currentPoints = customer.currentPoints;
    const pendingPoints = customer.pendingPoints;

    return NextResponse.json({
      success: true,
      currentPoints,
      pendingPoints,
      totalPoints: currentPoints + pendingPoints,
    });

  } catch (error: any) {
    logger.error("CUSTOMER_PROFILE_FAILED", {}, error);

    if (error instanceof AppError) {
      return NextResponse.json({
        success: false,
        code: error.code,
        message: error.message,
      }, { status: error.statusCode });
    }

    return NextResponse.json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    }, { status: 500 });
  }
}
