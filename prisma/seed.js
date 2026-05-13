const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const roles = [
  ["admin", "System administrator"],
  ["staff", "Internal staff member"],
  ["user", "Default authenticated user"],
  ["gestor", "Course-compatible manager role"],
  ["participante", "Course-compatible participant role"],
];

async function main() {
  for (const [name, description] of roles) {
    await prisma.role.upsert({
      where: { name },
      update: { description },
      create: { name, description },
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL || "admin@chave.local";
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
  const userRole = await prisma.role.findUniqueOrThrow({ where: { name: "user" } });
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isActive: true,
      name: "Chave Admin",
    },
    create: {
      email,
      name: "Chave Admin",
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userRole.createMany({
    data: [
      { userId: admin.id, roleId: adminRole.id },
      { userId: admin.id, roleId: userRole.id },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
