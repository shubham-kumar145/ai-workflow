import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@aiworkflow.dev";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const clientEmail = process.env.SEED_CLIENT_EMAIL ?? "client@aiworkflow.dev";
  const clientPassword = process.env.SEED_CLIENT_PASSWORD ?? "client1234";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: {
      email: adminEmail,
      name: "Agency Admin",
      password: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
    },
  });

  const client = await prisma.user.upsert({
    where: { email: clientEmail },
    update: {},
    create: {
      email: clientEmail,
      name: "Demo Client",
      password: await bcrypt.hash(clientPassword, 10),
      role: "CLIENT",
    },
  });

  console.log("Seeded users:");
  console.log(`  ADMIN   ${admin.email} / ${adminPassword}`);
  console.log(`  CLIENT  ${client.email} / ${clientPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
