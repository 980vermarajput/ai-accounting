"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../contexts/user-context";

/** Root page: redirect to /chat when signed in, /sign-in when not. */
export default function Home() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/chat" : "/sign-in");
  }, [user, isLoading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}
