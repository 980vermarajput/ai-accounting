"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  ApiResponse,
  TelegramLinkStatus,
  TelegramLinkCodeResponse,
} from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  FlashMessage,
  Spinner,
  Badge,
} from "@/components/ui";
import {
  MessageCircle,
  Link as LinkIcon,
  Unlink,
  Bell,
  BellOff,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

type FlashState = { type: "success" | "error"; message: string } | null;

export default function TelegramSettingsPage() {
  const [status, setStatus] = useState<TelegramLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<FlashState>(null);

  // Link code state
  const [linkCode, setLinkCode] = useState<TelegramLinkCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Action states
  const [unlinking, setUnlinking] = useState(false);
  const [togglingAlerts, setTogglingAlerts] = useState(false);

  const showFlash = (type: "success" | "error", message: string) => {
    setFlash({ type, message });
    setTimeout(() => setFlash(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch<ApiResponse<TelegramLinkStatus>>(
        "/api/settings/telegram/status",
      );
      if (res.success && res.data) {
        setStatus(res.data);
      }
    } catch {
      showFlash("error", "Failed to load Telegram status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Countdown timer for link code expiration
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setLinkCode(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await apiFetch<ApiResponse<TelegramLinkCodeResponse>>(
        "/api/settings/telegram/link-code",
        { method: "POST" },
      );
      if (res.success && res.data) {
        setLinkCode(res.data);
        setCountdown(res.data.expiresIn);
      }
    } catch {
      showFlash("error", "Failed to generate link code");
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = async () => {
    if (!linkCode) return;
    await navigator.clipboard.writeText(linkCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUnlink = async () => {
    if (!confirm("Are you sure you want to unlink your Telegram account?")) return;
    setUnlinking(true);
    try {
      await apiFetch("/api/settings/telegram/unlink", { method: "DELETE" });
      setStatus({ linked: false, alertsEnabled: false });
      setLinkCode(null);
      showFlash("success", "Telegram account unlinked successfully");
    } catch {
      showFlash("error", "Failed to unlink Telegram account");
    } finally {
      setUnlinking(false);
    }
  };

  const handleToggleAlerts = async () => {
    if (!status) return;
    setTogglingAlerts(true);
    try {
      const newEnabled = !status.alertsEnabled;
      await apiFetch("/api/settings/telegram/notifications", {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled }),
      });
      setStatus({ ...status, alertsEnabled: newEnabled });
      showFlash("success", `Alerts ${newEnabled ? "enabled" : "disabled"}`);
    } catch {
      showFlash("error", "Failed to update alert settings");
    } finally {
      setTogglingAlerts(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {flash && <FlashMessage variant={flash.type} message={flash.message} />}

      <div className="flex items-center gap-3">
        <MessageCircle className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold">Telegram Integration</h1>
          <p className="text-muted-foreground">
            Connect your Telegram account to query your firm data on the go
          </p>
        </div>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Connection Status
            {status?.linked ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.linked ? (
            <>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Telegram Username</span>
                  <span className="font-medium">
                    {status.telegramUsername ? `@${status.telegramUsername}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Linked on</span>
                  <span className="font-medium">
                    {status.linkedAt
                      ? new Date(status.linkedAt).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Alerts</span>
                  <Badge variant={status.alertsEnabled ? "success" : "outline"}>
                    {status.alertsEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={handleToggleAlerts}
                  disabled={togglingAlerts}
                >
                  {togglingAlerts ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : status.alertsEnabled ? (
                    <BellOff className="h-4 w-4 mr-2" />
                  ) : (
                    <Bell className="h-4 w-4 mr-2" />
                  )}
                  {status.alertsEnabled ? "Disable Alerts" : "Enable Alerts"}
                </Button>

                <Button variant="danger" onClick={handleUnlink} disabled={unlinking}>
                  {unlinking ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : (
                    <Unlink className="h-4 w-4 mr-2" />
                  )}
                  Unlink Account
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Link your Telegram account to chat with AICA bot for quick queries, client
                lookups, daily summaries, and real-time alerts.
              </p>

              {linkCode ? (
                <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      Send this code to the bot:
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="text-3xl font-mono font-bold tracking-wider">
                        {linkCode.code}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyCode}
                        className="h-8 w-8 p-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Expires in {formatTime(countdown)}
                    </p>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-2">Steps to link:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>
                        Open Telegram and search for{" "}
                        <a
                          href={`https://t.me/${linkCode.botUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          @{linkCode.botUsername}
                          <ExternalLink className="h-3 w-3 inline ml-1" />
                        </a>
                      </li>
                      <li>
                        Start a chat and send: <code>/link {linkCode.code}</code>
                      </li>
                      <li>Done! You can now use AICA from Telegram</li>
                    </ol>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={handleGenerateCode}
                    disabled={generatingCode}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate New Code
                  </Button>
                </div>
              ) : (
                <Button onClick={handleGenerateCode} disabled={generatingCode}>
                  {generatingCode ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-2" />
                  )}
                  Generate Link Code
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Features Card */}
      <Card>
        <CardHeader>
          <CardTitle>What can you do?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureItem
              icon="💬"
              title="/ask"
              description="Ask questions about your firm data using RAG"
            />
            <FeatureItem
              icon="👥"
              title="/clients"
              description="Browse and search your client list"
            />
            <FeatureItem
              icon="📊"
              title="/summary"
              description="Get today's briefing and alert summary"
            />
            <FeatureItem
              icon="🔔"
              title="/alerts"
              description="Toggle real-time deadline alerts"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-medium font-mono text-sm">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
