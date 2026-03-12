"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import {
  Building,
  Users,
  FileText,
  MessageSquare,
  Calendar,
  Search,
  ExternalLink
} from "lucide-react";

interface Firm {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  _count: {
    users: number;
    documents: number;
    queries: number;
  };
}

export default function AdminFirms() {
  const router = useRouter();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchFirms = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: Firm[] }>("/api/platform-admin/firms");
        if (res.success) {
          setFirms(res.data);
        }
      } catch (error) {
        console.error("Failed to fetch firms:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchFirms();
  }, []);

  const filteredFirms = firms.filter(firm =>
    firm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    firm.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Firm Management
          </h1>
          <p className="text-gray-600 mt-2">
            Monitor and manage all registered firms on the platform
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-sm text-gray-600">Total Firms: </span>
          <span className="font-semibold text-purple-600">{firms.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search firms by name or slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Firms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredFirms.map((firm) => (
          <div
            key={firm.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => router.push(`/admin/firms/${firm.id}`)}
          >
            {/* Firm Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <Building className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{firm.name}</h3>
                  <p className="text-sm text-gray-600">/{firm.slug}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/admin/firms/${firm.id}`);
                }}
                className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
                title="View firm details"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* Plan Badge */}
            <div className="mb-4">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                firm.plan === 'enterprise'
                  ? 'bg-purple-100 text-purple-800'
                  : firm.plan === 'professional'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {firm.plan.charAt(0).toUpperCase() + firm.plan.slice(1)} Plan
              </span>
            </div>

            {/* Metrics */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Users</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{firm._count.users}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Documents</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{firm._count.documents}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Queries</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{firm._count.queries}</span>
              </div>
            </div>

            {/* Created Date */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar className="w-3 h-3" />
                <span>Created {new Date(firm.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredFirms.length === 0 && (
        <div className="text-center py-12">
          <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {searchTerm ? "No firms found matching your search." : "No firms registered yet."}
          </p>
        </div>
      )}
    </div>
  );
}