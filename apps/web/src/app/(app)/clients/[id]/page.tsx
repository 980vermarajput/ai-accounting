"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApiResponse } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  StatusBadge,
  FlashMessage,
  EmptyState,
  Spinner,
} from "@/components/ui";
import {
  Mail,
  HardDrive,
  Paperclip,
  FileText,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  Database,
  Clock,
} from "lucide-react";

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
        `/api/clients/${clientId}/summary`,
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
        { method: "POST" },
      );

      if (res.success && res.data) {
        setResyncMessage({
          text: res.data.message,
          type: "success",
        });
        // Refresh the client summary to show updated document counts
        void fetchClientSummary();
      } else {
        setResyncMessage({
          text: "Failed to resync documents",
          type: "error",
        });
      }
    } catch (err) {
      setResyncMessage({
        text: err instanceof Error ? err.message : "Failed to resync documents",
        type: "error",
      });
    } finally {
      setIsResyncingDocs(false);
      // Auto-hide message after 5 seconds
      setTimeout(() => setResyncMessage(null), 5000);
    }
  };

  const sourceIcon = (source: string) => {
    switch (source) {
      case "gmail":
        return <Mail className="h-4 w-4 text-red-500" />;
      case "drive":
        return <HardDrive className="h-4 w-4 text-yellow-600" />;
      case "upload":
        return <Paperclip className="h-4 w-4 text-muted" />;
      default:
        return <FileText className="h-4 w-4 text-muted" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Loading client details…</p>
        <div className="w-full max-w-6xl mx-auto mt-6 animate-pulse space-y-4">
          <div className="h-8 bg-surface-secondary rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent>
                  <div className="h-4 bg-surface-secondary rounded w-1/2 mb-2" />
                  <div className="h-8 bg-surface-secondary rounded w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-red-600">{error || "Client not found"}</p>
          <Link href="/clients">
            <Button variant="link" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Clients
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { client, summary, recentDocuments = [], recentQueries = [] } = data;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted mb-4">
        <Link href="/clients" className="hover:text-gray-700 transition-colors">
          Clients
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-900 font-medium">{client.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <span className="text-primary-600 font-bold text-lg">
            {client.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-muted text-sm">{client.identifier}</p>
        </div>
        {client.emailDomain && (
          <Badge variant="outline" className="ml-2 gap-1">
            <Mail className="h-3 w-3" />
            {client.emailDomain}
          </Badge>
        )}
      </div>

      {/* Resync Message */}
      {resyncMessage && (
        <FlashMessage
          variant={resyncMessage.type}
          message={resyncMessage.text}
          className="mb-4"
          onDismiss={() => setResyncMessage(null)}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-muted mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Documents</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {summary.totalDocuments}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-muted mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">Queries</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalQueries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-muted mb-1">
              <Database className="h-4 w-4" />
              <span className="text-sm font-medium">Chunks</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalChunks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-muted mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Last Contact</span>
            </div>
            <div className="text-sm font-medium text-gray-900">
              {summary.lastCommunicationDate
                ? fmtDate(summary.lastCommunicationDate)
                : "Never"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents & Recent Queries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent Documents</CardTitle>
            <CardDescription>Latest 5 documents for this client</CardDescription>
          </CardHeader>
          <CardContent>
            {recentDocuments.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="No documents yet"
              />
            ) : (
              <div className="space-y-3">
                {recentDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-3 p-3 bg-surface-secondary rounded-lg"
                  >
                    <span className="mt-0.5">{sourceIcon(doc.source)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 truncate text-sm">
                          {doc.filename}
                        </span>
                        <StatusBadge status={doc.status} />
                      </div>
                      <div className="text-xs text-muted mb-1">
                        {fmtDate(doc.sourceDate)}
                      </div>
                      {doc.summary && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {doc.summary}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Queries */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Queries</CardTitle>
            <CardDescription>Latest questions asked about this client</CardDescription>
          </CardHeader>
          <CardContent>
            {recentQueries.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-5 w-5" />}
                title="No queries yet"
              />
            ) : (
              <div className="space-y-3">
                {recentQueries.map((query) => (
                  <div key={query.id} className="p-3 bg-surface-secondary rounded-lg">
                    <div className="text-sm text-gray-900 mb-1 line-clamp-2">
                      {query.queryText}
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDateTime(query.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-3 flex-wrap">
        <Link href={`/chat?clientId=${client.id}`}>
          <Button variant="primary" size="lg">
            <MessageSquare className="h-4 w-4" />
            Ask about this client
          </Button>
        </Link>
        <Link href={`/documents?clientId=${client.id}`}>
          <Button variant="secondary" size="lg">
            <FileText className="h-4 w-4" />
            View all documents
          </Button>
        </Link>
        {client.emailDomain && (
          <Button
            variant="secondary"
            size="lg"
            onClick={handleResyncDocuments}
            loading={isResyncingDocs}
          >
            {!isResyncingDocs && <RefreshCw className="h-4 w-4" />}
            {isResyncingDocs ? "Re-syncing…" : "Re-sync Documents"}
          </Button>
        )}
      </div>
    </div>
  );
}
