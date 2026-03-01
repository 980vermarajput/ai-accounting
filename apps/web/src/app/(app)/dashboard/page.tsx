"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../../lib/api";
import { cn, fmtDate } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Spinner,
} from "@/components/ui";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle,
  Clock,
  FileText,
  TrendingUp,
  Users,
  Zap,
  Eye,
  ShieldCheck,
  Activity,
  BarChart3,
  Shield,
} from "lucide-react";
import type { ApiResponse, CommandCentreResponse, Alert } from "@ai-accounting/shared";

// ─── Severity helpers ────────────────────────────────────────────

const SEVERITY_CONFIG = {
  CRITICAL: { variant: "danger" as const, icon: AlertTriangle, label: "Critical" },
  HIGH: { variant: "warning" as const, icon: AlertTriangle, label: "High" },
  MEDIUM: { variant: "info" as const, icon: Bell, label: "Medium" },
  LOW: { variant: "default" as const, icon: Bell, label: "Low" },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  INVOICE_OVERDUE: "Invoice Overdue",
  CLIENT_SILENT: "Client Silent",
  DEADLINE_DETECTED: "Deadline Detected",
  HIGH_RISK_LANGUAGE: "High Risk Language",
  SYNC_FAILURE: "Sync Failure",
  TOKEN_CAP_WARNING: "Token Cap Warning",
};

// ─── Dashboard page ──────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<CommandCentreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch<ApiResponse<CommandCentreResponse>>(
        "/api/dashboard/command-centre",
      );
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    // Refresh every 5 minutes
    const interval = setInterval(() => void fetchDashboard(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const markAsRead = async (alertId: string) => {
    try {
      await apiFetch(`/api/dashboard/alerts/${alertId}/read`, {
        method: "PATCH",
      });
      void fetchDashboard();
    } catch {
      // silent
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      await apiFetch(`/api/dashboard/alerts/${alertId}/resolve`, {
        method: "PATCH",
      });
      void fetchDashboard();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3">
        <Spinner size="md" />
        <span className="text-sm text-muted">Loading command centre…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm text-muted">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              void fetchDashboard();
            }}
            className="text-sm text-primary-600 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Enhanced Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl"></div>
        <div className="relative bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-2xl blur-xl"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-4 rounded-2xl shadow-lg">
                  <Activity className="h-8 w-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Command Centre
                </h1>
                <p className="text-lg text-muted-foreground mt-1">
                  Real-time firm overview and intelligent alerts
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    <span>Live monitoring</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>AI insights</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span>Proactive alerts</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Token Usage */}
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/50">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Zap className="h-4 w-4" />
                  <span>Token Usage</span>
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {data.tokenUsage.today.toLocaleString()} / {data.tokenUsage.cap.toLocaleString()}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (data.tokenUsage.today / data.tokenUsage.cap) * 100)}%`
                    }}
                  ></div>
                </div>
              </div>

              {/* Alert Badge */}
              {data.unreadAlertCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <Badge variant="danger" className="animate-pulse">
                    <Bell className="h-3 w-3 mr-1" />
                    {data.unreadAlertCount} unread alert{data.unreadAlertCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Daily Briefing Card */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-blue-50/30">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span>Daily Briefing</span>
            </div>
            {data.briefing && (
              <Badge variant="success" className="bg-green-100 text-green-700 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                {fmtDate(data.briefing.date)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.briefing ? (
            <div className="space-y-4">
              {/* AI Generated Summary */}
              <div className="bg-white/60 rounded-xl p-6 border border-white/50">
                <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                  {data.briefing.summary}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <Users className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-blue-900">{data.briefing.clientCount}</div>
                  <div className="text-sm text-blue-600">Clients</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 text-center">
                  <Bell className="h-6 w-6 text-amber-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-amber-900">{data.briefing.alertCount}</div>
                  <div className="text-sm text-amber-600">Alerts</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <BarChart3 className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-purple-900">{data.recentActivity.length}</div>
                  <div className="text-sm text-purple-600">Active</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Briefing Pending</h3>
              <p className="text-sm text-muted-foreground">
                Your daily AI briefing will be ready at 7:00 AM IST
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Grid: Alerts + Clients needing attention ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alert Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <CardTitle>Active Alerts</CardTitle>
            <span className="ml-auto text-xs text-muted">{data.alerts.length} shown</span>
          </CardHeader>
          <CardContent className="p-0">
            {data.alerts.length === 0 ? (
              <div className="p-5 text-center">
                <BellOff className="h-6 w-6 text-gray-300 mx-auto mb-1.5" />
                <p className="text-sm text-muted">All clear — no active alerts</p>
              </div>
            ) : (
              <div className="divide-y divide-border-light max-h-96 overflow-y-auto">
                {data.alerts.map((alert: Alert) => {
                  const config = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.LOW;
                  const SeverityIcon = config.icon;
                  return (
                    <div
                      key={alert.id}
                      className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors"
                    >
                      <SeverityIcon
                        className={cn(
                          "h-4 w-4 mt-0.5 shrink-0",
                          alert.severity === "CRITICAL"
                            ? "text-red-500"
                            : alert.severity === "HIGH"
                              ? "text-amber-500"
                              : alert.severity === "MEDIUM"
                                ? "text-blue-500"
                                : "text-gray-400",
                        )}
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {alert.title}
                          </span>
                          <Badge variant={config.variant} className="text-[10px]">
                            {config.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted line-clamp-2">{alert.body}</p>
                        {alert.client && (
                          <span className="text-[11px] text-gray-500">
                            Client: {alert.client.name}
                          </span>
                        )}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[11px] text-gray-400">
                            {fmtDate(alert.createdAt)}
                          </span>
                          <button
                            onClick={() => void markAsRead(alert.id)}
                            className="text-[11px] text-primary-600 hover:underline flex items-center gap-0.5"
                          >
                            <Eye className="h-3 w-3" /> Mark read
                          </button>
                          <button
                            onClick={() => void resolveAlert(alert.id)}
                            className="text-[11px] text-emerald-600 hover:underline flex items-center gap-0.5"
                          >
                            <ShieldCheck className="h-3 w-3" /> Resolve
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clients Needing Attention */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Users className="h-4 w-4 text-orange-500" />
            <CardTitle>Clients Needing Attention</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.clientsNeedingAttention.length === 0 ? (
              <div className="p-5 text-center">
                <CheckCircle className="h-6 w-6 text-emerald-300 mx-auto mb-1.5" />
                <p className="text-sm text-muted">All clients are active</p>
              </div>
            ) : (
              <div className="divide-y divide-border-light">
                {data.clientsNeedingAttention.map((client) => (
                  <div
                    key={client.id}
                    className="px-5 py-3 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {client.name}
                      </p>
                      <p className="text-xs text-muted">{client.identifier}</p>
                    </div>
                    <Badge
                      variant={client.daysSinceLastDocument > 60 ? "danger" : "warning"}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {client.daysSinceLastDocument}d silent
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Recent Activity ──────────────────────────────── */}
      {data.recentActivity.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <FileText className="h-4 w-4 text-primary-600" />
            <CardTitle>Recent Activity (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border-light">
              {data.recentActivity.map((item) => (
                <div
                  key={item.clientId}
                  className="px-5 py-3 flex items-center justify-between"
                >
                  <span className="text-sm text-gray-800">{item.clientName}</span>
                  <Badge variant="primary">
                    <FileText className="h-3 w-3 mr-1" />
                    {item.documentCount} doc{item.documentCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
