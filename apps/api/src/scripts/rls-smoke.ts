// Throwaway smoke test for the app-side RLS layer (Prisma extension + context).
// Run with the restricted role:
//   RLS_ENFORCE=true \
//   DATABASE_URL=postgresql://app_user:app_pw_local_test@localhost:5432/ai_accounting?schema=public \
//   ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_accounting?schema=public \
//   ./node_modules/.bin/tsx src/scripts/rls-smoke.ts
import { prisma, prismaAdmin } from "../lib/prisma";
import { withFirmContext } from "../lib/tenant-context";

const FIRM_A = "11111111-1111-1111-1111-111111111111";
const FIRM_B = "22222222-2222-2222-2222-222222222222";

async function main() {
  // Fixture via the privileged client (bypasses RLS).
  await prismaAdmin.client.deleteMany({ where: { identifier: { in: ["CLI-A", "CLI-B"] } } });
  await prismaAdmin.user.deleteMany({ where: { email: { in: ["a@rls.test", "b@rls.test"] } } });
  await prismaAdmin.firm.deleteMany({ where: { slug: { in: ["firm-a-rls-test", "firm-b-rls-test"] } } });
  await prismaAdmin.firm.create({ data: { id: FIRM_A, name: "Firm A", slug: "firm-a-rls-test" } });
  await prismaAdmin.firm.create({ data: { id: FIRM_B, name: "Firm B", slug: "firm-b-rls-test" } });
  const ua = await prismaAdmin.user.create({ data: { firmId: FIRM_A, email: "a@rls.test", name: "A", role: "admin" } });
  const ub = await prismaAdmin.user.create({ data: { firmId: FIRM_B, email: "b@rls.test", name: "B", role: "admin" } });
  await prismaAdmin.client.create({ data: { firmId: FIRM_A, createdBy: ua.id, name: "Client A", identifier: "CLI-A" } });
  await prismaAdmin.client.create({ data: { firmId: FIRM_B, createdBy: ub.id, name: "Client B", identifier: "CLI-B" } });

  const inA = await withFirmContext(FIRM_A, () => prisma.client.findMany({ select: { name: true } }));
  const inB = await withFirmContext(FIRM_B, () => prisma.client.findMany({ select: { name: true } }));
  const noCtx = await prisma.client.findMany({ select: { name: true } });

  console.log("Firm A context :", inA.map((c) => c.name), inA.length === 1 && inA[0].name === "Client A" ? "✅" : "❌");
  console.log("Firm B context :", inB.map((c) => c.name), inB.length === 1 && inB[0].name === "Client B" ? "✅" : "❌");
  console.log("No context     :", noCtx.map((c) => c.name), noCtx.length === 0 ? "✅ (fail-closed)" : "❌ LEAK");

  // Cross-tenant write blocked by WITH CHECK.
  let blocked = false;
  try {
    await withFirmContext(FIRM_A, () =>
      prisma.client.create({ data: { firmId: FIRM_B, createdBy: ua.id, name: "Sneaky", identifier: "SNEAK" } }),
    );
  } catch {
    blocked = true;
  }
  console.log("Cross-tenant write blocked:", blocked ? "✅" : "❌ ALLOWED");

  // Cleanup.
  await prismaAdmin.client.deleteMany({ where: { identifier: { in: ["CLI-A", "CLI-B", "SNEAK"] } } });
  await prismaAdmin.user.deleteMany({ where: { email: { in: ["a@rls.test", "b@rls.test"] } } });
  await prismaAdmin.firm.deleteMany({ where: { slug: { in: ["firm-a-rls-test", "firm-b-rls-test"] } } });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
