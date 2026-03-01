"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse, SyncJob, SyncRequestInput } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import { cn, fmtDateTime } from "@/lib/utils";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatusBadge,
  PageHeader,
  EmptyState,
  Spinner,
  FlashMessage,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui";
import {
  Mail,
  HardDrive,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  ListFilter,
} from "lucide-react";

function formatDuration(
  start?: string | Date | null,
  end?: string | Date | null,
): string {
  if (!start || !end) return "—";
  const ms = new Date(end as string).getTime() - new Date(start as string).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function fmtDateSafe(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return fmtDateTime(d);
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
        return res.data.some((j) => j.status === "queued" || j.status === "running");
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
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
        includeAllKeywords,
      };

      const res = await apiFetch<ApiResponse>(`/api/sync/${type}`, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      if (res.success) {
        const keywordInfo =
          requestBody.keywords.length > 0
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

  const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Enhanced Header Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
        <div className="relative bg-white/80 backdrop-blur-sm border-b border-slate-200/50 px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/10 rounded-xl blur-lg"></div>
              <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl shadow-lg">
                <RefreshCw className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Data Sync
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {hasActive
                  ? "Syncing in progress…"
                  : "Sync your Gmail and Google Drive to keep your AI context up to date."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Flash message */}
      {flash && (
        <div className="px-8 pt-4">
          <FlashMessage
            variant={flash.type === "success" ? "success" : "error"}
            message={flash.message}
            onDismiss={() => setFlash(null)}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6">
        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        {/* Gmail card */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
                <Mail className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">Gmail</h2>
                <p className="text-xs text-slate-600">Sync emails and attachments</p>
              </div>
            </div>

            {/* Advanced options toggle */}
            <button
              onClick={() => setShowGmailAdvanced(!showGmailAdvanced)}
              className="w-full mb-3 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs text-muted hover:text-gray-700 border border-border rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
              {showGmailAdvanced ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Advanced Options
            </button>

            {showGmailAdvanced && (
              <div className="mb-4 p-3 bg-surface-secondary rounded-lg border border-border-light">
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., invoice, payment, tax, receipt"
                    value={gmailKeywords}
                    onChange={(e) => setGmailKeywords(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Only sync emails containing these keywords. Leave empty to sync all.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="gmail-include-all"
                    checked={gmailIncludeAll}
                    onChange={(e) => setGmailIncludeAll(e.target.checked)}
                    className="w-3 h-3 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="gmail-include-all" className="text-xs text-gray-700">
                    Require ALL keywords (vs ANY keyword)
                  </label>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-0"
              loading={startingGmail}
              onClick={() => void startSync("gmail")}
            >
              Start Gmail Sync
            </Button>
        </div>

        {/* Drive card */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                <HardDrive className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">Google Drive</h2>
                <p className="text-xs text-slate-600">Sync documents and spreadsheets</p>
              </div>
            </div>

            <button
              onClick={() => setShowDriveAdvanced(!showDriveAdvanced)}
              className="w-full mb-3 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs text-muted hover:text-gray-700 border border-border rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
              {showDriveAdvanced ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Advanced Options
            </button>

            {showDriveAdvanced && (
              <div className="mb-4 p-3 bg-surface-secondary rounded-lg border border-border-light">
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., budget, financial, report, statement"
                    value={driveKeywords}
                    onChange={(e) => setDriveKeywords(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Only sync files containing these keywords. Leave empty to sync all.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="drive-include-all"
                    checked={driveIncludeAll}
                    onChange={(e) => setDriveIncludeAll(e.target.checked)}
                    className="w-3 h-3 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="drive-include-all" className="text-xs text-gray-700">
                    Require ALL keywords (vs ANY keyword)
                  </label>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              loading={startingDrive}
              onClick={() => void startSync("drive")}
            >
              Start Drive Sync
            </Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="mb-8 border border-red-200 rounded-xl bg-red-50/50 p-5">
        <h2 className="font-semibold text-red-800 mb-1">Danger Zone</h2>
        <p className="text-sm text-red-600/80 mb-4">
          Permanently deletes all synced documents, chunks, and embeddings for your firm.
          Use this before a full re-sync.
        </p>
        <Button
          variant="danger-outline"
          loading={clearingDocs}
          disabled={clearingDocs || hasActive}
          onClick={() => setShowClearConfirm(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear All Documents
        </Button>
        {hasActive && (
          <p className="mt-2 text-xs text-red-500">
            Cannot clear while a sync is in progress.
          </p>
        )}
      </div>

      {/* Confirmation modal */}
      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        maxWidth="max-w-sm"
      >
        <ModalHeader onClose={() => setShowClearConfirm(false)}>
          Clear all documents?
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-muted">
            This will permanently delete{" "}
            <strong className="text-gray-800">
              all documents, chunks, and embeddings
            </strong>{" "}
            for your firm. This cannot be undone. You will need to re-sync to rebuild your
            knowledge base.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void clearAllDocs()}>
            Yes, delete everything
          </Button>
        </ModalFooter>
      </Modal>

        {/* Recent jobs table */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg">
          <div className="px-6 py-4 border-b border-slate-200/50 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Recent Sync Jobs</h3>
            <button
              onClick={() => void fetchJobs()}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>

          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <Spinner size="sm" />
                <span className="text-sm text-slate-600">Loading…</span>
              </div>
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={<Clock className="h-5 w-5" />}
                title="No sync history yet"
                description="Start a sync above to see jobs here."
                className="py-12"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/50 bg-slate-50/50 text-left text-[11px] text-slate-600 uppercase tracking-wide">
                      <th className="px-5 py-4 font-semibold">Type</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                      <th className="px-5 py-4 font-semibold">Keywords</th>
                      <th className="px-5 py-4 font-semibold">Found</th>
                      <th className="px-5 py-4 font-semibold">Processed</th>
                      <th className="px-5 py-4 font-semibold">Started</th>
                      <th className="px-5 py-4 font-semibold">Duration</th>
                      <th className="px-5 py-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/30">
                    {jobs.map((job) => (
                      <tr
                        key={job.id}
                        className="hover:bg-slate-50/30 transition-colors duration-200"
                      >
                        <td className="px-5 py-4 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        {job.type === "gmail" ? (
                          <Mail className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <HardDrive className="h-3.5 w-3.5 text-blue-500" />
                        )}
                        {job.type === "gmail" ? "Gmail" : "Drive"}
                      </span>
                    </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-5 py-4">
                          {job.keywords && job.keywords.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-mono">
                              <ListFilter className="h-3 w-3" />
                              {job.keywords.join(", ")}
                              <span className="text-slate-500">
                                ({job.includeAllKeywords ? "ALL" : "ANY"})
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 italic">
                              All documents
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-600 tabular-nums">
                          {job.documentsFound ?? 0}
                        </td>
                        <td className="px-5 py-4 text-slate-600 tabular-nums">
                          {job.documentsProcessed ?? 0}
                        </td>
                        <td className="px-5 py-4 text-slate-600 text-xs">
                          {fmtDateSafe(job.startedAt)}
                        </td>
                        <td className="px-5 py-4 text-slate-600 text-xs">
                          {job.status === "running"
                            ? "In progress…"
                            : formatDuration(job.startedAt, job.completedAt)}
                        </td>
                        <td className="px-5 py-4">
                      {(job.status === "queued" || job.status === "running") && (
                        <Button
                          variant="link"
                          size="sm"
                          className="text-red-600 hover:text-red-700 h-auto p-0"
                          loading={cancellingId === job.id}
                          onClick={() => void cancelJob(job.id)}
                        >
                          Cancel
                        </Button>
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
      </div>
    </div>
  );
}
