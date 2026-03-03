"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminUser } from "../contexts/admin-context";
import { apiFetch } from "../lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building,
  Activity,
  AlertTriangle,
  Settings,
  LogOut,
  Shield,
  BarChart3,
  Users,
} from "lucide-react";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/firms", label: "Firms", icon: Building },
  { href: "/admin/usage", label: "Usage & Costs", icon: BarChart3 },
  { href: "/admin/failures", label: "Sync Failures", icon: AlertTriangle },
  { href: "/admin/users", label: "User Management", icon: Users },
  { href: "/admin/metrics", label: "Metrics", icon: Activity },
];

export function AdminNav() {
  const pathname = usePathname();
  const { adminUser, logout } = useAdminUser();
  const [platformStats, setPlatformStats] = useState({
    totalFirms: 0,
    totalRequests: 0,
    failures: 0
  });

  const fetchPlatformStats = useCallback(async () => {
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: {
          totalFirms?: number;
          totalRequestsToday?: number;
          syncFailures?: number;
        };
      }>("/api/platform-admin/usage");

      if (res.success && res.data) {
        setPlatformStats({
          totalFirms: res.data.totalFirms ?? 0,
          totalRequests: res.data.totalRequestsToday ?? 0,
          failures: res.data.syncFailures ?? 0,
        });
      }
    } catch {
      // Ignore — stats stay at defaults
    }
  }, []);

  useEffect(() => {
    void fetchPlatformStats();
    const interval = setInterval(() => void fetchPlatformStats(), 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [fetchPlatformStats]);

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-purple-900 via-purple-800 to-blue-900 flex flex-col z-10 border-r border-purple-700/50">
      {/* Platform Admin Header */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-purple-700/50 bg-gradient-to-r from-purple-800/50 to-transparent">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl blur-sm"></div>
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-lg">
            <Shield className="h-6 w-6" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-purple-100">
            Platform Admin
          </p>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-[11px] text-emerald-400 font-medium">Admin Mode</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-4 py-4 border-b border-purple-700/30">
        <div className="grid grid-cols-1 gap-2">
          <div className="bg-gradient-to-r from-purple-800/40 to-blue-800/40 rounded-lg p-3 backdrop-blur-sm border border-purple-600/30">
            <div className="flex justify-between items-center">
              <span className="text-xs text-purple-200">Total Firms</span>
              <span className="text-sm font-bold text-white">{platformStats.totalFirms}</span>
            </div>
          </div>
          <div className="bg-gradient-to-r from-blue-800/40 to-purple-800/40 rounded-lg p-3 backdrop-blur-sm border border-blue-600/30">
            <div className="flex justify-between items-center">
              <span className="text-xs text-blue-200">Requests Today</span>
              <span className="text-sm font-bold text-white">{platformStats.totalRequests}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30",
                active
                  ? "bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-white border border-purple-500/30 shadow-lg backdrop-blur-sm"
                  : "text-purple-300 hover:bg-purple-800/60 hover:text-white hover:translate-x-1 border border-transparent",
              )}
            >
              <Icon className={cn(
                "h-5 w-5 shrink-0 transition-all duration-200",
                active
                  ? "text-purple-400 drop-shadow-sm"
                  : "text-purple-400 group-hover:text-purple-200"
              )} />
              {label}
              {href === "/admin/failures" && platformStats.failures > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-full shadow-lg animate-pulse">
                  {platformStats.failures > 99 ? "99+" : platformStats.failures}
                </span>
              )}
            </Link>
          );
        })}

        {/* Platform Settings */}
        <div className="pt-4">
          <div className="px-4 pb-2">
            <h3 className="text-xs font-semibold text-purple-500 uppercase tracking-wider">Platform</h3>
          </div>

          <Link
            href="/admin/settings"
            className={cn(
              "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30",
              pathname.startsWith("/admin/settings")
                ? "bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-white border border-purple-500/30 shadow-lg backdrop-blur-sm"
                : "text-purple-300 hover:bg-purple-800/60 hover:text-white hover:translate-x-1 border border-transparent",
            )}
          >
            <Settings className={cn(
              "h-5 w-5 shrink-0 transition-all duration-200",
              pathname.startsWith("/admin/settings")
                ? "text-purple-400 drop-shadow-sm"
                : "text-purple-400 group-hover:text-purple-200"
            )} />
            Platform Settings
          </Link>
        </div>
      </nav>

      {/* Admin User Section */}
      <div className="border-t border-purple-700/50 p-6 bg-gradient-to-r from-purple-800/30 to-transparent">
        <div className="flex items-center gap-3 min-w-0 mb-4">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-lg">
              {adminUser?.name?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-purple-900">
              <Shield className="h-2 w-2 text-purple-900 absolute inset-0.5" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-purple-200 truncate">{adminUser?.name}</p>
            <p className="text-xs text-purple-400 truncate">{adminUser?.email}</p>
            <p className="text-[10px] text-purple-300 font-medium">Platform Admin</p>
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="group flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-purple-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <LogOut className="h-4 w-4 group-hover:rotate-6 transition-transform" />
          Sign out
        </button>
      </div>
    </aside>
  );
}