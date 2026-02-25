import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── Create a demo firm ───────────────────────────
  const firm = await prisma.firm.upsert({
    where: { slug: "sharma-associates" },
    update: {},
    create: {
      name: "Sharma & Associates",
      slug: "sharma-associates",
      plan: "trial",
    },
  });
  console.log(`✅ Firm: ${firm.name} (${firm.id})`);

  // ─── Create admin user ────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@sharmaassociates.in" },
    update: {},
    create: {
      firmId: firm.id,
      email: "admin@sharmaassociates.in",
      name: "Rajesh Sharma",
      role: "admin",
    },
  });
  console.log(`✅ Admin: ${admin.name} (${admin.email})`);

  // ─── Create member user ───────────────────────────
  const member = await prisma.user.upsert({
    where: { email: "priya@sharmaassociates.in" },
    update: {},
    create: {
      firmId: firm.id,
      email: "priya@sharmaassociates.in",
      name: "Priya Patel",
      role: "member",
    },
  });
  console.log(`✅ Member: ${member.name} (${member.email})`);

  // ─── Create sample clients ────────────────────────
  const client1 = await prisma.client.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      firmId: firm.id,
      createdBy: admin.id,
      name: "ABC Enterprises Pvt Ltd",
      identifier: "ABC-001",
      emailDomain: "abcenterprises.in",
    },
  });

  const client2 = await prisma.client.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      firmId: firm.id,
      createdBy: admin.id,
      name: "Gupta Trading Co",
      identifier: "GTC-002",
      emailDomain: "guptatrading.com",
    },
  });
  console.log(`✅ Clients: ${client1.name}, ${client2.name}`);

  console.log("\n🎉 Seed complete!\n");
  console.log("Dev auth header (paste into API requests):");
  console.log(
    `X-Dev-User: ${JSON.stringify({
      userId: admin.id,
      firmId: firm.id,
      email: admin.email,
      role: admin.role,
    })}`,
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
