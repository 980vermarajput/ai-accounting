"use client";

import { useState } from "react";
import {
  Settings,
  Shield,
  Database,
  Bell,
  Mail,
  Key,
  Server,
  Activity,
  Globe,
  Save,
  AlertCircle,
  CheckCircle
} from "lucide-react";

interface PlatformSettings {
  maintenance: {
    enabled: boolean;
    message: string;
    scheduledAt: string | null;
  };
  security: {
    requireTwoFactor: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
  };
  notifications: {
    emailAlerts: boolean;
    webhookUrl: string;
    slackChannel: string;
  };
  limits: {
    maxFirmsPerPlatform: number;
    maxUsersPerFirm: number;
    maxDocumentsPerFirm: number;
  };
  features: {
    enableTelegramBot: boolean;
    enableAdvancedAnalytics: boolean;
    enableApiAccess: boolean;
  };
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings>({
    maintenance: {
      enabled: false,
      message: "System maintenance in progress. Please try again later.",
      scheduledAt: null,
    },
    security: {
      requireTwoFactor: false,
      sessionTimeout: 24, // hours
      maxLoginAttempts: 5,
    },
    notifications: {
      emailAlerts: true,
      webhookUrl: "",
      slackChannel: "#admin-alerts",
    },
    limits: {
      maxFirmsPerPlatform: 1000,
      maxUsersPerFirm: 100,
      maxDocumentsPerFirm: 10000,
    },
    features: {
      enableTelegramBot: true,
      enableAdvancedAnalytics: true,
      enableApiAccess: true,
    },
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleSave = async () => {
    setSaveStatus('saving');

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // In a real implementation, you'd make an API call here:
      // await apiFetch('/api/platform-admin/settings', {
      //   method: 'PUT',
      //   body: JSON.stringify(settings)
      // });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const updateSettings = (section: keyof PlatformSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Platform Settings
          </h1>
          <p className="text-gray-600 mt-2">
            Configure global platform settings and policies
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            saveStatus === 'saved'
              ? 'bg-green-600 text-white'
              : saveStatus === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          } disabled:opacity-50`}
        >
          {saveStatus === 'saving' ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Saved
            </>
          ) : saveStatus === 'error' ? (
            <>
              <AlertCircle className="w-4 h-4" />
              Error
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Maintenance Mode */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Maintenance Mode</h3>
            <p className="text-sm text-gray-600">Control platform availability</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="maintenance"
              checked={settings.maintenance.enabled}
              onChange={(e) => updateSettings('maintenance', 'enabled', e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="maintenance" className="text-sm font-medium text-gray-700">
              Enable maintenance mode
            </label>
          </div>

          {settings.maintenance.enabled && (
            <div className="ml-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maintenance Message
                </label>
                <textarea
                  value={settings.maintenance.message}
                  onChange={(e) => updateSettings('maintenance', 'message', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Security</h3>
            <p className="text-sm text-gray-600">Platform security policies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="twoFactor"
                checked={settings.security.requireTwoFactor}
                onChange={(e) => updateSettings('security', 'requireTwoFactor', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="twoFactor" className="text-sm font-medium text-gray-700">
                Require two-factor authentication
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Timeout (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.security.sessionTimeout}
                onChange={(e) => updateSettings('security', 'sessionTimeout', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Login Attempts
            </label>
            <input
              type="number"
              min="3"
              max="10"
              value={settings.security.maxLoginAttempts}
              onChange={(e) => updateSettings('security', 'maxLoginAttempts', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            <p className="text-sm text-gray-600">Alert preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailAlerts"
              checked={settings.notifications.emailAlerts}
              onChange={(e) => updateSettings('notifications', 'emailAlerts', e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="emailAlerts" className="text-sm font-medium text-gray-700">
              Send email alerts for critical issues
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Webhook URL
              </label>
              <input
                type="url"
                value={settings.notifications.webhookUrl}
                onChange={(e) => updateSettings('notifications', 'webhookUrl', e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slack Channel
              </label>
              <input
                type="text"
                value={settings.notifications.slackChannel}
                onChange={(e) => updateSettings('notifications', 'slackChannel', e.target.value)}
                placeholder="#admin-alerts"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Platform Limits */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Platform Limits</h3>
            <p className="text-sm text-gray-600">Resource quotas and restrictions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Firms
            </label>
            <input
              type="number"
              min="1"
              value={settings.limits.maxFirmsPerPlatform}
              onChange={(e) => updateSettings('limits', 'maxFirmsPerPlatform', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Users per Firm
            </label>
            <input
              type="number"
              min="1"
              value={settings.limits.maxUsersPerFirm}
              onChange={(e) => updateSettings('limits', 'maxUsersPerFirm', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Documents per Firm
            </label>
            <input
              type="number"
              min="100"
              value={settings.limits.maxDocumentsPerFirm}
              onChange={(e) => updateSettings('limits', 'maxDocumentsPerFirm', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Feature Flags</h3>
            <p className="text-sm text-gray-600">Enable/disable platform features</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Telegram Bot Integration</h4>
              <p className="text-xs text-gray-600">Allow firms to use Telegram bot features</p>
            </div>
            <input
              type="checkbox"
              checked={settings.features.enableTelegramBot}
              onChange={(e) => updateSettings('features', 'enableTelegramBot', e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Advanced Analytics</h4>
              <p className="text-xs text-gray-600">Enable advanced reporting and analytics features</p>
            </div>
            <input
              type="checkbox"
              checked={settings.features.enableAdvancedAnalytics}
              onChange={(e) => updateSettings('features', 'enableAdvancedAnalytics', e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">API Access</h4>
              <p className="text-xs text-gray-600">Allow firms to access platform APIs</p>
            </div>
            <input
              type="checkbox"
              checked={settings.features.enableApiAccess}
              onChange={(e) => updateSettings('features', 'enableApiAccess', e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Implementation Note */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-purple-800">
          <Settings className="w-5 h-5" />
          <span className="font-medium">Development Note</span>
        </div>
        <p className="text-purple-700 text-sm mt-1">
          This settings page shows a comprehensive platform configuration interface. To implement fully, you'll need to create backend APIs for saving/loading settings and integrate with your infrastructure for applying these configurations.
        </p>
      </div>
    </div>
  );
}