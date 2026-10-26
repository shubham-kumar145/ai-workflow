import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

const isProd = process.env.NODE_ENV === "production";

async function main() {
  // The demo passwords are in a public README; a live site must set its own.
  const demo = ["admin1234", "client1234"];
  const a = process.env.SEED_ADMIN_PASSWORD, c = process.env.SEED_CLIENT_PASSWORD;
  if (isProd && (!a || !c || demo.includes(a) || demo.includes(c))) {
    throw new Error("Set SEED_ADMIN_PASSWORD and SEED_CLIENT_PASSWORD to your own passwords in production.");
  }
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
  // Never print real passwords into a host's logs.
  console.log(`  ADMIN   ${admin.email}${isProd ? "" : ` / ${adminPassword}`}`);
  console.log(`  CLIENT  ${client.email}${isProd ? "" : ` / ${clientPassword}`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
