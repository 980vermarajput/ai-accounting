"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse, SyncJob, SyncRequestInput } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";

type SyncStatus = SyncJob["status"];

const STATUS_STYLES: Record<SyncStatus, string> = {
  queued: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d as string).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(
  start?: string | Date | null,
  end?: string | Date | null,
): string {
  if (!start || !end) return "—";
  const ms =
    new Date(end as string).getTime() - new Date(start as string).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

type FlashState = { type: "success" | "error"; message: string } | null;

export default function SyncPage() {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startingGmail, setStartingGmail] = useState(false);
  const [startingDrive, setStartingDrive] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [clearingDocs, setClearingDocs] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  // Keyword filtering state
  const [showGmailAdvanced, setShowGmailAdvanced] = useState(false);
  const [showDriveAdvanced, setShowDriveAdvanced] = useState(false);
  const [gmailKeywords, setGmailKeywords] = useState<string>("");
  const [driveKeywords, setDriveKeywords] = useState<string>("");
  const [gmailIncludeAll, setGmailIncludeAll] = useState(true);
  const [driveIncludeAll, setDriveIncludeAll] = useState(true);

  const showFlash = (type: "success" | "error", message: string) => {
    setFlash({ type, message });
    setTimeout(() => setFlash(null), 4000);
  };

  // ─── Fetch jobs ───────────────────────────────────────────────

  const fetchJobs = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch<ApiResponse<SyncJob[]>>("/api/sync/status");
      if (res.success && res.data) {
        setJobs(res.data);
        // Return whether any job is still active so the caller can decide to keep polling
        return res.data.some(
          (j) => j.status === "queued" || j.status === "running",
        );
      }
    } catch {
      // silently ignore polling errors
    } finally {
      setIsLoading(false);
    }
    return false;
  }, []);

  // Ref to the active polling loop's cancel handle so startSync can restart it.
  const stopPollRef = useRef<(() => void) | null>(null);

  const startPolling = useCallback(() => {
    // Cancel any existing poll loop before starting a new one
    stopPollRef.current?.();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled) return;
      const hasActive = await fetchJobs();
      if (!cancelled && hasActive) {
        timer = setTimeout(poll, 5_000);
      }
    }

    void poll();

    stopPollRef.current = () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchJobs]);

  // On mount: kick off one poll loop (self-stops when no active jobs).
  useEffect(() => {
    startPolling();
    return () => stopPollRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Start sync ───────────────────────────────────────────────

  const startSync = async (type: "gmail" | "drive") => {
    if (type === "gmail") setStartingGmail(true);
    else setStartingDrive(true);

    try {
      // Prepare sync request with keywords
      const keywords = type === "gmail" ? gmailKeywords : driveKeywords;
      const includeAllKeywords = type === "gmail" ? gmailIncludeAll : driveIncludeAll;

      const requestBody: SyncRequestInput = {
        keywords: keywords
          .split(",")
          .map(k => k.trim())
          .filter(k => k.length > 0),
        includeAllKeywords,
      };

      const res = await apiFetch<ApiResponse>(`/api/sync/${type}`, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      if (res.success) {
        const keywordInfo = requestBody.keywords.length > 0
          ? ` with keywords: ${requestBody.keywords.join(", ")}`
          : "";
        showFlash(
          "success",
          `${type === "gmail" ? "Gmail" : "Drive"} sync started${keywordInfo}!`,
        );
        // Restart the polling loop — new job is queued so we need to watch it
        startPolling();
      }
    } catch (err) {
      showFlash(
        "error",
        `Failed to start sync: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      if (type === "gmail") setStartingGmail(false);
      else setStartingDrive(false);
    }
  };

  // ─── Cancel job ───────────────────────────────────────────────

  const cancelJob = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      const res = await apiFetch<ApiResponse>(`/api/sync/cancel/${jobId}`, {
        method: "POST",
      });
      if (res.success) {
        showFlash("success", "Sync job cancelled");
        await fetchJobs();
      }
    } catch (err) {
      showFlash(
        "error",
        `Failed to cancel: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setCancellingId(null);
    }
  };

  // ─── Clear all documents ──────────────────────────────────────

  const clearAllDocs = async () => {
    setShowClearConfirm(false);
    setClearingDocs(true);
    try {
      const res = await apiFetch<ApiResponse>("/api/documents", {
        method: "DELETE",
      });
      if (res.success) {
        showFlash("success", "All documents cleared. You can now re-sync.");
      }
    } catch (err) {
      showFlash(
        "error",
        `Failed to clear: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setClearingDocs(false);
    }
  };

  const hasActive = jobs.some(
    (j) => j.status === "queued" || j.status === "running",
  );

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Data Sync</h1>
        <p className="text-gray-500 text-sm">
          Sync your Gmail and Google Drive to keep your AI context up to date.
          {hasActive && (
            <span className="ml-2 text-blue-600 font-medium animate-pulse">
              ● Syncing in progress…
            </span>
          )}
        </p>
      </div>

      {/* Flash message */}
      {flash && (
        <div
          className={`mb-5 px-4 py-3 rounded-lg text-sm font-medium border ${
            flash.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {flash.message}
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Gmail card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <span className="text-xl">✉️</span>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Gmail</h2>
              <p className="text-xs text-gray-500">
                Sync emails and attachments
              </p>
            </div>
          </div>

          {/* Advanced options toggle */}
          <button
            onClick={() => setShowGmailAdvanced(!showGmailAdvanced)}
            className="w-full mb-3 py-1 px-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            {showGmailAdvanced ? "▼ Hide Advanced Options" : "▶ Advanced Options"}
          </button>

          {/* Advanced options content */}
          {showGmailAdvanced && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., invoice, payment, tax, receipt"
                  value={gmailKeywords}
                  onChange={(e) => setGmailKeywords(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-red-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only sync emails containing these keywords. Leave empty to sync all.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gmail-include-all"
                  checked={gmailIncludeAll}
                  onChange={(e) => setGmailIncludeAll(e.target.checked)}
                  className="w-3 h-3 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                />
                <label htmlFor="gmail-include-all" className="text-xs text-gray-700">
                  Require ALL keywords (vs ANY keyword)
                </label>
              </div>
            </div>
          )}

          <button
            onClick={() => void startSync("gmail")}
            disabled={startingGmail}
            className="w-full py-2 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {startingGmail ? "Starting…" : "Start Gmail Sync"}
          </button>
        </div>

        {/* Drive card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <span className="text-xl">📁</span>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Google Drive</h2>
              <p className="text-xs text-gray-500">
                Sync documents and spreadsheets
              </p>
            </div>
          </div>

          {/* Advanced options toggle */}
          <button
            onClick={() => setShowDriveAdvanced(!showDriveAdvanced)}
            className="w-full mb-3 py-1 px-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            {showDriveAdvanced ? "▼ Hide Advanced Options" : "▶ Advanced Options"}
          </button>

          {/* Advanced options content */}
          {showDriveAdvanced && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., budget, financial, report, statement"
                  value={driveKeywords}
                  onChange={(e) => setDriveKeywords(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only sync files containing these keywords. Leave empty to sync all.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="drive-include-all"
                  checked={driveIncludeAll}
                  onChange={(e) => setDriveIncludeAll(e.target.checked)}
                  className="w-3 h-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="drive-include-all" className="text-xs text-gray-700">
                  Require ALL keywords (vs ANY keyword)
                </label>
              </div>
            </div>
          )}

          <button
            onClick={() => void startSync("drive")}
            disabled={startingDrive}
            className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {startingDrive ? "Starting…" : "Start Drive Sync"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="mb-8 border border-red-200 rounded-xl bg-red-50 p-5">
        <h2 className="font-semibold text-red-800 mb-1">Danger Zone</h2>
        <p className="text-sm text-red-600 mb-4">
          Permanently deletes all synced documents, chunks, and embeddings for
          your firm. The knowledge snapshot will also be cleared. Use this
          before a full re-sync.
        </p>
        <button
          onClick={() => setShowClearConfirm(true)}
          disabled={clearingDocs || hasActive}
          className="py-2 px-4 rounded-lg bg-white border border-red-300 text-red-700 text-sm font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {clearingDocs ? "Clearing…" : "🗑️ Clear All Documents"}
        </button>
        {hasActive && (
          <p className="mt-2 text-xs text-red-500">
            Cannot clear while a sync is in progress.
          </p>
        )}
      </div>

      {/* Confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Clear all documents?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete{" "}
              <strong>all documents, chunks, and embeddings</strong> for your
              firm. This cannot be undone. You will need to re-sync to rebuild
              your knowledge base.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void clearAllDocs()}
                className="flex-1 py-2 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Yes, delete everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent jobs table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Sync Jobs</h2>
          <button
            onClick={() => void fetchJobs()}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-gray-400 text-sm">
              No sync history yet. Start a sync above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Keywords</th>
                  <th className="px-5 py-3 font-medium">Found</th>
                  <th className="px-5 py-3 font-medium">Processed</th>
                  <th className="px-5 py-3 font-medium">Started</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-gray-900 capitalize">
                      {job.type === "gmail" ? "✉️ Gmail" : "📁 Drive"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[job.status]}`}
                      >
                        {job.status === "running" && (
                          <span className="mr-1 animate-pulse">●</span>
                        )}
                        {job.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {job.keywords && job.keywords.length > 0 ? (
                        <span className="text-xs text-gray-500 font-mono">
                          {job.keywords.join(", ")}
                          {job.includeAllKeywords ? " (ALL)" : " (ANY)"}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">All documents</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {job.documentsFound ?? 0}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {job.documentsProcessed ?? 0}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {formatDate(job.startedAt)}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {job.status === "running"
                        ? "In progress…"
                        : formatDuration(job.startedAt, job.completedAt)}
                    </td>
                    <td className="px-5 py-3">
                      {(job.status === "queued" ||
                        job.status === "running") && (
                        <button
                          onClick={() => void cancelJob(job.id)}
                          disabled={cancellingId === job.id}
                          className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50 underline"
                        >
                          {cancellingId === job.id ? "Cancelling…" : "Cancel"}
                        </button>
                      )}
                      {job.status === "failed" && job.errorMessage && (
                        <span
                          className="text-xs text-red-500 italic"
                          title={job.errorMessage}
                        >
                          {job.errorMessage.length > 30
                            ? job.errorMessage.slice(0, 30) + "…"
                            : job.errorMessage}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
