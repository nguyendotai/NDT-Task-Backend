import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Add idempotent seed logic here as domain models are added (.claude/database.md #5).
function main() {
  console.log('No seed data defined yet.');
  return Promise.resolve();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
