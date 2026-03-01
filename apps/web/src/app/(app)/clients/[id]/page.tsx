"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApiResponse } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";

// Types based on the API endpoint implementation
interface ClientSummaryResponse {
  client: {
    id: string;
    name: string;
    identifier: string;
    emailDomain?: string;
  };
  summary: {
    totalDocuments: number;
    totalQueries: number;
    totalChunks: number;
    lastCommunicationDate?: string;
    lastCommunicationSubject?: string;
    daysSinceLastCommunication: number | null;
    riskLevel: "low" | "medium" | "high";
  };
  recentDocuments: Array<{
    id: string;
    filename: string;
    source: "gmail" | "drive" | "upload";
    status: "pending" | "processing" | "ready" | "error";
    sourceDate: string;
    summary?: string;
  }>;
  recentQueries: Array<{
    id: string;
    queryText: string;
    responseText: string;
    feedback: string | null;
    createdAt: string;
  }>;
  documentBreakdown: {
    ready: number;
    error: number;
  };
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [data, setData] = useState<ClientSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isResyncingDocs, setIsResyncingDocs] = useState(false);
  const [resyncMessage, setResyncMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const fetchClientSummary = async () => {
    try {
      const res = await apiFetch<ApiResponse<ClientSummaryResponse>>(
        `/api/clients/${clientId}/summary`
      );
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError("Failed to load client summary");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client summary");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchClientSummary();
  }, [clientId]);

  const handleResyncDocuments = async () => {
    setIsResyncingDocs(true);
    setResyncMessage(null);

    try {
      const res = await apiFetch<ApiResponse<{ assignedCount: number; message: string }>>(
        `/api/clients/${clientId}/resync`,
        { method: "POST" }
      );

      if (res.success && res.data) {
        setResyncMessage({
          text: res.data.message,
          type: "success"
        });
        // Refresh the client summary to show updated document counts
        void fetchClientSummary();
      } else {
        setResyncMessage({
          text: "Failed to resync documents",
          type: "error"
        });
      }
    } catch (err) {
      setResyncMessage({
        text: err instanceof Error ? err.message : "Failed to resync documents",
        type: "error"
      });
    } finally {
      setIsResyncingDocs(false);
      // Auto-hide message after 5 seconds
      setTimeout(() => setResyncMessage(null), 5000);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "gmail": return "✉️";
      case "drive": return "📁";
      case "upload": return "📎";
      default: return "📄";
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-gray-100 text-gray-700",
      processing: "bg-blue-100 text-blue-700",
      ready: "bg-green-100 text-green-700",
      error: "bg-red-100 text-red-700",
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-12">
          <div className="text-red-500 mb-4">❌</div>
          <p className="text-red-600 mb-4">{error || "Client not found"}</p>
          <Link
            href="/clients"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Clients
          </Link>
        </div>
      </div>
    );
  }

  const { client, summary, recentDocuments = [], recentQueries = [] } = data;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/clients" className="hover:text-gray-700">
            Clients
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{client.name}</span>
        </nav>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <span className="text-blue-600 font-bold text-lg">
              {client.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-500 text-sm">
              {client.identifier}
            </p>
          </div>
        </div>
        {client.emailDomain && (
          <div className="text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full inline-block">
            📧 {client.emailDomain}
          </div>
        )}
      </div>

      {/* Resync Message */}
      {resyncMessage && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            resyncMessage.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {resyncMessage.text}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Documents</div>
          <div className="text-2xl font-bold text-gray-900">{summary.totalDocuments}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Queries</div>
          <div className="text-2xl font-bold text-gray-900">{summary.totalQueries}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Chunks</div>
          <div className="text-2xl font-bold text-gray-900">{summary.totalChunks}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Last Contact</div>
          <div className="text-sm font-medium text-gray-900">
            {summary.lastCommunicationDate
              ? formatDate(summary.lastCommunicationDate)
              : "Never"
            }
          </div>
        </div>
      </div>

      {/* Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-1">Recent Documents</h3>
            <p className="text-sm text-gray-500">Latest 5 documents for this client</p>
          </div>
          <div className="p-6">
            {recentDocuments.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl mb-2 block">📄</span>
                <p className="text-sm">No documents yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-lg">{getSourceIcon(doc.source)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 truncate text-sm">
                          {doc.filename}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(doc.status)}`}>
                          {doc.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        {formatDate(doc.sourceDate)}
                      </div>
                      {doc.summary && (
                        <div className="text-xs text-gray-600 line-clamp-2">
                          {doc.summary}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Queries */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-1">Recent Queries</h3>
            <p className="text-sm text-gray-500">Latest questions asked about this client</p>
          </div>
          <div className="p-6">
            {recentQueries.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <span className="text-4xl mb-2 block">💭</span>
                <p className="text-sm">No queries yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentQueries.map((query) => (
                  <div key={query.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-900 mb-1 line-clamp-2">
                      {query.queryText}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDateTime(query.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-4 flex-wrap">
        <Link
          href={`/chat?clientId=${client.id}`}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          💬 Ask about this client
        </Link>
        <Link
          href={`/documents?clientId=${client.id}`}
          className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          📄 View all documents
        </Link>
        {client.emailDomain && (
          <button
            onClick={handleResyncDocuments}
            disabled={isResyncingDocs}
            className="px-6 py-3 border border-orange-300 text-orange-700 font-medium rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResyncingDocs ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin mr-2" />
                Re-syncing...
              </>
            ) : (
              "🔄 Re-sync Documents"
            )}
          </button>
        )}
      </div>
    </div>
  );
}