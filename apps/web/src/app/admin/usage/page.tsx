"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/api";
import {
  DollarSign,
  TrendingUp,
  Activity,
  BarChart3,
  Clock,
  Zap,
  Target,
  AlertCircle
} from "lucide-react";

interface UsageMetrics {
  totalFirms: number;
  totalTokensLast30d: number;
  estimatedCostLast30d: number;
  queriesLast24h: number;
  p95LatencyMs: number;
}

export default function AdminUsage() {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: UsageMetrics }>("/api/platform-admin/usage");
        if (res.success) {
          setMetrics(res.data);
        }
      } catch (error) {
        console.error("Failed to fetch usage metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
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

  const formatTokens = (tokens: number) => {
    if (tokens > 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens > 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const getLatencyStatus = (latency: number) => {
    if (latency < 1000) return { status: 'Excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (latency < 3000) return { status: 'Good', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { status: 'Needs Attention', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const latencyStatus = getLatencyStatus(metrics?.p95LatencyMs ?? 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
          Usage & Costs
        </h1>
        <p className="text-gray-600 mt-2">
          Monitor platform usage, costs, and performance metrics
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Cost (30d)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(metrics?.estimatedCostLast30d ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">LLM API costs</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tokens (30d)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatTokens(metrics?.totalTokensLast30d ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total consumed</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Queries (24h)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(metrics?.queriesLast24h ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">API requests</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-purple-600" />
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
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${latencyStatus.bg} ${latencyStatus.color} mt-1`}>
                {latencyStatus.status}
              </span>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cost Analysis</h3>
              <p className="text-sm text-gray-600">Last 30 days breakdown</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Total LLM Cost</p>
                <p className="text-xs text-gray-600">OpenAI API charges</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(metrics?.estimatedCostLast30d ?? 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Cost per Token</p>
                <p className="text-xs text-gray-600">Average rate</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                ₹{((metrics?.estimatedCostLast30d ?? 0) / Math.max(metrics?.totalTokensLast30d ?? 1, 1) * 1000).toFixed(4)}/K
              </span>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Daily Average</p>
                <p className="text-xs text-gray-600">Estimated daily cost</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency((metrics?.estimatedCostLast30d ?? 0) / 30)}
              </span>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Performance</h3>
              <p className="text-sm text-gray-600">System health metrics</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">P95 Latency</p>
                <p className="text-xs text-gray-600">95th percentile response time</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-gray-900">
                  {metrics?.p95LatencyMs ?? 0}ms
                </span>
                <br />
                <span className={`text-xs ${latencyStatus.color}`}>
                  {latencyStatus.status}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Active Firms</p>
                <p className="text-xs text-gray-600">Total registered</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {metrics?.totalFirms ?? 0}
              </span>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Query Volume</p>
                <p className="text-xs text-gray-600">Last 24 hours</p>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {formatNumber(metrics?.queriesLast24h ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Insights */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Usage Insights</h3>
            <p className="text-sm text-gray-600">Key platform metrics</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-900">Cost Efficiency</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              ₹{((metrics?.estimatedCostLast30d ?? 0) / Math.max(metrics?.totalFirms ?? 1, 1)).toFixed(2)}
            </p>
            <p className="text-xs text-gray-600">Average cost per firm (30d)</p>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">Engagement</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {((metrics?.queriesLast24h ?? 0) / Math.max(metrics?.totalFirms ?? 1, 1)).toFixed(1)}
            </p>
            <p className="text-xs text-gray-600">Queries per firm (24h)</p>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-gray-900">Token Usage</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">
              {formatTokens((metrics?.totalTokensLast30d ?? 0) / Math.max(metrics?.totalFirms ?? 1, 1))}
            </p>
            <p className="text-xs text-gray-600">Tokens per firm (30d)</p>
          </div>
        </div>
      </div>

      {/* Health Alerts */}
      {(metrics?.p95LatencyMs ?? 0) > 3000 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="text-lg font-semibold text-red-900">Performance Alert</h3>
              <p className="text-red-700 mt-1">
                P95 latency is higher than recommended (&gt;3000ms). Consider optimizing API responses or scaling infrastructure.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}