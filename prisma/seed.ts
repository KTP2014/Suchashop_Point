import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting merchant database seeding...");

  const merchantPhone = "+66945141696";
  const defaultPassword = "1234";
  
  // Hash the password with 12 work rounds
  const passwordHash = bcrypt.hashSync(defaultPassword, 12);

  // Find existing merchant first since phoneNumber is no longer unique at DB level
  const existingMerchant = await prisma.user.findFirst({
    where: { phoneNumber: merchantPhone },
  });

  let merchant;
  if (existingMerchant) {
    merchant = await prisma.user.update({
      where: { id: existingMerchant.id },
      data: {
        passwordHash,
        role: Role.MERCHANT,
      },
    });
  } else {
    merchant = await prisma.user.create({
      data: {
        phoneNumber: merchantPhone,
        passwordHash,
        role: Role.MERCHANT,
        currentPoints: 0,
        pendingPoints: 0,
        version: 0,
      },
    });
  }

  console.log(`Merchant pre-seeded successfully:`);
  console.log(`- ID: ${merchant.id}`);
  console.log(`- Phone: ${merchant.phoneNumber}`);
  console.log(`- Role: ${merchant.role}`);
  console.log(`- Default Password: ${defaultPassword}`);
}

main()
  .catch((e) => {
    console.error("Failed to seed merchant:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
