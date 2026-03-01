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
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Clients"
        description="Manage your client relationships and view document summaries"
      >
        <Button onClick={() => setShowNewClientForm(true)}>
          <Plus className="h-4 w-4" />
          New Client
        </Button>
      </PageHeader>

      {/* Flash message */}
      {flash && (
        <FlashMessage
          variant={flash.type}
          message={flash.message}
          className="mb-5"
          onDismiss={() => setFlash(null)}
        />
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
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-12 flex flex-col items-center justify-center gap-2 text-muted text-sm">
            <Spinner size="md" />
            Loading clients...
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No clients yet"
            description="Create your first client to start organizing documents and communications."
            action={
              <Button onClick={() => setShowNewClientForm(true)}>
                <Plus className="h-4 w-4" />
                Create First Client
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-tertiary">
                <tr className="text-left text-xs text-muted uppercase tracking-wide">
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Identifier</th>
                  <th className="px-6 py-3 font-medium">Email Domain</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-surface-tertiary/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-primary-600 font-semibold text-sm">
                            {client.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{client.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                      {client.identifier}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {client.emailDomain || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {fmtDate(client.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/clients/${client.id}`}
                        className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 text-sm font-medium"
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
      </Card>

      {clients.length > 0 && (
        <div className="mt-6 text-center text-sm text-muted">
          {clients.length} client{clients.length === 1 ? "" : "s"} total
        </div>
      )}
    </div>
  );
}
