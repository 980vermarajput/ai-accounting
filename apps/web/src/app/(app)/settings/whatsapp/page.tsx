"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  ApiResponse,
  WhatsAppLinkStatus,
  WhatsAppLinkCodeResponse,
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
  RefreshCw,
  Smartphone,
  Shield,
  Clock,
  FileText,
} from "lucide-react";

type FlashState = { type: "success" | "error"; message: string } | null;

export default function WhatsAppSettingsPage() {
  const [status, setStatus] = useState<WhatsAppLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<FlashState>(null);

  const [linkCode, setLinkCode] = useState<WhatsAppLinkCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [unlinking, setUnlinking] = useState(false);
  const [togglingAlerts, setTogglingAlerts] = useState(false);

  const showFlash = (type: "success" | "error", message: string) => {
    setFlash({ type, message });
    setTimeout(() => setFlash(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch<ApiResponse<WhatsAppLinkStatus>>(
        "/api/settings/whatsapp/status",
      );
      if (res.success && res.data) setStatus(res.data);
    } catch {
      showFlash("error", "Failed to load WhatsApp status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

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
      const res = await apiFetch<ApiResponse<WhatsAppLinkCodeResponse>>(
        "/api/settings/whatsapp/link-code",
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
    await navigator.clipboard.writeText(`/link ${linkCode.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUnlink = async () => {
    if (!confirm("Are you sure you want to unlink your WhatsApp number?")) return;
    setUnlinking(true);
    try {
      await apiFetch("/api/settings/whatsapp/unlink", { method: "DELETE" });
      setStatus({ linked: false, alertsEnabled: false });
      setLinkCode(null);
      showFlash("success", "WhatsApp number unlinked");
    } catch {
      showFlash("error", "Failed to unlink WhatsApp number");
    } finally {
      setUnlinking(false);
    }
  };

  const handleToggleAlerts = async () => {
    if (!status) return;
    setTogglingAlerts(true);
    try {
      const newEnabled = !status.alertsEnabled;
      await apiFetch("/api/settings/whatsapp/notifications", {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled }),
      });
      setStatus({ ...status, alertsEnabled: newEnabled });
      showFlash("success", `Notifications ${newEnabled ? "enabled" : "disabled"}`);
    } catch {
      showFlash("error", "Failed to update notification settings");
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

      {/* Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-3xl blur-3xl"></div>
        <div className="relative bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-green-500/20 rounded-2xl blur-xl"></div>
              <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-2xl shadow-lg">
                <MessageCircle className="h-8 w-8 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                WhatsApp
              </h1>
              <p className="text-lg text-muted-foreground mt-1">
                Get compliance alerts and your daily briefing on WhatsApp — and soon,
                forward notices for a law-backed reply.
              </p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  <span>Where your clients already are</span>
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

      {/* Connection Status */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-xl ${status?.linked ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-600"}`}
              >
                <MessageCircle className="h-5 w-5" />
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
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200/50 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-xl mx-auto mb-3">
                      <Smartphone className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="text-sm text-gray-600 mb-1">Number</div>
                    <div className="font-semibold text-gray-900">
                      {status.waId ? `+${status.waId}` : "—"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-xl mx-auto mb-3">
                      <Clock className="h-6 w-6 text-emerald-600" />
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
                    <div className="text-sm text-gray-600 mb-1">Notifications</div>
                    <Badge
                      variant={status.alertsEnabled ? "success" : "outline"}
                      className="font-medium"
                    >
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
                  className="flex-1"
                >
                  {togglingAlerts ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : status.alertsEnabled ? (
                    <BellOff className="h-4 w-4 mr-2" />
                  ) : (
                    <Bell className="h-4 w-4 mr-2" />
                  )}
                  {status.alertsEnabled ? "Disable Notifications" : "Enable Notifications"}
                </Button>

                <Button
                  variant="danger"
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="sm:w-auto"
                >
                  {unlinking ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : (
                    <Unlink className="h-4 w-4 mr-2" />
                  )}
                  Unlink
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-lg text-gray-700 mb-2">Connect WhatsApp</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Link your number to receive what needs your action today — straight to
                  WhatsApp.
                </p>
              </div>

              {linkCode ? (
                <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border border-green-200/50 rounded-2xl p-6 space-y-6">
                  <div className="text-center">
                    <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-white/50 shadow-lg">
                      <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-mono text-2xl font-bold tracking-[0.4em] shadow-lg">
                          {linkCode.code}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyCode}
                          className="h-10 w-10 p-0 rounded-xl hover:bg-green-50"
                        >
                          {copied ? (
                            <Check className="h-5 w-5 text-green-500" />
                          ) : (
                            <Copy className="h-5 w-5 text-green-600" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center justify-center gap-2 text-sm text-orange-600 font-medium">
                        <Clock className="h-4 w-4" />
                        <span>Expires in {formatTime(countdown)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/60 rounded-xl p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Quick Setup</h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          1
                        </span>
                        <div className="text-sm text-gray-700">
                          Open WhatsApp and message our number
                          {linkCode.businessNumber ? (
                            <span className="font-semibold"> +{linkCode.businessNumber}</span>
                          ) : (
                            <span className="text-muted-foreground">
                              {" "}
                              (shown after you scan the QR / save the contact)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg">
                        <span className="bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          2
                        </span>
                        <div>
                          <div className="text-sm text-gray-700 mb-2">Send this message:</div>
                          <div className="bg-gray-900 text-green-400 font-mono text-sm p-2 rounded border">
                            /link {linkCode.code}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-teal-50 rounded-lg">
                        <span className="bg-teal-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          3
                        </span>
                        <div className="text-sm text-gray-700">
                          🎉 Done! You'll get alerts and your daily briefing here.
                        </div>
                      </div>
                    </div>
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
                <div className="text-center">
                  <Button
                    onClick={handleGenerateCode}
                    disabled={generatingCode}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
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

      {/* What you'll get */}
      <Card className="border-0 bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-gray-900">Compliance alerts</p>
                <p className="text-xs text-gray-600">
                  GST / TDS / ITR deadlines and high-risk items, pushed before they bite.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-gray-900">Daily briefing</p>
                <p className="text-xs text-gray-600">
                  A morning summary of what needs your action today.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MessageCircle className="h-5 w-5 text-teal-600 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-gray-900">Notice handling</p>
                <p className="text-xs text-gray-600">
                  Coming soon: forward a govt notice, get a law-backed reply drafted.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
