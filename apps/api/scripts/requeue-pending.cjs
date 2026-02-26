"use strict";
const { PrismaClient } = require("@prisma/client");
const { Queue } = require("bullmq");
const Redis = require("ioredis");

const redis = new Redis({ host: "localhost", port: 6379, maxRetriesPerRequest: null });
const extractionQueue = new Queue("extraction", { connection: redis });
const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.document.findMany({
    where: { status: "pending" },
    select: {
      id: true,
      userId: true,
      firmId: true,
      source: true,
      sourceId: true,
      mimeType: true,
    },
  });

  console.log(`Found ${docs.length} pending documents`);

  for (const doc of docs) {
    // Use a timestamp suffix so BullMQ never deduplicates — each requeue gets a fresh job
    const jobId = `extract-${doc.id}-${Date.now()}`;
    await extractionQueue.add(
      "extract-document",
      {
        documentId: doc.id,
        userId: doc.userId,
        firmId: doc.firmId,
        source: doc.source,
        sourceId: doc.sourceId,
        mimeType: doc.mimeType,
      },
      { jobId },
    );
    console.log(`  ✓ Queued extraction for doc ${doc.id} (${doc.source}:${doc.sourceId})`);
  }

  console.log("Done — extraction jobs re-queued.");
  await prisma.$disconnect();
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

