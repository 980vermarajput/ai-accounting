"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import {
  Building,
  Users,
  FileText,
  MessageSquare,
  Calendar,
  ArrowLeft,
  Zap,
  TrendingUp,
  Clock,
  DollarSign,
  Mail,
  Settings,
  X,
  ChevronRight,
  Download
} from "lucide-react";

interface FirmDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  _count: {
    users: number;
    documents: number;
    queries: number;
  };
}

interface FirmMetrics {
  totalTokensLast30d: number;
  estimatedCostLast30d: number;
  queriesLast24h: number;
  avgLatencyMs: number;
}

export default function AdminFirmDetail() {
  const params = useParams();
  const router = useRouter();
  const firmId = params.firmId as string;

  const [firm, setFirm] = useState<FirmDetail | null>(null);
  const [metrics, setMetrics] = useState<FirmMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [showQueriesModal, setShowQueriesModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFirmData = async () => {
      try {
        // Get specific firm data with real metrics
        const firmRes = await apiFetch<{ success: boolean; data: FirmDetail & { metrics: FirmMetrics } }>(`/api/platform-admin/firms/${firmId}`);

        if (firmRes.success) {
          setFirm(firmRes.data);
          setMetrics(firmRes.data.metrics);
          setError(null);
        } else {
          console.error("Firm not found:", firmRes);
          setError("Firm not found. It may have been deleted or you don't have permission to access it.");
        }
      } catch (error) {
        console.error("Failed to fetch firm data:", error);
        setError("Failed to load firm data. Please check your connection and try again.")
      } finally {
        setLoading(false);
      }
    };

    void fetchFirmData();
  }, [firmId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Building className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Firm</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/admin/firms')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go Back to Firms
          </button>
        </div>
      </div>
    );
  }

  if (!firm) {
    return (
      <div className="text-center py-12">
        <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No firm data available</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatTokens = (tokens: number) => {
    if (tokens > 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens > 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 text-gray-500 hover:text-purple-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {firm.name}
              </h1>
              <p className="text-gray-600">/{firm.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              firm.plan === 'enterprise'
                ? 'bg-purple-100 text-purple-800'
                : firm.plan === 'professional'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {firm.plan.charAt(0).toUpperCase() + firm.plan.slice(1)} Plan
            </span>
            <span className="text-sm text-gray-500">
              Created {new Date(firm.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {firm._count.users}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Documents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(firm._count.documents)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Queries</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(firm._count.queries)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-orange-50 to-red-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Queries (24h)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {metrics?.queriesLast24h ?? 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Usage Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Usage */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Token Usage</h3>
              <p className="text-sm text-gray-600">Last 30 days</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Total Tokens</p>
                <p className="text-xs text-gray-600">Prompt + Completion</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {formatTokens(metrics?.totalTokensLast30d ?? 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Estimated Cost</p>
                <p className="text-xs text-gray-600">LLM API charges</p>
              </div>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(metrics?.estimatedCostLast30d ?? 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Avg Latency</p>
                <p className="text-xs text-gray-600">Response time</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {metrics?.avgLatencyMs ?? 0}ms
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
              <p className="text-sm text-gray-600">Administrative controls</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setShowUsersModal(true)}
              className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">Manage Users</p>
                  <p className="text-sm text-gray-600">View and manage firm users</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowDocumentsModal(true)}
              className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-gray-900">View Documents</p>
                  <p className="text-sm text-gray-600">Browse firm documents</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowQueriesModal(true)}
              className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-900">Query History</p>
                  <p className="text-sm text-gray-600">View AI query logs</p>
                </div>
              </div>
            </button>

            <button className="w-full p-4 text-left border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-900">Firm Settings</p>
                  <p className="text-sm text-red-600">Advanced configuration</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Users Modal */}
      {showUsersModal && <UsersModal firmId={firmId} onClose={() => setShowUsersModal(false)} />}

      {/* Documents Modal */}
      {showDocumentsModal && <DocumentsModal firmId={firmId} onClose={() => setShowDocumentsModal(false)} />}

      {/* Queries Modal */}
      {showQueriesModal && <QueriesModal firmId={firmId} onClose={() => setShowQueriesModal(false)} />}

      {/* Implementation Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-blue-800">
          <Building className="w-5 h-5" />
          <span className="font-medium">Development Note</span>
        </div>
        <p className="text-blue-700 text-sm mt-1">
          This firm detail page shows comprehensive firm metrics and controls for platform administrators.
          The Quick Actions now open real modals that fetch and display actual firm data from the API.
        </p>
      </div>
    </div>
  );
}

// Users Modal Component
function UsersModal({ firmId, onClose }: { firmId: string; onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [firm, setFirm] = useState<{ name: string } | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: { firm: { name: string }; users: any[] } }>(`/api/platform-admin/firms/${firmId}/users`);
        if (res.success) {
          setUsers(res.data.users);
          setFirm(res.data.firm);
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
      } finally {
        setLoading(false);
      }
    };
    void fetchUsers();
  }, [firmId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getRoleBadge = (role: string, isAdmin: boolean) => {
    if (isAdmin) return "Platform Admin";
    return role === "admin" ? "Firm Admin" : "Member";
  };

  const getRoleColor = (role: string, isAdmin: boolean) => {
    if (isAdmin) return "bg-purple-100 text-purple-800";
    return role === "admin" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800";
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Users - {firm?.name}</h2>
            <p className="text-sm text-gray-600">Manage firm users and permissions</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{user.name}</h3>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role, user.isAdmin)}`}>
                        {getRoleBadge(user.role, user.isAdmin)}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        Joined {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                  {user.lastSyncAt && (
                    <div className="mt-2 text-xs text-gray-500">
                      Last sync: {formatDate(user.lastSyncAt)}
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No users found for this firm.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Documents Modal Component
function DocumentsModal({ firmId, onClose }: { firmId: string; onClose: () => void }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [firm, setFirm] = useState<{ name: string } | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, limit: 20 });

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: { firm: { name: string }; documents: any[]; pagination: any } }>(`/api/platform-admin/firms/${firmId}/documents?page=${pagination.page}&limit=${pagination.limit}`);
        if (res.success) {
          setDocuments(res.data.documents);
          setFirm(res.data.firm);
          setPagination(res.data.pagination);
        }
      } catch (error) {
        console.error("Failed to fetch documents:", error);
      } finally {
        setLoading(false);
      }
    };
    void fetchDocuments();
  }, [firmId, pagination.page, pagination.limit]);

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Documents - {firm?.name}</h2>
            <p className="text-sm text-gray-600">Browse and manage firm documents</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 truncate">{doc.filename}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>{formatFileSize(doc.size || 0)}</span>
                          <span>•</span>
                          <span>Uploaded {formatDate(doc.createdAt)}</span>
                          {doc.client && (
                            <>
                              <span>•</span>
                              <span>Client: {doc.client.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{doc.user?.name}</p>
                      <p className="text-xs text-gray-500">{doc.user?.email}</p>
                    </div>
                  </div>
                </div>
              ))}
              {documents.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No documents found for this firm.
                </div>
              )}
              {pagination.total > pagination.limit && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                  </span>
                  <button
                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                    className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Queries Modal Component
function QueriesModal({ firmId, onClose }: { firmId: string; onClose: () => void }) {
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [firm, setFirm] = useState<{ name: string } | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, limit: 10 });

  useEffect(() => {
    const fetchQueries = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: { firm: { name: string }; queries: any[]; pagination: any } }>(`/api/platform-admin/firms/${firmId}/queries?page=${pagination.page}&limit=${pagination.limit}`);
        if (res.success) {
          setQueries(res.data.queries);
          setFirm(res.data.firm);
          setPagination(res.data.pagination);
        }
      } catch (error) {
        console.error("Failed to fetch queries:", error);
      } finally {
        setLoading(false);
      }
    };
    void fetchQueries();
  }, [firmId, pagination.page, pagination.limit]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Query History - {firm?.name}</h2>
            <p className="text-sm text-gray-600">AI query logs and analytics</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {queries.map((query) => (
                <div key={query.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{query.user?.name}</p>
                          <p className="text-xs text-gray-500">{formatDate(query.createdAt)}</p>
                        </div>
                      </div>
                      <div className="ml-11">
                        <p className="text-sm text-gray-900 mb-2">
                          <span className="font-medium">Query: </span>
                          {truncateText(query.query, 100)}
                        </p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Response: </span>
                          {truncateText(query.result, 150)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500 space-y-1">
                      <div>Tokens: {(query.llmTokensPrompt || 0) + (query.llmTokensCompletion || 0)}</div>
                      <div>Cost: {formatCurrency(query.llmCostInr || 0)}</div>
                      <div>Duration: {query.durationMs || 0}ms</div>
                    </div>
                  </div>
                </div>
              ))}
              {queries.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No queries found for this firm.
                </div>
              )}
              {pagination.total > pagination.limit && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
                  </span>
                  <button
                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                    className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}