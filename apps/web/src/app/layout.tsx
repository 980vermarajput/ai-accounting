import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "../contexts/user-context";

export const metadata: Metadata = {
  title: "AI Assistant for Accountants",
  description:
    "A secure AI assistant for Indian chartered accountants — search emails, documents, and get instant answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-secondary antialiased">
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
