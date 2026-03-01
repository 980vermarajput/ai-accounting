"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "../contexts/user-context";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", emoji: "💬" },
  { href: "/documents", label: "Documents", emoji: "📄" },
  { href: "/clients", label: "Clients", emoji: "👥" },
  { href: "/sync", label: "Sync", emoji: "🔄" },
  { href: "/drafts", label: "Drafts", emoji: "✉️" },
];

export function AppNav() {
  const pathname = usePathname();
  const { user, logout } = useUser();

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-200 flex flex-col z-10">
      {/* Logo + firm name */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-200">
        <div className="w-8 h-8 rounded-lg bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
          CA
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {user?.firm?.name ?? "…"}
          </p>
          <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, emoji }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="text-base leading-none">{emoji}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">
              {user?.name}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
