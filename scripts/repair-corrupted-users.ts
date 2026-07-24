import { prisma } from "../src/lib/prisma";
import { Role, Prisma } from "@prisma/client";

async function main() {
  console.log("🔍 [AUDIT] Starting system-wide user database audit & auto-repair...");

  const users = await prisma.user.findMany();
  console.log(`📊 Found ${users.length} total user records in MongoDB.`);

  const validRoles = [Role.CUSTOMER, Role.PENDING_APPROVAL, Role.STAFF, Role.ADMIN, Role.MERCHANT];
  let repairedCount = 0;
  let healthyCount = 0;

  for (const user of users) {
    const isRoleCorrupted = !user.role || !validRoles.includes(user.role);
    const isCurrentPointsMissing = typeof user.currentPoints !== "number" || Number.isNaN(user.currentPoints);
    const isPendingPointsMissing = typeof user.pendingPoints !== "number" || Number.isNaN(user.pendingPoints);
    const isVersionMissing = typeof user.version !== "number" || Number.isNaN(user.version);

    if (isRoleCorrupted || isCurrentPointsMissing || isPendingPointsMissing || isVersionMissing) {
      console.log(`\n⚠️ Corrupted record detected for User ID: ${user.id}`);
      console.log(`   - lineUserId: ${user.lineUserId || "N/A"}`);
      console.log(`   - phoneNumber: ${user.phoneNumber || "N/A"}`);
      console.log(`   - currentRole: ${user.role}`);
      console.log(`   - currentPoints: ${user.currentPoints}`);

      const repairData: Prisma.UserUpdateInput = {};

      if (isRoleCorrupted) {
        repairData.role = Role.CUSTOMER;
      }

      if (isCurrentPointsMissing) {
        // Reconstruct from transactions
        const transactions = await prisma.transaction.findMany({
          where: { customerId: user.id },
        });
        const reconstructedPoints = transactions.reduce((sum, tx) => sum + (tx.currentChange || 0), 0);
        repairData.currentPoints = Math.max(0, reconstructedPoints);
        console.log(`   -> Reconstructed currentPoints: ${repairData.currentPoints}`);
      }

      if (isPendingPointsMissing) {
        repairData.pendingPoints = 0;
      }

      if (isVersionMissing) {
        repairData.version = 0;
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: repairData,
      });

      console.log(`   ✅ REPAIRED! Preserved points: ${updated.currentPoints}, New Role: ${updated.role}`);
      repairedCount++;
    } else {
      healthyCount++;
    }
  }

  console.log("\n=========================================");
  console.log(`🎉 Audit Complete!`);
  console.log(`   - Healthy users: ${healthyCount}`);
  console.log(`   - Repaired users: ${repairedCount}`);
  console.log("=========================================\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Audit failed with error:", err);
  prisma.$disconnect();
  process.exit(1);
});
