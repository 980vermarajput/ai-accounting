"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/api";
import {
  AlertTriangle,
  Calendar,
  User,
  Building,
  RefreshCw,
  Clock,
  ExternalLink
} from "lucide-react";

interface SyncFailure {
  id: string;
  status: string;
  createdAt: string;
  errorMessage: string | null;
  syncType: string | null;
  firm: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export default function AdminSyncFailures() {
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFailures = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: SyncFailure[] }>("/api/platform-admin/sync-failures");
        if (res.success) {
          setFailures(res.data);
        }
      } catch (error) {
        console.error("Failed to fetch sync failures:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchFailures();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: SyncFailure[] }>("/api/platform-admin/sync-failures");
      if (res.success) {
        setFailures(res.data);
      }
    } catch (error) {
      console.error("Failed to refresh failures:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const getSyncTypeColor = (syncType: string | null) => {
    if (!syncType) return 'bg-gray-100 text-gray-800';

    switch (syncType.toLowerCase()) {
      case 'gmail':
        return 'bg-red-100 text-red-800';
      case 'documents':
        return 'bg-blue-100 text-blue-800';
      case 'full':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
            Sync Failures
          </h1>
          <p className="text-gray-600 mt-2">
            Monitor and troubleshoot synchronization failures across all firms
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={refreshData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
            <span className="text-sm text-gray-600">Total Failures: </span>
            <span className="font-semibold text-red-600">{failures.length}</span>
          </div>
        </div>
      </div>

      {/* Failures List */}
      <div className="space-y-4">
        {failures.map((failure) => (
          <div key={failure.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSyncTypeColor(failure.syncType)}`}>
                      {failure.syncType || 'Unknown'}
                    </span>
                    <span className="text-sm text-red-600 font-medium">
                      {failure.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(failure.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(failure.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Firm and User Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Building className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{failure.firm.name}</p>
                  <p className="text-xs text-gray-600">/{failure.firm.slug}</p>
                </div>
                <a
                  href={`/firm/${failure.firm.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Visit firm"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{failure.user.name}</p>
                  <p className="text-xs text-gray-600">{failure.user.email}</p>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {failure.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-red-800 mb-2">Error Details</h4>
                <p className="text-sm text-red-700 font-mono">
                  {failure.errorMessage}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2">
              <button className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">
                View Details
              </button>
              <button className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors">
                Retry Sync
              </button>
              <button className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
                Contact User
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {failures.length === 0 && (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Sync Failures</h3>
          <p className="text-gray-600">
            Great! All synchronization processes are running smoothly.
          </p>
        </div>
      )}
    </div>
  );
}