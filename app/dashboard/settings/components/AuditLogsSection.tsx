'use client';

import { useState, useEffect } from 'react';
import { History, Filter, Loader2 } from 'lucide-react';

export default function AuditLogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/settings/audit-logs?limit=50');
      const data = await response.json();
      if (response.ok) setLogs(data.logs);
    } catch (err) {
      console.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold">Activity Log</h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {loading ? (
          <div className="py-12 text-center"><Loader2 size={24} className="animate-spin mx-auto text-blue-600" /></div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center"><History size={48} className="mx-auto text-gray-300" /><p className="mt-2 text-sm text-gray-500">No activity</p></div>
        ) : logs.map((log) => (
          <div key={log.id} className="px-6 py-4">
            <p className="text-sm font-medium">{formatAction(log.action)}</p>
            <p className="text-xs text-gray-500 mt-1">{log.full_name || 'System'} • {new Date(log.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}