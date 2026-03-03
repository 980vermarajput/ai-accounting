"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/api";
import {
  Users,
  Shield,
  Building,
  Mail,
  Calendar,
  Search,
  ExternalLink,
  Crown,
  User,
  Filter
} from "lucide-react";

interface UserWithFirm {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  isAdmin?: boolean;
  createdAt: string;
  lastSyncAt: string | null;
  firm: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

interface Firm {
  id: string;
  name: string;
  slug: string;
  _count: {
    users: number;
  };
}

export default function AdminUsers() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [selectedFirm, setSelectedFirm] = useState<string>("");
  const [users, setUsers] = useState<UserWithFirm[]>([]);
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
      }
    };

    void fetchFirms();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!selectedFirm) return;

      setLoading(true);
      try {
        // For now, we'll simulate user data since we don't have a users endpoint yet
        // In a real implementation, you'd call something like:
        // const res = await apiFetch<{ success: boolean; data: UserWithFirm[] }>(`/api/platform-admin/firms/${selectedFirm}/users`);

        // Simulated data for demonstration
        const simulatedUsers: UserWithFirm[] = [
          {
            id: "1",
            email: "admin@example.com",
            name: "Admin User",
            role: "admin",
            isAdmin: false,
            createdAt: new Date().toISOString(),
            lastSyncAt: new Date().toISOString(),
            firm: firms.find(f => f.id === selectedFirm) || { id: selectedFirm, name: "Unknown", slug: "unknown", plan: "basic" }
          }
        ];
        setUsers(simulatedUsers);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, [selectedFirm, firms]);

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return "Never";

    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return formatDate(dateString);
  };

  const getRoleBadge = (role: string, isAdmin?: boolean) => {
    if (isAdmin) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          <Crown className="w-3 h-3" />
          Platform Admin
        </span>
      );
    }

    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <Shield className="w-3 h-3" />
          Firm Admin
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <User className="w-3 h-3" />
        Member
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            User Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage users across all firms on the platform
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
          <span className="text-sm text-gray-600">Total Users: </span>
          <span className="font-semibold text-blue-600">{users.length}</span>
        </div>
      </div>

      {/* Firm Selection and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Firm Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-2" />
              Select Firm
            </label>
            <select
              value={selectedFirm}
              onChange={(e) => setSelectedFirm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Choose a firm to view users...</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name} ({firm._count.users} users)
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Search Users
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!selectedFirm}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Users List */}
      {!selectedFirm ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Firm</h3>
          <p className="text-gray-600">
            Choose a firm from the dropdown above to view and manage its users.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((user) => (
            <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              {/* User Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl text-white font-bold flex items-center justify-center">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{user.name}</h3>
                    <p className="text-gray-600 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </p>
                    <div className="mt-1">
                      {getRoleBadge(user.role, user.isAdmin)}
                    </div>
                  </div>
                </div>
                <a
                  href={`mailto:${user.email}`}
                  className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Send email"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* User Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Building className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.firm.name}</p>
                    <p className="text-xs text-gray-600">{user.firm.plan} plan</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Joined</p>
                    <p className="text-xs text-gray-600">{formatDate(user.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Users className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Last Sync</p>
                    <p className="text-xs text-gray-600">{formatTimeAgo(user.lastSyncAt)}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center gap-2">
                <button className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">
                  View Activity
                </button>
                <button className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
                  Reset Password
                </button>
                {!user.isAdmin && (
                  <button className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors">
                    Suspend User
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Empty State */}
          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchTerm ? "No users found matching your search." : "No users found in this firm."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Note about API Implementation */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-yellow-800">
          <Shield className="w-5 h-5" />
          <span className="font-medium">Development Note</span>
        </div>
        <p className="text-yellow-700 text-sm mt-1">
          This page currently shows simulated data. To fully implement user management, you'll need to create API endpoints for fetching users by firm and performing user management actions.
        </p>
      </div>
    </div>
  );
}