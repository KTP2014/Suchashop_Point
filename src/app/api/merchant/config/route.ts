import { NextResponse } from "next/server";
import { secureRoute } from "../../../../features/auth/services/security";
import { redis } from "../../../../lib/redis";
import { AppError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { Role } from "@prisma/client";
import { z } from "zod";

const RewardSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "ชื่อรางวัลห้ามว่าง"),
  points: z.number().int().min(1, "แต้มที่ใช้แลกต้องมีอย่างน้อย 1 คะแนน"),
});

const ConfigPostSchema = z.object({
  announcement: z.string().optional(),
  rewards: z.array(RewardSchema).optional(),
}).strict();

// Default fallback rewards in case Redis is empty
const DEFAULT_REWARDS = [
  { id: "reward_1", name: "พวงกุญแจอุ้งเท้าแมว", points: 10 },
  { id: "reward_2", name: "เครื่องดื่มฟรี 1 แก้ว", points: 15 },
  { id: "reward_3", name: "กระเป๋าผ้าพรีเมียม Sucha", points: 30 },
];

export async function GET(request: Request) {
  try {
    // Authenticate: any valid role (CUSTOMER, STAFF, ADMIN) can read configuration
    await secureRoute([Role.CUSTOMER, Role.STAFF, Role.ADMIN, Role.MERCHANT]);

    const announcement = (await redis.get<string>("config:announcement")) || "ยินดีต้อนรับสู่ Sucha Shop! สะสมแต้มและแลกของรางวัลสุดพิเศษได้เลย 🐾";
    const rewardsData = await redis.get<any[]>("config:rewards");
    const rewards = rewardsData || DEFAULT_REWARDS;

    return NextResponse.json({
      success: true,
      announcement,
      rewards,
    });
  } catch (error: any) {
    logger.error("GET_CONFIG_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลประกาศและของรางวัล",
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Authenticate: strictly ADMIN or STAFF
    const operator = await secureRoute([Role.ADMIN, Role.STAFF]);
    const operatorId = operator.id;

    const body = await request.json();
    const parsed = ConfigPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        code: "BAD_REQUEST_VALIDATION",
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.issues,
      }, { status: 400 });
    }

    const { announcement, rewards } = parsed.data;

    if (announcement !== undefined) {
      await redis.set("config:announcement", announcement);
    }

    if (rewards !== undefined) {
      await redis.set("config:rewards", JSON.stringify(rewards));
    }

    logger.info("CONFIG_UPDATE_SUCCESS", { operatorId, hasAnnouncement: announcement !== undefined, hasRewards: rewards !== undefined });

    return NextResponse.json({
      success: true,
      message: "บันทึกตั้งค่าระบบสำเร็จเรียบร้อยแล้ว",
    });
  } catch (error: any) {
    logger.error("POST_CONFIG_FAILED", {}, error);

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
      message: "เกิดข้อผิดพลาดในการบันทึกข้อมูลประกาศและของรางวัล",
    }, { status: 500 });
  }
}
