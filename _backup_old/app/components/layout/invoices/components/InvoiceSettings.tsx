"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Building2,
  Palette,
  Hash,
  CreditCard,
  Mail,
  BellRing,
  Share2,
  Webhook,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Save,
  X,
  PenTool,
  Percent,
  CalendarDays,
} from "lucide-react";

// Import settings sub-components
import InvoiceTemplates from "./InvoiceTemplates";
import InvoiceReminders from "./InvoiceReminders";
import InvoiceWebhooks from "./InvoiceWebhooks";
import InvoiceShare from "./InvoiceShare";
import InvoiceTaxRates from "./InvoiceTaxRates";
import InvoicePaymentTerms from "./InvoicePaymentTerms";

interface SettingsData {
  id: string;
  company_name: string | null;
  company_logo_url: string | null;
  company_address: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_tax_id: string | null;
  company_website: string | null;
  brand_primary_color: string;
  brand_secondary_color: string;
  invoice_font_family: string;
  invoice_prefix: string;
  invoice_next_number: number;
  invoice_number_padding: number;
  invoice_number_format: string;
  invoice_sequence_reset_frequency: string;
  credit_note_prefix: string;
  credit_note_next_number: number;
  default_currency: string;
  default_due_days: number;
  default_tax_calculation: string;
  payment_instructions: string | null;
  bank_details: any;
  reminder_enabled: boolean;
  reminder_days_before: number;
  reminder_days_after: number;
  email_enabled: boolean;
  email_from_name: string | null;
  email_from_address: string | null;
  whatsapp_enabled: boolean;
  sharing_enabled: boolean;
  allow_public_invoice_links: boolean;
  allow_download: boolean;
  allow_print: boolean;
  auto_send_enabled: boolean;
  allow_partial_payments: boolean;
  allow_credit_notes: boolean;
  require_approval: boolean;
  terms_and_conditions: string | null;
  footer_text: string | null;
}

type SettingsTab = 
  | "general" 
  | "branding" 
  | "numbering" 
  | "payment" 
  | "email" 
  | "templates"
  | "reminders" 
  | "webhooks" 
  | "share" 
  | "tax-rates" 
  | "payment-terms"
  | "features" 
  | "terms";

const TABS: { id: SettingsTab; label: string; icon: any }[] = [
  { id: "general", label: "General", icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "numbering", label: "Numbering", icon: Hash },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "email", label: "Email", icon: Mail },
  { id: "templates", label: "Templates", icon: PenTool },
  { id: "reminders", label: "Reminders", icon: BellRing },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "share", label: "Share Links", icon: Share2 },
  { id: "tax-rates", label: "Tax Rates", icon: Percent },
  { id: "payment-terms", label: "Payment Terms", icon: CalendarDays },
  { id: "features", label: "Features", icon: Settings },
  { id: "terms", label: "Terms", icon: Webhook },
];

