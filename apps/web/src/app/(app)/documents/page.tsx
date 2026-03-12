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
  Upload,
  Plus,
} from "lucide-react";
import type { PaginatedResponse, ApiResponse } from "@ai-accounting/shared";

// ─── Local types ─────────────────────────────────────────────────

interface FileUploadZoneProps {
  onFilesSelected: (files: FileList) => void;
  uploading: boolean;
  onCancel: () => void;
}

const FileUploadZone: React.FC<FileUploadZoneProps> = ({ onFilesSelected, uploading, onCancel }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200",
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        )}
      >
        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-4" />
        <p className="text-sm font-medium text-gray-900 mb-1">
          Drop files here or click to browse
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Supports PDF, DOCX, XLSX, CSV, TXT (max 25MB each)
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
          onChange={handleFileInput}
          className="hidden"
          id="file-input"
          disabled={uploading}
        />
        <label
          htmlFor="file-input"
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
            uploading
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          {uploading ? (
            <>
              <Spinner className="h-4 w-4" />
              Uploading...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Select Files
            </>
          )}
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={uploading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

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
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

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

  const handleFileUpload = useCallback(async (files: FileList) => {
    setUploading(true);
    setUploadMessage(null);

    const successfulUploads: string[] = [];
    const failedUploads: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || 'Upload failed');
        }

        const result = await response.json();
        successfulUploads.push(file.name);
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        failedUploads.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Show results and refresh document list
    if (successfulUploads.length > 0) {
      setUploadMessage({
        text: `Successfully uploaded ${successfulUploads.length} file(s). Documents will be processed and indexed for search.`,
        type: "success",
      });
      void loadDocuments(); // Refresh the document list
    }

    if (failedUploads.length > 0) {
      setUploadMessage({
        text: `Failed uploads: ${failedUploads.join(', ')}`,
        type: "error",
      });
    }

    setUploading(false);
    setShowUploadModal(false);
    setTimeout(() => setUploadMessage(null), 8000);
  }, [loadDocuments]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const runningJobs = activeJobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Enhanced Header Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
        <div className="relative bg-white/80 backdrop-blur-sm border-b border-slate-200/50 px-8 py-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/10 rounded-xl blur-lg"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl shadow-lg">
                  <FileText className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Documents
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  {total > 0 ? `${total.toLocaleString()} document${total > 1 ? "s" : ""} synced` : "No documents yet"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                loading={uploading}
                onClick={() => setShowUploadModal(true)}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Upload className="h-4 w-4" />
                Upload Files
              </Button>
              <div className="h-6 w-px bg-slate-300"></div>
              <Button
                variant="secondary"
                size="sm"
                loading={syncingGmail}
                onClick={() => void triggerSync("gmail")}
                className="bg-white/60 hover:bg-white/80 border-slate-200 hover:border-slate-300 transition-all duration-200"
              >
                <Mail className="h-4 w-4" />
                Sync Gmail
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={syncingDrive}
                onClick={() => void triggerSync("drive")}
                className="bg-white/60 hover:bg-white/80 border-slate-200 hover:border-slate-300 transition-all duration-200"
              >
                <HardDrive className="h-4 w-4" />
                Sync Drive
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Active sync banner */}
      {runningJobs.length > 0 && (
        <div className="px-8 pt-4">
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
        <div className="px-8 pt-4">
          <FlashMessage
            variant={syncMessage.type === "success" ? "success" : "error"}
            message={syncMessage.text}
            onDismiss={() => setSyncMessage(null)}
          />
        </div>
      )}

      {uploadMessage && (
        <div className="px-8 pt-4">
          <FlashMessage
            variant={uploadMessage.type === "success" ? "success" : "error"}
            message={uploadMessage.text}
            onDismiss={() => setUploadMessage(null)}
          />
        </div>
      )}

      {/* Enhanced Filters */}
      <div className="px-8 py-6 border-b border-slate-200/50 bg-white/50">
        <div className="flex items-center gap-4">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white/80 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
          >
            <option value="">All sources</option>
            <option value="gmail">Gmail</option>
            <option value="drive">Drive</option>
            <option value="upload">Upload</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white/80 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200"
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

      {/* ── Content Area ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Spinner />
            <span className="text-sm text-slate-600">Loading documents…</span>
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
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg overflow-hidden my-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/50 bg-slate-50/50">
                  <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Filename
                  </th>
                  <th className="text-left px-4 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Source
                  </th>
                  <th className="text-left px-4 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Status
                  </th>
                  <th className="text-left px-4 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Date
                  </th>
                  <th className="text-left px-4 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Excerpt
                  </th>
                  <th className="text-left px-4 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/30">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-slate-50/30 transition-colors duration-200"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-800 truncate max-w-xs block text-sm">
                        {doc.filename}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {doc.mimeType}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-1.5 text-xs text-slate-600">
                        {SOURCE_ICON[doc.source]}
                        {SOURCE_LABEL[doc.source]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
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
                    <td className="px-4 py-4 text-xs text-slate-600 whitespace-nowrap">
                      {fmtDate(doc.sourceDate)}
                    </td>
                    <td className="px-4 py-4 max-w-xs">
                      {doc.textExcerpt ? (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {doc.textExcerpt}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {doc.source === "gmail" && doc.gmailThreadId ? (
                        <button
                          onClick={() => setSelectedThreadId(doc.gmailThreadId || null)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
                        >
                          View Thread
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="border-t border-slate-200/50 bg-white/60 backdrop-blur-sm px-8 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-600">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-white/60 hover:bg-white/80 border-slate-200 hover:border-slate-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="bg-white/60 hover:bg-white/80 border-slate-200 hover:border-slate-300"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── File Upload Modal ──────────────────────────────── */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        maxWidth="max-w-md"
      >
        <ModalHeader>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload PDF, Word, Excel, CSV, or text files for processing and search indexing.
          </p>
        </ModalHeader>
        <ModalBody>
          <FileUploadZone
            onFilesSelected={handleFileUpload}
            uploading={uploading}
            onCancel={() => setShowUploadModal(false)}
          />
        </ModalBody>
      </Modal>

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
