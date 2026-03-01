import "dotenv/config";

import app from "./app";
import { startGmailSyncWorker } from "./workers/gmail-sync.worker";
import { startDriveSyncWorker } from "./workers/drive-sync.worker";
import { startExtractionWorker } from "./workers/extraction.worker";
import { startEmbeddingWorker } from "./workers/embedding.worker";
import { startSchedulerWorker } from "./workers/scheduler.worker";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);

  // Start BullMQ background workers — run in-process alongside the HTTP server.
  // In production these can be moved to dedicated worker processes.
  startGmailSyncWorker();
  startDriveSyncWorker();
  startExtractionWorker();
  startEmbeddingWorker();
  startSchedulerWorker();
});
