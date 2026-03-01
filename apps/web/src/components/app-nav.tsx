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
    <aside className="fixed inset-y-0 left-0 w-56 bg-gray-900 flex flex-col z-10">
      {/* Logo + firm name */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          CA
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">
            {user?.firm?.name ?? "…"}
          </p>
          <p className="text-[11px] text-gray-500 capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {href === "/dashboard" && unreadAlerts > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-800 p-4 space-y-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-700 text-gray-300 text-xs font-bold flex items-center justify-center shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-300 truncate">{user?.name}</p>
            <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
