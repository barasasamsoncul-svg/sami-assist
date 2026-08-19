"use client";

import { useState, useEffect } from "react";
import {
  BellRing,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  Send,
  Clock,
  CheckCircle,
  X,
} from "lucide-react";

interface Reminder {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  reminder_type: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  email_to: string;
}

export default function InvoiceReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/reminders?limit=100");
      if (!response.ok) throw new Error("Failed to fetch reminders");
      const data = await response.json();
      setReminders(data.reminders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reminders");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReminders();
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      scheduled: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
      sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
      failed: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
      cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${colors[status as keyof typeof colors] || colors.scheduled}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Reminders</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {reminders.length} reminders found
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchReminders}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} />
            New Reminder
          </button>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <BellRing className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No reminders found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create your first reminder
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Scheduled
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {reminders.map((reminder) => (
                <tr key={reminder.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    <a href={`#invoice-detail?id=${reminder.invoice_id}`}>
                      {reminder.invoice_number}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {reminder.customer_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {reminder.reminder_type.replace("_", " ").toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(reminder.scheduled_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(reminder.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {reminder.status === "scheduled" && (
                        <button
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                          title="Send Now"
                        >
                          <Send size={16} />
                        </button>
                      )}
                      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                        <Edit size={16} />
                      </button>
                      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}