"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../../lib/api";
import type { PaginatedResponse, ApiResponse } from "@ai-accounting/shared";

// ─── Local types ─────────────────────────────────────────────────

interface DocumentRow {
  id: string;
  filename: string;
  source: "gmail" | "drive" | "upload";
  status: "pending" | "processing" | "ready" | "error";
  mimeType: string;
  textExcerpt: string | null;
  errorMessage: string | null;
  sourceDate: string;
  createdAt: string;
}

interface SyncStatus {
  activeJobs: Array<{
    id: string;
    type: "gmail" | "drive";
    status: string;
    documentsFound: number;
    documentsProcessed: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    classes: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
  },
  processing: {
    label: "Processing",
    classes: "bg-amber-50 text-amber-700",
    dot: "bg-amber-400 animate-pulse",
  },
  ready: {
    label: "Ready",
    classes: "bg-green-50 text-green-700",
    dot: "bg-green-500",
  },
  error: {
    label: "Error",
    classes: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
} as const;

const SOURCE_CONFIG = {
  gmail: { label: "Gmail", emoji: "✉️" },
  drive: { label: "Drive", emoji: "📁" },
  upload: { label: "Upload", emoji: "📎" },
} as const;

function StatusBadge({ status }: { status: DocumentRow["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Documents page ───────────────────────────────────────────────

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [syncMessage, setSyncMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [activeJobs, setActiveJobs] = useState<SyncStatus["activeJobs"]>([]);

  const PAGE_SIZE = 20;

  // ── Fetch documents ────────────────────────────────────────
  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (sourceFilter) params.set("source", sourceFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await apiFetch<PaginatedResponse<DocumentRow>>(
        `/api/documents?${params.toString()}`,
      );
      setDocuments(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      /* silent */
    } finally {
      setIsLoading(false);
    }
  }, [page, sourceFilter, statusFilter]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // ── Poll sync status ───────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await apiFetch<ApiResponse<SyncStatus>>("/api/sync/status");
        const jobs = res.data?.activeJobs ?? [];
        setActiveJobs(jobs);
        // Refresh documents list when jobs finish
        if (jobs.some((j) => j.status === "completed")) {
          void loadDocuments();
        }
      } catch {
        /* silent */
      }
    };

    const interval = setInterval(() => void poll(), 5000);
    return () => clearInterval(interval);
  }, [loadDocuments]);

  // ── Reset page on filter change ────────────────────────────
  useEffect(() => {
    setPage(1);
  }, [sourceFilter, statusFilter]);

  // ── Trigger sync ───────────────────────────────────────────
  const triggerSync = useCallback(async (type: "gmail" | "drive") => {
    const setLoading = type === "gmail" ? setSyncingGmail : setSyncingDrive;
    setLoading(true);
    setSyncMessage(null);
    try {
      await apiFetch(`/api/sync/${type}`, { method: "POST" });
      setSyncMessage({
        text: `${type === "gmail" ? "Gmail" : "Drive"} sync started — documents will appear as they're processed.`,
        type: "success",
      });
      setTimeout(() => setSyncMessage(null), 6000);
    } catch (err) {
      setSyncMessage({
        text:
          err instanceof Error ? err.message : `Failed to start ${type} sync.`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Documents</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {total > 0
                ? `${total} document${total > 1 ? "s" : ""}`
                : "No documents yet"}
            </p>
          </div>

          {/* Sync buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void triggerSync("gmail")}
              disabled={syncingGmail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {syncingGmail ? (
                <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                "✉️"
              )}
              Sync Gmail
            </button>
            <button
              onClick={() => void triggerSync("drive")}
              disabled={syncingDrive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {syncingDrive ? (
                <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                "📁"
              )}
              Sync Drive
            </button>
          </div>
        </div>

        {/* Active sync jobs banner */}
        {activeJobs.filter(
          (j) => j.status === "running" || j.status === "queued",
        ).length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            <span className="inline-block w-3 h-3 border border-amber-400 border-t-amber-600 rounded-full animate-spin shrink-0" />
            <span>
              {activeJobs
                .filter((j) => j.status === "running" || j.status === "queued")
                .map(
                  (j) =>
                    `${j.type === "gmail" ? "Gmail" : "Drive"}: ${j.documentsProcessed}/${j.documentsFound} docs`,
                )
                .join(" · ")}{" "}
              — sync in progress
            </span>
          </div>
        )}

        {/* Sync result message */}
        {syncMessage && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              syncMessage.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {syncMessage.text}
          </div>
        )}

        {/* Filters */}
        <div className="mt-3 flex items-center gap-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400"
          >
            <option value="">All sources</option>
            <option value="gmail">Gmail</option>
            <option value="drive">Drive</option>
            <option value="upload">Upload</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-400"
          >
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
          </select>
          {(sourceFilter || statusFilter) && (
            <button
              onClick={() => {
                setSourceFilter("");
                setStatusFilter("");
              }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Loading documents…</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <span className="text-4xl">📭</span>
            <div>
              <p className="text-sm font-medium text-gray-600">
                No documents found
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {sourceFilter || statusFilter
                  ? "Try clearing the filters."
                  : "Use the sync buttons above to import from Gmail or Drive."}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Filename
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Excerpt
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <span className="font-medium text-gray-800 truncate max-w-xs block">
                      {doc.filename}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {doc.mimeType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span>{SOURCE_CONFIG[doc.source].emoji}</span>
                      {SOURCE_CONFIG[doc.source].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                    {doc.errorMessage && (
                      <p
                        className="text-xs text-red-500 mt-0.5 truncate max-w-[140px]"
                        title={doc.errorMessage}
                      >
                        {doc.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {fmtDate(doc.sourceDate)}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {doc.textExcerpt ? (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {doc.textExcerpt}
                      </p>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