export default function InvoiceSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/settings");
      if (!response.ok) throw new Error("Failed to fetch settings");
      const data = await response.json();
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/invoices/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save settings");
      }

      const data = await response.json();
      setSettings(data.settings);
      setSuccess("Settings saved successfully!");
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Render sub-component based on tab
  const renderTabContent = () => {
    switch (activeTab) {
      // Full page components
      case "templates":
        return <InvoiceTemplates />;
      case "reminders":
        return <InvoiceReminders />;
      case "webhooks":
        return <InvoiceWebhooks />;
      case "share":
        return <InvoiceShare />;
      case "tax-rates":
        return <InvoiceTaxRates />;
      case "payment-terms":
        return <InvoicePaymentTerms />;

      // Settings forms
      case "general":
        return renderGeneralForm();
      case "branding":
        return renderBrandingForm();
      case "numbering":
        return renderNumberingForm();
      case "payment":
        return renderPaymentForm();
      case "email":
        return renderEmailForm();
      case "features":
        return renderFeaturesForm();
      case "terms":
        return renderTermsForm();

      default:
        return renderGeneralForm();
    }
  };

  // Form renderers (these are inline forms)
  const renderGeneralForm = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Company Name
          </label>
          <input
            type="text"
            value={settings?.company_name || ""}
            onChange={(e) => setSettings({ ...settings!, company_name: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            type="email"
            value={settings?.company_email || ""}
            onChange={(e) => setSettings({ ...settings!, company_email: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Phone
          </label>
          <input
            type="text"
            value={settings?.company_phone || ""}
            onChange={(e) => setSettings({ ...settings!, company_phone: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Address
          </label>
          <textarea
            value={settings?.company_address || ""}
            onChange={(e) => setSettings({ ...settings!, company_address: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tax ID
          </label>
          <input
            type="text"
            value={settings?.company_tax_id || ""}
            onChange={(e) => setSettings({ ...settings!, company_tax_id: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Website
          </label>
          <input
            type="url"
            value={settings?.company_website || ""}
            onChange={(e) => setSettings({ ...settings!, company_website: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>
    </div>
  );

  const renderBrandingForm = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Logo URL
        </label>
        <input
          type="url"
          value={settings?.company_logo_url || ""}
          onChange={(e) => setSettings({ ...settings!, company_logo_url: e.target.value })}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Primary Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings?.brand_primary_color || "#1a56db"}
              onChange={(e) => setSettings({ ...settings!, brand_primary_color: e.target.value })}
              className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200"
            />
            <input
              type="text"
              value={settings?.brand_primary_color || "#1a56db"}
              onChange={(e) => setSettings({ ...settings!, brand_primary_color: e.target.value })}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Secondary Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings?.brand_secondary_color || "#374151"}
              onChange={(e) => setSettings({ ...settings!, brand_secondary_color: e.target.value })}
              className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200"
            />
            <input
              type="text"
              value={settings?.brand_secondary_color || "#374151"}
              onChange={(e) => setSettings({ ...settings!, brand_secondary_color: e.target.value })}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Font Family
        </label>
        <select
          value={settings?.invoice_font_family || "Inter"}
          onChange={(e) => setSettings({ ...settings!, invoice_font_family: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="Inter">Inter</option>
          <option value="Arial">Arial</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Georgia">Georgia</option>
          <option value="Roboto">Roboto</option>
        </select>
      </div>
    </div>
  );

  const renderNumberingForm = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Invoice Prefix
          </label>
          <input
            type="text"
            value={settings?.invoice_prefix || "INV-"}
            onChange={(e) => setSettings({ ...settings!, invoice_prefix: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Next Number
          </label>
          <input
            type="number"
            value={settings?.invoice_next_number || 1}
            onChange={(e) => setSettings({ ...settings!, invoice_next_number: parseInt(e.target.value) || 1 })}
            min="1"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Number Padding
          </label>
          <input
            type="number"
            value={settings?.invoice_number_padding || 6}
            onChange={(e) => setSettings({ ...settings!, invoice_number_padding: parseInt(e.target.value) || 6 })}
            min="1"
            max="12"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Number Format
          </label>
          <input
            type="text"
            value={settings?.invoice_number_format || "{prefix}{number}"}
            onChange={(e) => setSettings({ ...settings!, invoice_number_format: e.target.value })}
            placeholder='{prefix}{number}'
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500">Use {'{prefix}'} and {'{number}'} placeholders</p>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Sequence Reset Frequency
        </label>
        <select
          value={settings?.invoice_sequence_reset_frequency || "never"}
          onChange={(e) => setSettings({ ...settings!, invoice_sequence_reset_frequency: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="never">Never</option>
          <option value="yearly">Yearly</option>
          <option value="quarterly">Quarterly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
        <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Credit Notes</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Prefix
            </label>
            <input
              type="text"
              value={settings?.credit_note_prefix || "CN-"}
              onChange={(e) => setSettings({ ...settings!, credit_note_prefix: e.target.value })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Next Number
            </label>
            <input
              type="number"
              value={settings?.credit_note_next_number || 1}
              onChange={(e) => setSettings({ ...settings!, credit_note_next_number: parseInt(e.target.value) || 1 })}
              min="1"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderPaymentForm = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Default Currency
          </label>
          <select
            value={settings?.default_currency || "KES"}
            onChange={(e) => setSettings({ ...settings!, default_currency: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="KES">KES</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Default Due Days
          </label>
          <input
            type="number"
            value={settings?.default_due_days || 30}
            onChange={(e) => setSettings({ ...settings!, default_due_days: parseInt(e.target.value) || 30 })}
            min="0"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Tax Calculation
        </label>
        <select
          value={settings?.default_tax_calculation || "exclusive"}
          onChange={(e) => setSettings({ ...settings!, default_tax_calculation: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="exclusive">Exclusive (Tax added)</option>
          <option value="inclusive">Inclusive (Tax included)</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Payment Instructions
        </label>
        <textarea
          value={settings?.payment_instructions || ""}
          onChange={(e) => setSettings({ ...settings!, payment_instructions: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          placeholder="Bank transfer details, payment methods accepted..."
        />
      </div>
    </div>
  );

  const renderEmailForm = () => (
    <div className="space-y-4">
      <div className="mb-4 flex items-center gap-3">
        <input
          type="checkbox"
          checked={settings?.email_enabled || false}
          onChange={(e) => setSettings({ ...settings!, email_enabled: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Enable Email Sending
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            From Name
          </label>
          <input
            type="text"
            value={settings?.email_from_name || ""}
            onChange={(e) => setSettings({ ...settings!, email_from_name: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            From Address
          </label>
          <input
            type="email"
            value={settings?.email_from_address || ""}
            onChange={(e) => setSettings({ ...settings!, email_from_address: e.target.value })}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>
    </div>
  );

  const renderFeaturesForm = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings?.allow_partial_payments || false}
            onChange={(e) => setSettings({ ...settings!, allow_partial_payments: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Allow Partial Payments
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings?.allow_credit_notes || false}
            onChange={(e) => setSettings({ ...settings!, allow_credit_notes: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Allow Credit Notes
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings?.auto_send_enabled || false}
            onChange={(e) => setSettings({ ...settings!, auto_send_enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Auto-Send Invoices
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings?.require_approval || false}
            onChange={(e) => setSettings({ ...settings!, require_approval: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Require Approval
          </label>
        </div>
      </div>
    </div>
  );

  const renderTermsForm = () => (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Terms & Conditions
        </label>
        <textarea
          value={settings?.terms_and_conditions || ""}
          onChange={(e) => setSettings({ ...settings!, terms_and_conditions: e.target.value })}
          rows={6}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          placeholder="Terms and conditions that appear on invoices..."
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Footer Text
        </label>
        <input
          type="text"
          value={settings?.footer_text || ""}
          onChange={(e) => setSettings({ ...settings!, footer_text: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          placeholder="Thank you for your business!"
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-medium text-red-600 dark:text-red-400">Settings not found</h3>
        <button
          onClick={fetchSettings}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure your invoicing preferences
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchSettings}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw size={16} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
          <CheckCircle size={16} />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        {renderTabContent()}
      </div>
    </div>
  );
}