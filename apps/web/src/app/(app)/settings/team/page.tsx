"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiResponse, TeamMember, FirmInvite } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { useUser } from "@/contexts/user-context";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  FlashMessage,
  EmptyState,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Badge,
} from "@/components/ui";
import {
  Users,
  Plus,
  Copy,
  Check,
  Trash2,
  Shield,
  UserMinus,
  Link as LinkIcon,
  Crown,
  Mail,
  UserCheck,
  Calendar,
  ExternalLink,
  Zap,
  Lock,
  Clock,
} from "lucide-react";

type FlashState = { type: "success" | "error"; message: string } | null;

interface InviteWithUrl extends FirmInvite {
  inviteUrl: string;
  creator: { id: string; name: string; email: string };
}

export default function TeamSettingsPage() {
  const { user: currentUser } = useUser();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<InviteWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<FlashState>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const showFlash = (type: "success" | "error", message: string) => {
    setFlash({ type, message });
    setTimeout(() => setFlash(null), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [membersRes, invitesRes] = await Promise.all([
        apiFetch<ApiResponse<TeamMember[]>>("/api/team/members"),
        apiFetch<ApiResponse<InviteWithUrl[]>>("/api/team/invites"),
      ]);
      if (membersRes.success && membersRes.data) setMembers(membersRes.data);
      if (invitesRes.success && invitesRes.data) setInvites(invitesRes.data);
    } catch {
      showFlash("error", "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    try {
      const body: { role: string; email?: string } = { role: inviteRole };
      if (inviteEmail.trim()) body.email = inviteEmail.trim();

      const res = await apiFetch<ApiResponse<{ invite: FirmInvite; inviteUrl: string }>>(
        "/api/team/invites",
        { method: "POST", body: JSON.stringify(body) },
      );
      if (res.success && res.data) {
        setNewInviteUrl(res.data.inviteUrl);
        void fetchData(); // Refresh invite list
      }
    } catch {
      showFlash("error", "Failed to create invite link");
      setShowInviteModal(false);
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyInvite = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await apiFetch(`/api/team/invites/${id}`, { method: "DELETE" });
      setInvites((prev) => prev.filter((i) => i.id !== id));
      showFlash("success", "Invite revoked");
    } catch {
      showFlash("error", "Failed to revoke invite");
    }
  };

  const handleChangeRole = async (userId: string, role: "admin" | "member") => {
    try {
      await apiFetch(`/api/team/members/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
      showFlash("success", "Role updated");
    } catch {
      showFlash("error", "Failed to update role");
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the firm? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/team/members/${userId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      showFlash("success", `${name} removed from the firm`);
    } catch {
      showFlash("error", "Failed to remove member");
    }
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteEmail("");
    setInviteRole("member");
    setNewInviteUrl(null);
    setCopied(false);
  };

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {flash && <FlashMessage variant={flash.type} message={flash.message} />}

      {/* Enhanced Header Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-3xl"></div>
        <div className="relative bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-2xl blur-xl"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-4 rounded-2xl shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Team Management
                </h1>
                <p className="text-lg text-muted-foreground mt-1">
                  Invite colleagues and manage permissions
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserCheck className="h-4 w-4" />
                    <span>{members.length} members</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{invites.length} pending</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    <span>Secure</span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              onClick={() => setShowInviteModal(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : (
        <>
          {/* Enhanced Members Section */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
                <span>Team Members ({members.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No team members yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start building your team by inviting colleagues to join your firm
                  </p>
                  <Button
                    onClick={() => setShowInviteModal(true)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Send Your First Invite
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {members.map((member) => {
                    const isSelf = member.id === currentUser?.id;
                    return (
                      <div
                        key={member.id}
                        className="bg-white/80 border border-gray-200/50 rounded-xl p-6 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="relative">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                {member.name[0]?.toUpperCase()}
                              </div>
                              {member.role === "admin" && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                                  <Crown className="h-3 w-3 text-white" />
                                </div>
                              )}
                            </div>

                            {/* Member Info */}
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-gray-900">
                                  {member.name}
                                  {isSelf && (
                                    <span className="ml-2 text-sm text-muted-foreground font-normal">
                                      (You)
                                    </span>
                                  )}
                                </h3>
                                <Badge
                                  variant={member.role === "admin" ? "primary" : "default"}
                                  className={member.role === "admin" ? "bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-700 border-yellow-200" : ""}
                                >
                                  {member.role === "admin" && <Crown className="h-3 w-3 mr-1" />}
                                  {member.role}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  <span>{member.email}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>Joined {fmtDate(member.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          {!isSelf && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void handleChangeRole(
                                    member.id,
                                    member.role === "admin" ? "member" : "admin",
                                  )
                                }
                                className="hover:bg-blue-50 hover:text-blue-600"
                                title={`Make ${member.role === "admin" ? "member" : "admin"}`}
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleRemoveMember(member.id, member.name)}
                                className="hover:bg-red-50 hover:text-red-600"
                                title="Remove member"
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enhanced Pending Invites */}
          {invites.length > 0 && (
            <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-100 text-orange-600">
                    <Mail className="h-5 w-5" />
                  </div>
                  <span>Pending Invites ({invites.length})</span>
                  <Badge variant="warning" className="bg-orange-100 text-orange-700">
                    <Clock className="h-3 w-3 mr-1" />
                    Awaiting Response
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="bg-white/80 border border-orange-200/50 rounded-xl p-6 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Icon */}
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-lg">
                            <Mail className="h-6 w-6" />
                          </div>

                          {/* Invite Info */}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900">
                                {invite.email ?? (
                                  <span className="text-orange-600 italic">Open invite link</span>
                                )}
                              </h3>
                              <Badge
                                variant={invite.role === "admin" ? "primary" : "default"}
                                className={invite.role === "admin" ? "bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-700 border-yellow-200" : ""}
                              >
                                {invite.role === "admin" && <Crown className="h-3 w-3 mr-1" />}
                                {invite.role}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                <span>Created by {invite.creator.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Expires {fmtDate(invite.expiresAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCopyInvite(invite.inviteUrl)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                            title="Copy invite link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRevokeInvite(invite.id)}
                            className="hover:bg-red-50 hover:text-red-600"
                            title="Revoke invite"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create Invite Modal */}
      <Modal open={showInviteModal} onClose={closeInviteModal}>
        <ModalHeader onClose={closeInviteModal}>
          {newInviteUrl ? "Invite Link Ready" : "Invite a Team Member"}
        </ModalHeader>
        <ModalBody>
          {newInviteUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Share this link with your colleague. It expires in 7 days and can only be
                used once.
              </p>
              <div className="flex items-center gap-2 p-3 bg-surface-tertiary rounded-lg border border-border-light">
                <LinkIcon className="h-4 w-4 text-muted shrink-0" />
                <p className="text-xs text-gray-700 font-mono truncate flex-1">
                  {newInviteUrl}
                </p>
                <button
                  onClick={() => void handleCopyInvite(newInviteUrl)}
                  className="shrink-0 p-1.5 rounded text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              {copied && (
                <p className="text-xs text-green-600 text-center">Copied to clipboard!</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Email address (optional)
                </label>
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <p className="text-xs text-muted">
                  If provided, only this email can accept the invite.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                  className="w-full border border-border bg-white rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                >
                  <option value="member">Member — can chat, sync, draft emails</option>
                  <option value="admin">
                    Admin — full access including team management
                  </option>
                </select>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {newInviteUrl ? (
            <Button onClick={closeInviteModal} variant="secondary" size="sm">
              Done
            </Button>
          ) : (
            <>
              <Button onClick={closeInviteModal} variant="ghost" size="sm">
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreateInvite()}
                size="sm"
                disabled={creatingInvite}
                className="flex items-center gap-1.5"
              >
                {creatingInvite ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
                Generate Invite Link
              </Button>
            </>
          )}
        </ModalFooter>
      </Modal>
    </div>
  );
}
