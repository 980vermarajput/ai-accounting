"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/api";
import {
  Activity,
  TrendingUp,
  BarChart3,
  Clock,
  Users,
  Building,
  Zap,
  AlertCircle,
  RefreshCw
} from "lucide-react";

interface MetricsData {
  totalRequestsToday: number;
  totalRequestsLast30Days: number;
  p95LatencyMs: number;
  topRoutesByRequests: Array<{ route: string; requests: number }>;
}

export default function AdminMetrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      // For now, simulate metrics data since we don't have a dedicated metrics endpoint
      // In a real implementation, you'd call: /api/platform-admin/metrics

      const simulatedMetrics: MetricsData = {
        totalRequestsToday: 1247,
        totalRequestsLast30Days: 34589,
        p95LatencyMs: 842,
        topRoutesByRequests: [
          { route: "/api/chat", requests: 4521 },
          { route: "/api/documents", requests: 2847 },
          { route: "/api/auth/me", requests: 1923 },
          { route: "/api/dashboard/command-centre", requests: 1456 },
          { route: "/api/sync", requests: 987 }
        ]
      };

      setMetrics(simulatedMetrics);
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const getLatencyStatus = (latency: number) => {
    if (latency < 500) return { status: 'Excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (latency < 1000) return { status: 'Good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (latency < 2000) return { status: 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { status: 'Poor', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const latencyStatus = getLatencyStatus(metrics?.p95LatencyMs ?? 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Performance Metrics
          </h1>
          <p className="text-gray-600 mt-2">
            Real-time platform performance monitoring and analytics
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Requests Today</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(metrics?.totalRequestsToday ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">API calls</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Requests (30d)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(metrics?.totalRequestsLast30Days ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total volume</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
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

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Daily</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(Math.round((metrics?.totalRequestsLast30Days ?? 0) / 30))}
              </p>
              <p className="text-xs text-gray-500 mt-1">Requests/day</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Performance Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Routes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Top API Routes</h3>
              <p className="text-sm text-gray-600">Most requested endpoints</p>
            </div>
          </div>

          <div className="space-y-4">
            {metrics?.topRoutesByRequests.map((route, index) => {
              const maxRequests = metrics.topRoutesByRequests[0]?.requests || 1;
              const percentage = (route.requests / maxRequests) * 100;

              return (
                <div key={route.route} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-900 font-mono">
                      {route.route}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {formatNumber(route.requests)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        index === 0 ? 'bg-indigo-600' :
                        index === 1 ? 'bg-blue-500' :
                        index === 2 ? 'bg-purple-500' :
                        index === 3 ? 'bg-pink-500' :
                        'bg-gray-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
              <p className="text-sm text-gray-600">Performance indicators</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Response Time</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900">
                  {metrics?.p95LatencyMs ?? 0}ms
                </span>
                <br />
                <span className={`text-xs ${latencyStatus.color}`}>
                  {latencyStatus.status}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Request Rate</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900">
                  {((metrics?.totalRequestsToday ?? 0) / 24).toFixed(1)}/hr
                </span>
                <br />
                <span className="text-xs text-green-600">Stable</span>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Building className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Active Endpoints</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900">
                  {metrics?.topRoutesByRequests.length ?? 0}
                </span>
                <br />
                <span className="text-xs text-blue-600">Monitored</span>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Peak Load</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900">
                  {Math.round((metrics?.totalRequestsToday ?? 0) / 16)} req/hr
                </span>
                <br />
                <span className="text-xs text-green-600">Within limits</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(metrics?.p95LatencyMs ?? 0) > 1500 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            <div>
              <h3 className="text-lg font-semibold text-orange-900">Performance Warning</h3>
              <p className="text-orange-700 mt-1">
                P95 latency is elevated ({metrics?.p95LatencyMs}ms). Consider investigating slow endpoints or scaling infrastructure.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Implementation Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-blue-800">
          <BarChart3 className="w-5 h-5" />
          <span className="font-medium">Development Note</span>
        </div>
        <p className="text-blue-700 text-sm mt-1">
          This page shows simulated metrics data. To implement real-time monitoring, integrate with your metrics collection system (Redis-based metrics in your current setup) and create dedicated API endpoints for metrics data.
        </p>
      </div>
    </div>
  );
}