"use strict";
const { Queue } = require("bullmq");
const Redis = require("ioredis");

const redis = new Redis({ host: "localhost", port: 6379, maxRetriesPerRequest: null });
const extractionQueue = new Queue("extraction", { connection: redis });

async function main() {
  // Get all failed jobs
  const failed = await extractionQueue.getFailed();
  console.log(`Found ${failed.length} failed extraction jobs`);

  for (const job of failed) {
    console.log(`  Retrying job ${job.id} (doc: ${job.data.documentId})`);
    await job.retry();
  }

  console.log("Done — all failed jobs retried.");
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
