"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ApiResponse, Client } from "@ai-accounting/shared";
import { apiFetch } from "@/lib/api";

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
      showFlash("error", `Failed to create client: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Clients</h1>
          <p className="text-gray-500 text-sm">
            Manage your client relationships and view document summaries
          </p>
        </div>
        <button
          onClick={() => setShowNewClientForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New Client
        </button>
      </div>

      {/* Flash message */}
      {flash && (
        <div
          className={`mb-5 px-4 py-3 rounded-lg text-sm font-medium border ${
            flash.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {flash.message}
        </div>
      )}

      {/* New Client Form Modal */}
      {showNewClientForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">New Client</h3>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  required
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                  placeholder="e.g., Acme Corporation"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Identifier *
                </label>
                <input
                  type="text"
                  required
                  value={newClient.identifier}
                  onChange={(e) => setNewClient({ ...newClient, identifier: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                  placeholder="e.g., ACM001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Domain (optional)
                </label>
                <input
                  type="text"
                  value={newClient.emailDomain}
                  onChange={(e) => setNewClient({ ...newClient, emailDomain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                  placeholder="e.g., acme.com or john@acme.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a domain (acme.com) to match all emails from that domain, or a specific email (john@acme.com) to match only that address.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewClientForm(false);
                    setNewClient({ name: "", identifier: "", emailDomain: "" });
                  }}
                  className="flex-1 py-2 px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clients List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            Loading clients...
          </div>
        ) : clients.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              No clients yet. Create your first client to start organizing documents and communications.
            </p>
            <button
              onClick={() => setShowNewClientForm(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create First Client
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3 font-medium">Client</th>
                  <th className="px-6 py-3 font-medium">Identifier</th>
                  <th className="px-6 py-3 font-medium">Email Domain</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-blue-600 font-semibold text-sm">
                            {client.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{client.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {client.identifier}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {client.emailDomain || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(client.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/clients/${client.id}`}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View Summary →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {clients.length > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          {clients.length} client{clients.length === 1 ? "" : "s"} total
        </div>
      )}
    </div>
  );
}