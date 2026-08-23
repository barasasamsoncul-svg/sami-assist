"use client";

import { useState, useEffect } from "react";
import {
  Webhook,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  X,
  Link,
  Activity,
} from "lucide-react";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export default function InvoiceWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/webhooks");
      if (!response.ok) throw new Error("Failed to fetch webhooks");
      const data = await response.json();
      setWebhooks(data.webhooks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Webhooks</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {webhooks.length} webhooks configured
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchWebhooks}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} />
            Add Webhook
          </button>
        </div>
      </div>

      {webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <Webhook className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No webhooks configured</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add your first webhook endpoint
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
                      <Webhook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {webhook.url}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Events: {webhook.events.join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className={`flex items-center gap-1 ${webhook.active ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}>
                      {webhook.active ? <CheckCircle size={14} /> : <X size={14} />}
                      {webhook.active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      Created {new Date(webhook.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                    <Activity size={16} />
                  </button>
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                    <Edit size={16} />
                  </button>
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}