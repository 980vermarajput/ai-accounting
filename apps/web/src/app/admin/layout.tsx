"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminUser } from "../../contexts/admin-context";
import { AdminNav } from "../../components/admin-nav";
import { Spinner } from "@/components/ui";

/**
 * Platform Admin Layout
 * Wraps all /admin routes. Redirects to sign-in if not a platform admin.
 * Unlike the regular app layout, this operates outside firm context.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { adminUser, isLoading } = useAdminUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !adminUser) {
      router.replace("/sign-in?error=admin_required");
    }
  }, [adminUser, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 bg-surface-secondary">
        <Spinner size="md" />
        <span className="text-sm text-muted">Loading admin dashboard…</span>
      </div>
    );
  }

  if (!adminUser) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-purple-50 overflow-hidden">
      <AdminNav />
      <main className="ml-64 flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}