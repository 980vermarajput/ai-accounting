"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ApiResponse, Client } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { Plus, Users, ArrowRight } from "lucide-react";
import {
  Button,
  Card,
  Input,
  PageHeader,
  FlashMessage,
  EmptyState,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui";

type FlashState = { type: "success" | "error"; message: string } | null;

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [flash, setFlash] = useState<FlashState>(null);
  const [showNewClientForm, setShowNewClientForm] = useState(false);

  // New client form state
  const [newClient, setNewClient] = useState({
    name: "",
    identifier: "",
    emailDomain: "",
  });

  const showFlash = (type: "success" | "error", message: string) => {
    setFlash({ type, message });
    setTimeout(() => setFlash(null), 4000);
  };

  const fetchClients = async () => {
    try {
      const res = await apiFetch<ApiResponse<Client[]>>("/api/clients");
      if (res.success && res.data) {
        setClients(res.data);
      } else {
        setClients([]);
      }
    } catch (err) {
      console.error("Failed to fetch clients:", err);
      setClients([]);
      showFlash("error", "Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchClients();
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await apiFetch<ApiResponse<Client>>("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name: newClient.name.trim(),
          identifier: newClient.identifier.trim(),
          emailDomain: newClient.emailDomain.trim() || undefined,
        }),
      });

      if (res.success && res.data) {
        setClients((prev) => [...prev, res.data!]);
        setNewClient({ name: "", identifier: "", emailDomain: "" });
        setShowNewClientForm(false);
        showFlash("success", `Client "${res.data.name}" created successfully`);
      } else {
        showFlash("error", "Failed to create client: Invalid response");
      }
    } catch (err) {
      showFlash(
        "error",
        `Failed to create client: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Enhanced Header Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
        <div className="relative bg-white/80 backdrop-blur-sm border-b border-slate-200/50 px-8 py-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/10 rounded-xl blur-lg"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-xl shadow-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Clients
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  {clients.length > 0 ? `${clients.length} client${clients.length > 1 ? "s" : ""} in your portfolio` : "No clients yet"}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowNewClientForm(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
            >
              <Plus className="h-4 w-4" />
              New Client
            </Button>
          </div>
        </div>
      </div>

      {/* Flash message */}
      {flash && (
        <div className="px-8 pt-4">
          <FlashMessage
            variant={flash.type}
            message={flash.message}
            onDismiss={() => setFlash(null)}
          />
        </div>
      )}

      {/* New Client Form Modal */}
      <Modal
        open={showNewClientForm}
        onClose={() => {
          setShowNewClientForm(false);
          setNewClient({ name: "", identifier: "", emailDomain: "" });
        }}
      >
        <ModalHeader
          onClose={() => {
            setShowNewClientForm(false);
            setNewClient({ name: "", identifier: "", emailDomain: "" });
          }}
        >
          New Client
        </ModalHeader>
        <form onSubmit={handleCreateClient}>
          <ModalBody className="space-y-4">
            <Input
              label="Client Name *"
              type="text"
              required
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              placeholder="e.g., Acme Corporation"
            />
            <Input
              label="Client Identifier *"
              type="text"
              required
              value={newClient.identifier}
              onChange={(e) => setNewClient({ ...newClient, identifier: e.target.value })}
              placeholder="e.g., ACM001"
            />
            <Input
              label="Email Domain (optional)"
              type="text"
              value={newClient.emailDomain}
              onChange={(e) =>
                setNewClient({ ...newClient, emailDomain: e.target.value })
              }
              placeholder="e.g., acme.com or john@acme.com"
              hint="Enter a domain (acme.com) to match all emails from that domain, or a specific email (john@acme.com) to match only that address."
            />
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowNewClientForm(false);
                setNewClient({ name: "", identifier: "", emailDomain: "" });
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Create Client</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Clients List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Spinner size="md" />
            <span className="text-sm text-slate-600">Loading clients…</span>
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No clients yet"
            description="Create your first client to start organizing documents and communications."
            action={
              <Button
                onClick={() => setShowNewClientForm(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              >
                <Plus className="h-4 w-4" />
                Create First Client
              </Button>
            }
            className="py-20"
          />
        ) : (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg overflow-hidden my-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200/50 bg-slate-50/50">
                  <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Client</th>
                  <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Identifier</th>
                  <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Email Domain</th>
                  <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Created</th>
                  <th className="text-left px-6 py-4 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/30">
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-slate-50/30 transition-colors duration-200"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center shrink-0 border border-blue-200/50">
                          <span className="text-blue-600 font-semibold text-sm">
                            {client.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{client.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                      {client.identifier}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {client.emailDomain || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {fmtDate(client.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/clients/${client.id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
                      >
                        View Summary
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
