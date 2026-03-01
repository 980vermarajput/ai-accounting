"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";
import { Spinner } from "@/components/ui";

/** Root page: redirect to /chat when signed in, /sign-in when not. */
export default function Home() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/chat" : "/sign-in");
  }, [user, isLoading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-surface-secondary">
      <Spinner size="md" />
    </div>
  );
}
