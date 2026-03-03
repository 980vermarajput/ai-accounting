"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";
import {
  Building,
  Activity,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  Server
} from "lucide-react";

interface PlatformMetrics {
  totalFirms: number;
  totalTokensLast30d: number;
  estimatedCostLast30d: number;
  queriesLast24h: number;
  p95LatencyMs: number;
}

interface Firm {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  _count: {
    users: number;
    documents: number;
    queries: number;
  };
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [recentFirms, setRecentFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, firmsRes] = await Promise.all([
          apiFetch<{ success: boolean; data: PlatformMetrics }>("/api/platform-admin/usage"),
          apiFetch<{ success: boolean; data: Firm[] }>("/api/platform-admin/firms")
        ]);

        if (metricsRes.success) setMetrics(metricsRes.data);
        if (firmsRes.success) setRecentFirms(firmsRes.data.slice(0, 5)); // Top 5 recent
      } catch (error) {
        console.error("Failed to fetch admin data:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Platform Admin Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Monitor and manage the entire AI Accounting platform
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-purple-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Firms</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {metrics?.totalFirms ?? 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Building className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Queries (24h)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(metrics?.queriesLast24h ?? 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Cost (30d)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(metrics?.estimatedCostLast30d ?? 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-orange-50 to-red-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">P95 Latency</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {metrics?.p95LatencyMs ?? 0}ms
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Usage */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Token Usage</h3>
              <p className="text-sm text-gray-600">Last 30 days</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Tokens</span>
              <span className="text-sm font-medium text-gray-900">
                {formatNumber(metrics?.totalTokensLast30d ?? 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Estimated Cost</span>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(metrics?.estimatedCostLast30d ?? 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Performance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Performance</h3>
              <p className="text-sm text-gray-600">System health</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">P95 Latency</span>
              <span className={`text-sm font-medium ${
                (metrics?.p95LatencyMs ?? 0) < 1000 ? 'text-green-600' :
                (metrics?.p95LatencyMs ?? 0) < 3000 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {metrics?.p95LatencyMs ?? 0}ms
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Status</span>
              <span className="text-sm font-medium text-green-600">
                Healthy
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Firms */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Firms</h3>
              <p className="text-sm text-gray-600">Newest registered firms</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {recentFirms.map((firm) => (
              <div key={firm.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                <div>
                  <h4 className="font-medium text-gray-900">{firm.name}</h4>
                  <p className="text-sm text-gray-600">/{firm.slug}</p>
                  <p className="text-xs text-gray-500">
                    Created {new Date(firm.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span>{firm._count.users} users</span>
                    <span>{firm._count.documents} docs</span>
                    <span>{firm._count.queries} queries</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}