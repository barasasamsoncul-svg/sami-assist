"use client";

import { useState, useEffect } from "react";
import {
  Share2,
  Copy,
  RefreshCw,
  AlertCircle,
  Link,
  Eye,
  X,
  CheckCircle,
  Clock,
  Users,
} from "lucide-react";

interface ShareLink {
  token: string;
  url: string;
  expires_at: string | null;
  created_at: string;
  allow_download: boolean;
  allow_print: boolean;
  has_password: boolean;
}

export default function InvoiceShare() {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchShareLinks();
  }, []);

  const fetchShareLinks = async () => {
    setLoading(true);
    setError(null);
    try {
      // This would fetch all share links for all invoices
      // For now, just show a placeholder
      setShareLinks([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load share links");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 3000);
    } catch (err) {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(id);
      setTimeout(() => setCopied(null), 3000);
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Share Links</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage shared invoice links
          </p>
        </div>
        <button
          onClick={fetchShareLinks}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <Share2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Share Invoice
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generate a shareable link for any invoice
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
              <option value="">Select an invoice...</option>
              <option value="INV-001">INV-001 - Acme Corp</option>
              <option value="INV-002">INV-002 - TechStart</option>
            </select>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Link size={16} />
            Generate Link
          </button>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Share Link
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Anyone with this link can view the invoice
              </p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                <Eye size={16} className="inline mr-1" />
                Preview
              </button>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                <Copy size={16} className="inline mr-1" />
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">Recent Share Links</h3>
        {shareLinks.length === 0 ? (
          <div className="text-center py-8">
            <Share2 className="h-8 w-8 mx-auto text-gray-300" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No share links generated yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shareLinks.map((link) => (
              <div key={link.token} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-blue-600 dark:text-blue-400">
                    {link.url}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleDateString()}` : "No expiry"}</span>
                    {link.has_password && <span>🔒 Password protected</span>}
                    {link.allow_download && <span>📥 Download</span>}
                    {link.allow_print && <span>🖨️ Print</span>}
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(link.url, link.token)}
                  className="ml-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                >
                  {copied === link.token ? <CheckCircle size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}