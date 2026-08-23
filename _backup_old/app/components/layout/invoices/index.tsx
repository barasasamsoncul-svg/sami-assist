"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

// Main pages (11 items from sidebar)
import InvoiceOverview from "./components/InvoiceOverview";
import InvoiceStats from "./components/InvoiceStats";
import InvoiceList from "./components/InvoiceList";
import InvoiceCreate from "./components/InvoiceCreate";
import InvoiceDetail from "./components/InvoiceDetail";
import InvoiceCustomers from "./components/InvoiceCustomers";
import InvoiceProducts from "./components/InvoiceProducts";
import InvoicePayments from "./components/InvoicePayments";
import InvoiceCreditNotes from "./components/InvoiceCreditNotes";
import InvoiceRecurring from "./components/InvoiceRecurring";
import InvoiceReports from "./components/InvoiceReports";
import InvoiceArchive from "./components/InvoiceArchive";
import InvoiceSettings from "./components/InvoiceSettings";

// Settings sub-components (used inside InvoiceSettings)
import InvoiceTemplates from "./components/InvoiceTemplates";
import InvoiceReminders from "./components/InvoiceReminders";
import InvoiceWebhooks from "./components/InvoiceWebhooks";
import InvoiceShare from "./components/InvoiceShare";
import InvoiceTaxRates from "./components/InvoiceTaxRates";
import InvoicePaymentTerms from "./components/InvoicePaymentTerms";

interface InvoicesProps {
  activePage: string;
}

export default function Invoices({ activePage }: InvoicesProps) {
  const [error, setError] = useState<string | null>(null);

  const renderPage = () => {
    switch (activePage) {
      // === MAIN NAVIGATION PAGES (11 items) ===
      
      // Dashboard & Overview
      case "invoice-overview":
        return <InvoiceOverview />;
      case "invoice-stats":
        return <InvoiceStats />;

      // Invoices
      case "invoices":
        return <InvoiceList />;
      case "create-invoice":
        return <InvoiceCreate />;
      case "invoice-detail":
        return <InvoiceDetail />;

      // Management
      case "invoice-customers":
        return <InvoiceCustomers />;
      case "invoice-products":
        return <InvoiceProducts />;

      // Financial
      case "invoice-payments":
        return <InvoicePayments />;
      case "invoice-credit-notes":
        return <InvoiceCreditNotes />;
      case "invoice-recurring":
        return <InvoiceRecurring />;

      // Tools
      case "invoice-reports":
        return <InvoiceReports />;
      case "invoice-archive":
        return <InvoiceArchive />;

      // Settings - Main entry point (contains all sub-tabs internally)
      case "invoice-settings":
        return <InvoiceSettings />;

      // === NOTE: These are NOT separate pages ===
      // They are rendered INSIDE InvoiceSettings component
      // via its internal tab system:
      // - invoice-templates → Tab inside Settings
      // - invoice-reminders → Tab inside Settings
      // - invoice-webhooks → Tab inside Settings
      // - invoice-share → Tab inside Settings
      // - invoice-tax-rates → Tab inside Settings
      // - invoice-payment-terms → Tab inside Settings

      default:
        return <InvoiceOverview />;
    }
  };

  return (
    <div className="h-full">
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}
      {renderPage()}
    </div>
  );
}