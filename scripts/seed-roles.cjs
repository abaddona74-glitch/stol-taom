#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const roles = [
    { name: "OWNER", description: "Platform owner / super admin" },
    { name: "ADMIN", description: "Platform admin (owner-like)" },
    { name: "MANAGER", description: "Restaurant manager (branch-scoped)" },
    { name: "CHEF", description: "Head chef / kitchen manager" },
    { name: "KITCHEN", description: "Kitchen staff / line cook" },
    { name: "WAITER", description: "Front-of-house waiter" },
    { name: "CASHIER", description: "Cashier for payments / receipts" },
  ];

  for (const r of roles) {
    const up = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
    console.log("Ensured role", up.name);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
