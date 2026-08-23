"use client";

import { useState, useEffect } from "react";
import {
  PenTool,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  X,
  Palette,
  Type,
  Layout,
  Image,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  created_at: string;
}

export default function InvoiceTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/templates?limit=100");
      if (!response.ok) throw new Error("Failed to fetch templates");
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTemplates();
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Templates</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {templates.length} templates found
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchTemplates}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} />
            New Template
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900">
          <PenTool className="h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No templates found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create your first invoice template
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className={`group rounded-xl border p-6 transition hover:shadow-md ${
                template.is_default
                  ? "border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/10"
                  : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl"
                    style={{ backgroundColor: template.primary_color || "#1a56db" }}
                  />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {template.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {template.font_family || "Inter"}
                    </p>
                  </div>
                </div>
                {template.is_default && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                    Default
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: template.primary_color || "#1a56db" }}
                />
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: template.secondary_color || "#374151" }}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {template.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="mt-4 flex justify-end gap-1">
                <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                  <Eye size={16} />
                </button>
                <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                  <Edit size={16} />
                </button>
                {!template.is_default && (
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}