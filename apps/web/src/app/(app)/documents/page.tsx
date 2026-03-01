"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../../lib/api";
import { cn, fmtDate } from "@/lib/utils";
import {
  Button,
  StatusBadge,
  PageHeader,
  EmptyState,
  Spinner,
  FlashMessage,
  Modal,
  ModalHeader,
  ModalBody,
} from "@/components/ui";
import { ThreadViewer } from "@/components/thread-viewer";
import {
  Mail,
  HardDrive,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Inbox,
} from "lucide-react";
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
  gmailThreadId?: string;
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

const SOURCE_ICON: Record<string, React.ReactNode> = {
  gmail: <Mail className="h-3.5 w-3.5" />,
  drive: <HardDrive className="h-3.5 w-3.5" />,
  upload: <Paperclip className="h-3.5 w-3.5" />,
};

const SOURCE_LABEL: Record<string, string> = {
  gmail: "Gmail",
  drive: "Drive",
  upload: "Upload",
};

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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const PAGE_SIZE = 20;

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

  useEffect(() => {
    setPage(1);
  }, [sourceFilter, statusFilter]);

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
        text: err instanceof Error ? err.message : `Failed to start ${type} sync.`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const runningJobs = activeJobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="border-b border-border bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PageHeader
            title="Documents"
            description={
              total > 0 ? `${total} document${total > 1 ? "s" : ""}` : "No documents yet"
            }
            className="mb-0"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={syncingGmail}
              onClick={() => void triggerSync("gmail")}
            >
              <Mail className="h-3.5 w-3.5" /> Sync Gmail
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={syncingDrive}
              onClick={() => void triggerSync("drive")}
            >
              <HardDrive className="h-3.5 w-3.5" /> Sync Drive
            </Button>
          </div>
        </div>

        {/* Active sync banner */}
        {runningJobs.length > 0 && (
          <div className="mt-3">
            <FlashMessage
              variant="warning"
              message={
                runningJobs
                  .map(
                    (j) =>
                      `${j.type === "gmail" ? "Gmail" : "Drive"}: ${j.documentsProcessed}/${j.documentsFound} docs`,
                  )
                  .join(" · ") + " — sync in progress"
              }
            />
          </div>
        )}

        {syncMessage && (
          <div className="mt-3">
            <FlashMessage
              variant={syncMessage.type === "success" ? "success" : "error"}
              message={syncMessage.text}
              onDismiss={() => setSyncMessage(null)}
            />
          </div>
        )}

        {/* Filters */}
        <div className="mt-3 flex items-center gap-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
          >
            <option value="">All sources</option>
            <option value="gmail">Gmail</option>
            <option value="drive">Drive</option>
            <option value="upload">Upload</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
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
              className="flex items-center gap-1 text-xs text-muted hover:text-gray-700 transition-colors"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Spinner />
            <span className="text-sm text-muted">Loading documents…</span>
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="No documents found"
            description={
              sourceFilter || statusFilter
                ? "Try clearing the filters."
                : "Use the sync buttons above to import from Gmail or Drive."
            }
            className="py-20"
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-tertiary">
                <th className="text-left px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Filename
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Source
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Date
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Excerpt
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-surface-tertiary/50 transition-colors"
                >
                  <td className="px-6 py-3">
                    <span className="font-medium text-gray-800 truncate max-w-xs block text-sm">
                      {doc.filename}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {doc.mimeType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      {SOURCE_ICON[doc.source]}
                      {SOURCE_LABEL[doc.source]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                    {doc.errorMessage && (
                      <p
                        className="text-[11px] text-red-500 mt-0.5 truncate max-w-[140px]"
                        title={doc.errorMessage}
                      >
                        {doc.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {fmtDate(doc.sourceDate)}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {doc.textExcerpt ? (
                      <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                        {doc.textExcerpt}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {doc.source === "gmail" && doc.gmailThreadId ? (
                      <button
                        onClick={() => setSelectedThreadId(doc.gmailThreadId || null)}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium hover:underline"
                      >
                        View Thread
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="border-t border-border bg-white px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-muted">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Thread Viewer Modal ────────────────────────────── */}
      <Modal
        open={!!selectedThreadId}
        onClose={() => setSelectedThreadId(null)}
        maxWidth="max-w-4xl"
      >
        {selectedThreadId && (
          <ThreadViewer
            threadId={selectedThreadId}
            onClose={() => setSelectedThreadId(null)}
          />
        )}
      </Modal>
    </div>
  );
}
