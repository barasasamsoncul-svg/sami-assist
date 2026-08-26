'use client';

import { useState, useEffect } from 'react';
import { History, Filter, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: any;
  ip: string;
  created_at: string;
  full_name: string;
  email: string;
}

export default function AuditLogsSection() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState('all');
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  useEffect(() => {
    fetchLogs();
  }, [selectedAction, offset]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/settings/audit-logs?action=${selectedAction}&limit=${limit}&offset=${offset}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLogs(data.logs);
      setActions(data.actions);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Log</h3>
            <p className="text-sm text-gray-500 mt-1">Track all actions in your workspace</p>
          </div>
          <span className="text-xs text-gray-500">{total} events</span>
        </div>

        {/* Filter */}
        <div className="mt-4 flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setOffset(0);
            }}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {formatAction(action)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs list */}
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <History size={48} className="mx-auto text-gray-300 dark:text-gray-700" />
            <p className="mt-4 text-sm text-gray-500">No activity found</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatAction(log.action)}
                </p>
                <span className="text-xs text-gray-500">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span>{log.full_name || log.email || 'System'}</span>
                {log.resource_type && (
                  <>
                    <span>•</span>
                    <span className="capitalize">{log.resource_type}</span>
                  </>
                )}
                {log.ip && log.ip !== 'unknown' && (
                  <>
                    <span>•</span>
                    <span>{log.ip}</span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}