"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "../contexts/user-context";
import { apiFetch } from "../lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Users,
  RefreshCw,
  Mail,
  LogOut,
  CalendarClock,
  UserPlus2,
  Send,
  MessageCircle,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/deadlines", label: "Deadlines", icon: CalendarClock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/drafts", label: "Drafts", icon: Mail },
];

export function AppNav() {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: { unreadAlertCount?: number };
      }>("/api/dashboard/command-centre");
      if (res.success && res.data) {
        setUnreadAlerts(res.data.unreadAlertCount ?? 0);
      }
    } catch {
      // Ignore — badge stays at current count
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
    const interval = setInterval(() => void fetchUnreadCount(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col z-10 border-r border-slate-700/50">
      {/* Enhanced Logo + firm name */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/50 to-transparent">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl blur-sm"></div>
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white text-sm font-bold flex items-center justify-center shadow-lg">
            AI
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">
            {user?.firm?.name ?? "…"}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-slate-400 capitalize">{user?.role}</p>
            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-[11px] text-emerald-400 font-medium">Online</p>
          </div>
        </div>
      </div>

      {/* Enhanced Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
                active
                  ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-500/30 shadow-lg backdrop-blur-sm"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-white hover:translate-x-1 border border-transparent",
              )}
            >
              <Icon className={cn(
                "h-5 w-5 shrink-0 transition-all duration-200",
                active
                  ? "text-blue-400 drop-shadow-sm"
                  : "text-slate-400 group-hover:text-slate-200"
              )} />
              {label}
              {href === "/dashboard" && unreadAlerts > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-full shadow-lg animate-pulse">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              )}
            </Link>
          );
        })}

        {/* Settings Section */}
        <div className="pt-4">
          <div className="px-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Settings</h3>
          </div>

          {/* Team settings — admin only */}
          {user?.role === "admin" &&
            (() => {
              const active =
                pathname === "/settings/team" || pathname.startsWith("/settings/team/");
              return (
                <Link
                  href="/settings/team"
                  className={cn(
                    "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
                    active
                      ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-500/30 shadow-lg backdrop-blur-sm"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white hover:translate-x-1 border border-transparent",
                  )}
                >
                  <UserPlus2 className={cn(
                    "h-5 w-5 shrink-0 transition-all duration-200",
                    active
                      ? "text-blue-400 drop-shadow-sm"
                      : "text-slate-400 group-hover:text-slate-200"
                  )} />
                  Team
                </Link>
              );
            })()}

          {/* WhatsApp settings — all users (primary channel) */}
          {(() => {
            const active =
              pathname === "/settings/whatsapp" ||
              pathname.startsWith("/settings/whatsapp/");
            return (
              <Link
                href="/settings/whatsapp"
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30",
                  active
                    ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-white border border-emerald-500/30 shadow-lg backdrop-blur-sm"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white hover:translate-x-1 border border-transparent",
                )}
              >
                <MessageCircle
                  className={cn(
                    "h-5 w-5 shrink-0 transition-all duration-200",
                    active
                      ? "text-emerald-400 drop-shadow-sm"
                      : "text-slate-400 group-hover:text-slate-200",
                  )}
                />
                WhatsApp
              </Link>
            );
          })()}

          {/* Telegram settings — legacy */}
          {(() => {
            const active =
              pathname === "/settings/telegram" ||
              pathname.startsWith("/settings/telegram/");
            return (
              <Link
                href="/settings/telegram"
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
                  active
                    ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-500/30 shadow-lg backdrop-blur-sm"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white hover:translate-x-1 border border-transparent",
                )}
              >
                <Send className={cn(
                  "h-5 w-5 shrink-0 transition-all duration-200",
                  active
                    ? "text-blue-400 drop-shadow-sm"
                    : "text-slate-400 group-hover:text-slate-200"
                )} />
                Telegram
                <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-500">
                  legacy
                </span>
              </Link>
            );
          })()}
        </div>
      </nav>

      {/* Enhanced User Section */}
      <div className="border-t border-slate-700/50 p-6 bg-gradient-to-r from-slate-800/30 to-transparent">
        <div className="flex items-center gap-3 min-w-0 mb-4">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold flex items-center justify-center shadow-lg">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900"></div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="group flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <LogOut className="h-4 w-4 group-hover:rotate-6 transition-transform" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
