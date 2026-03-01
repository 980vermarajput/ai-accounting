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
  Smartphone,
  Zap,
  Shield,
  Users,
  BarChart3,
  Clock,
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
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {flash && <FlashMessage variant={flash.type} message={flash.message} />}

      {/* Header Section with Gradient */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl"></div>
        <div className="relative bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 rounded-2xl blur-xl"></div>
              <div className="relative bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-2xl shadow-lg">
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Telegram Integration
              </h1>
              <p className="text-lg text-muted-foreground mt-1">
                Connect your Telegram account for instant access to firm data
              </p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  <span>Mobile-first</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <span>Real-time</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span>Secure</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Status Card */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${status?.linked ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                {status?.linked ? (
                  <MessageCircle className="h-5 w-5" />
                ) : (
                  <MessageCircle className="h-5 w-5" />
                )}
              </div>
              <span>Connection Status</span>
            </div>
            {status?.linked ? (
              <Badge variant="success" className="animate-pulse">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {status?.linked ? (
            <>
              {/* Success State - Connected */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200/50 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-xl mx-auto mb-3">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="text-sm text-gray-600 mb-1">Username</div>
                    <div className="font-semibold text-gray-900">
                      {status.telegramUsername ? `@${status.telegramUsername}` : "—"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-xl mx-auto mb-3">
                      <Clock className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="text-sm text-gray-600 mb-1">Linked on</div>
                    <div className="font-semibold text-gray-900">
                      {status.linkedAt
                        ? new Date(status.linkedAt).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-orange-100 rounded-xl mx-auto mb-3">
                      <Bell className="h-6 w-6 text-orange-600" />
                    </div>
                    <div className="text-sm text-gray-600 mb-1">Alerts</div>
                    <Badge variant={status.alertsEnabled ? "success" : "outline"} className="font-medium">
                      {status.alertsEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="secondary"
                  onClick={handleToggleAlerts}
                  disabled={togglingAlerts}
                  className="flex-1 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 hover:from-blue-100 hover:to-purple-100 transition-all duration-200"
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

                <Button variant="danger" onClick={handleUnlink} disabled={unlinking} className="sm:w-auto">
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
              {/* Not Connected State */}
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-8 w-8 text-blue-600" />
                </div>
                <p className="text-lg text-gray-700 mb-2">Ready to Connect</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Link your Telegram account to chat with AICA bot for quick queries, client
                  lookups, daily summaries, and real-time alerts.
                </p>
              </div>

              {linkCode ? (
                <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 border border-blue-200/50 rounded-2xl p-6 space-y-6">
                  {/* Link Code Display */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-3 mb-4">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-gray-700">Your Link Code</span>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-white/50 shadow-lg">
                      <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-mono text-2xl font-bold tracking-[0.5em] shadow-lg">
                          {linkCode.code}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyCode}
                          className="h-10 w-10 p-0 rounded-xl hover:bg-blue-50 transition-colors"
                        >
                          {copied ? (
                            <Check className="h-5 w-5 text-green-500" />
                          ) : (
                            <Copy className="h-5 w-5 text-blue-600" />
                          )}
                        </Button>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-sm text-orange-600 font-medium">
                        <Clock className="h-4 w-4" />
                        <span>Expires in {formatTime(countdown)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-white/60 rounded-xl p-6">
                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                      Quick Setup Guide
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                        <span className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                        <div>
                          <div className="text-sm text-gray-700">
                            Open Telegram and find{" "}
                            <a
                              href={`https://t.me/${linkCode.botUsername}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline"
                            >
                              @{linkCode.botUsername}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                        <span className="bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                        <div>
                          <div className="text-sm text-gray-700 mb-2">Send this command:</div>
                          <div className="bg-gray-900 text-green-400 font-mono text-sm p-2 rounded border">
                            /link {linkCode.code}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                        <div className="text-sm text-gray-700">
                          🎉 Done! Start chatting with AICA
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={handleGenerateCode}
                    disabled={generatingCode}
                    className="w-full bg-gradient-to-r from-blue-100 to-purple-100 border-blue-200 hover:from-blue-200 hover:to-purple-200 transition-all duration-200"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate New Code
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Button
                    onClick={handleGenerateCode}
                    disabled={generatingCode}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    {generatingCode ? (
                      <Spinner className="h-4 w-4 mr-2" />
                    ) : (
                      <LinkIcon className="h-4 w-4 mr-2" />
                    )}
                    Generate Link Code
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Features Section */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
            What can you do with AICA Bot?
          </h2>
          <p className="text-muted-foreground">
            Powerful commands to manage your firm on the go
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<MessageCircle className="h-6 w-6" />}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            title="/ask"
            description="Ask questions about your firm data using AI"
            example="Find all invoices for ABC Corp"
          />
          <FeatureCard
            icon={<Users className="h-6 w-6" />}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            title="/clients"
            description="Browse and search your client list"
            example="Show me all active clients"
          />
          <FeatureCard
            icon={<BarChart3 className="h-6 w-6" />}
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
            title="/summary"
            description="Get today's briefing and metrics"
            example="Daily overview with alerts"
          />
          <FeatureCard
            icon={<Bell className="h-6 w-6" />}
            iconBg="bg-orange-100"
            iconColor="text-orange-600"
            title="/alerts"
            description="Toggle real-time notifications"
            example="Enable deadline reminders"
          />
        </div>

        <Card className="border-0 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-medium text-gray-700 border border-white/50">
                <Zap className="h-4 w-4 text-yellow-500" />
                More commands available
              </div>
              <p className="text-sm text-gray-600 max-w-2xl mx-auto">
                Use <code className="bg-white/60 px-2 py-1 rounded text-xs">/help</code> in Telegram to see all available commands including
                <code className="bg-white/60 px-2 py-1 rounded text-xs ml-1">/start</code>,
                <code className="bg-white/60 px-2 py-1 rounded text-xs ml-1">/link</code>, and
                <code className="bg-white/60 px-2 py-1 rounded text-xs ml-1">/unlink</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  example,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  example: string;
}) {
  return (
    <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-1 bg-gradient-to-br from-white to-gray-50/50">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Icon and Title */}
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${iconBg} ${iconColor}`}>
              {icon}
            </div>
            <div>
              <p className="font-mono font-bold text-sm text-gray-900">{title}</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed">{description}</p>

          {/* Example */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">Example:</p>
            <p className="text-xs italic text-gray-500 bg-gray-50 px-2 py-1 rounded">
              "{example}"
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
