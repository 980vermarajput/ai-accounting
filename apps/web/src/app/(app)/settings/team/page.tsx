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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Team</h1>
          <p className="mt-1 text-sm text-muted">
            Manage members and invite colleagues to your firm
          </p>
        </div>
        <Button
          onClick={() => setShowInviteModal(true)}
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {flash && <FlashMessage variant={flash.type} message={flash.message} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : (
        <>
          {/* Members table */}
          <Card>
            <CardHeader>
              <CardTitle>Members ({members.length})</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              {members.length === 0 ? (
                <CardContent>
                  <EmptyState
                    icon={<Users className="h-8 w-8 text-muted" />}
                    title="No members yet"
                    description="Invite team members to get started"
                  />
                </CardContent>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-surface-tertiary">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                        Member
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                        Role
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                        Joined
                      </th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {members.map((member) => {
                      const isSelf = member.id === currentUser?.id;
                      return (
                        <tr
                          key={member.id}
                          className="hover:bg-surface-tertiary/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary-600">
                                  {member.name[0]?.toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {member.name}
                                  {isSelf && (
                                    <span className="ml-1.5 text-xs text-muted">
                                      (you)
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted truncate">
                                  {member.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={member.role === "admin" ? "primary" : "default"}
                            >
                              {member.role}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">
                            {fmtDate(member.createdAt)}
                          </td>
                          <td className="py-3 px-4">
                            {!isSelf && (
                              <div className="flex items-center gap-1 justify-end">
                                {/* Toggle role */}
                                <button
                                  onClick={() =>
                                    void handleChangeRole(
                                      member.id,
                                      member.role === "admin" ? "member" : "admin",
                                    )
                                  }
                                  className="p-1.5 rounded text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                  title={`Make ${member.role === "admin" ? "member" : "admin"}`}
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                </button>
                                {/* Remove */}
                                <button
                                  onClick={() =>
                                    void handleRemoveMember(member.id, member.name)
                                  }
                                  className="p-1.5 rounded text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Remove member"
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          {/* Pending invites */}
          {invites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending Invites ({invites.length})</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-tertiary">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                        Invite
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                        Role
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">
                        Expires
                      </th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {invites.map((invite) => (
                      <tr
                        key={invite.id}
                        className="hover:bg-surface-tertiary/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm text-gray-900">
                              {invite.email ?? (
                                <span className="text-muted italic">Open invite</span>
                              )}
                            </p>
                            <p className="text-xs text-muted">
                              Created by {invite.creator.name}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={invite.role === "admin" ? "primary" : "default"}
                          >
                            {invite.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {fmtDate(invite.expiresAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => void handleCopyInvite(invite.inviteUrl)}
                              className="p-1.5 rounded text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                              title="Copy invite link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void handleRevokeInvite(invite.id)}
                              className="p-1.5 rounded text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Revoke invite"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
