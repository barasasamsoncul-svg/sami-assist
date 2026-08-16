"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

/* =========================================================
   TYPES
========================================================= */

type InvoiceStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "void";

type InvoicePage =
  | "invoice-overview"
  | "invoicing"
  | "invoices"
  | "create-invoice"
  | "invoice-customers"
  | "invoice-payments"
  | "invoice-products"
  | "invoice-settings";

interface InvoicesProps {
  activePage?: InvoicePage;
}

interface Customer {
  id: string;
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  tax_id?: string | null;
  tax_id_type?: string | null;
  registration_number?: string | null;
  currency?: string | null;
  customer_type?: string | null;
  industry?: string | null;
  status?: string | null;
}

interface Product {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  unit_price: number | string;
  tax_rate_id?: string | null;
  category?: string | null;
  is_active?: boolean;
}

interface PaymentTerm {
  id: string;
  name: string;
  description?: string | null;
  due_days: number;
  discount_percentage?: number | string;
  discount_days?: number | null;
  is_default?: boolean;
  is_active?: boolean;
}

interface InvoiceItem {
  id: string;
  product_id?: string | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_type?: string | null;
  discount_value?: number | string;
  discount_amount?: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  line_total: number | string;
}

interface Payment {
  id: string;
  amount: number | string;
  currency?: string | null;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date: string;
  status: string;
  notes?: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer?: Customer;

  issue_date: string;
  due_date?: string | null;
  payment_date?: string | null;

  status: InvoiceStatus;

  subtotal: number | string;

  discount_type?: string | null;
  discount_value?: number | string;
  discount_amount?: number | string;

  tax_calculation_method?: string | null;
  tax_amount: number | string;

  shipping_cost?: number | string;
  shipping_tax?: number | string;

  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;

  po_number?: string | null;

  currency?: string | null;
  exchange_rate?: number | string;

  payment_terms_display?: string | null;

  notes?: string | null;
  internal_notes?: string | null;

  invoice_items?: InvoiceItem[];
  payments?: Payment[];
}

interface Stats {
  total_invoices?: number;
  draft_invoices?: number;
  pending_approval_invoices?: number;
  sent_invoices?: number;
  viewed_invoices?: number;
  partially_paid_invoices?: number;
  paid_invoices?: number;
  overdue_invoices?: number;
  cancelled_invoices?: number;

  total_invoiced?: number;
  total_collected?: number;
  total_outstanding?: number;
}

interface DraftItem {
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;

  discount_type: "percentage" | "fixed" | "";
  discount_value: string;

  tax_rate: string;
}

/* =========================================================
   CONSTANTS
========================================================= */

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  sent: "Sent",
  viewed: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  void: "Void",
};

const CURRENCIES = [
  "KES",
  "USD",
  "EUR",
  "GBP",
  "UGX",
  "TZS",
  "ZAR",
];

const TAX_RATES = [
  { label: "No tax", value: "0" },
  { label: "5%", value: "5" },
  { label: "10%", value: "10" },
  { label: "16%", value: "16" },
  { label: "18%", value: "18" },
  { label: "20%", value: "20" },
];

const EMPTY_ITEM: DraftItem = {
  product_id: "",
  description: "",
  quantity: "1",
  unit_price: "0",
  discount_type: "",
  discount_value: "0",
  tax_rate: "0",
};

/* =========================================================
   HELPERS
========================================================= */

function money(
  value: number | string | null | undefined,
  currency = "KES"
) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateText(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
  }).format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function statusClass(status: InvoiceStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

    case "partially_paid":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";

    case "overdue":
      return "bg-red-500/10 text-red-700 dark:text-red-400";

    case "sent":
    case "viewed":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";

    case "pending_approval":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400";

    case "cancelled":
    case "void":
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400";

    default:
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  }
}

function displayStatus(invoice: Invoice): InvoiceStatus {
  if (
    invoice.status === "paid" ||
    invoice.status === "cancelled" ||
    invoice.status === "void"
  ) {
    return invoice.status;
  }

  if (
    invoice.due_date &&
    Number(invoice.amount_due || 0) > 0
  ) {
    const due = new Date(invoice.due_date);

    due.setHours(23, 59, 59, 999);

    if (due < new Date()) {
      return "overdue";
    }
  }

  return invoice.status;
}

function calculateItem(item: DraftItem) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unit_price || 0);

  const gross = quantity * unitPrice;

  const discountValue = Number(
    item.discount_value || 0
  );

  let discount = 0;

  if (item.discount_type === "percentage") {
    discount = (gross * discountValue) / 100;
  }

  if (item.discount_type === "fixed") {
    discount = discountValue;
  }

  discount = Math.min(
    Math.max(discount, 0),
    gross
  );

  const taxable = gross - discount;

  const tax =
    (taxable * Number(item.tax_rate || 0)) / 100;

  return {
    gross,
    discount,
    taxable,
    tax,
    total: taxable + tax,
  };
}

/* =========================================================
   SMALL UI COMPONENTS
========================================================= */

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            {label}
          </p>

          <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong
          ? "text-base font-bold text-gray-900 dark:text-white"
          : "text-sm text-gray-600 dark:text-gray-300"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">
      {children}
    </span>
  );
}

/* =========================================================
   MAIN INVOICE COMPONENT
========================================================= */

export default function Invoices({
  activePage = "invoice-overview",
}: InvoicesProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(
    null
  );

  const [customers, setCustomers] = useState<
    Customer[]
  >([]);

  const [products, setProducts] = useState<
    Product[]
  >([]);

  const [paymentTerms, setPaymentTerms] = useState<
    PaymentTerm[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState<
    "all" | InvoiceStatus
  >("all");

  const [selected, setSelected] =
    useState<Invoice | null>(null);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [showCreate, setShowCreate] = useState(
  activePage === "create-invoice"
);

useEffect(() => {
  setShowCreate(activePage === "create-invoice");
}, [activePage]);

  const loadInvoices = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const [
          invoicesResponse,
          statsResponse,
        ] = await Promise.all([
          fetch("/api/invoices", {
            credentials: "include",
          }),

          fetch("/api/invoices/stats", {
            credentials: "include",
          }),
        ]);

        const invoiceData =
          await invoicesResponse.json();

        const statsData =
          await statsResponse.json();

        if (!invoicesResponse.ok) {
          throw new Error(
            invoiceData.error ||
              "Failed to load invoices."
          );
        }

        setInvoices(
          Array.isArray(invoiceData)
            ? invoiceData
            : invoiceData.invoices || []
        );

        if (statsResponse.ok) {
          setStats(
            statsData.stats ||
              statsData ||
              null
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load invoices."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadCreateData =
    useCallback(async () => {
      try {
        const [
          customersResponse,
          productsResponse,
          termsResponse,
        ] = await Promise.all([
          fetch("/api/customers", {
            credentials: "include",
          }),

          fetch("/api/products", {
            credentials: "include",
          }),

          fetch("/api/payment-terms", {
            credentials: "include",
          }),
        ]);

        const customersData =
          await customersResponse.json();

        const productsData =
          await productsResponse.json();

        const termsData =
          await termsResponse.json();

        if (customersResponse.ok) {
          setCustomers(
            Array.isArray(customersData)
              ? customersData
              : customersData.customers ||
                  []
          );
        }

        if (productsResponse.ok) {
          setProducts(
            Array.isArray(productsData)
              ? productsData
              : productsData.products ||
                  []
          );
        }

        if (termsResponse.ok) {
          setPaymentTerms(
            Array.isArray(termsData)
              ? termsData
              : termsData.paymentTerms ||
                  termsData.payment_terms ||
                  []
          );
        }
      } catch {
        // Creation screen handles empty lists gracefully.
      }
    }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (showCreate) {
      loadCreateData();
    }
  }, [
    showCreate,
    loadCreateData,
  ]);

  const openInvoice = async (
    id: string
  ) => {
    try {
      setDetailLoading(true);
      setSelected(null);
      setError("");

      const response = await fetch(
        `/api/invoices/${id}`,
        {
          credentials: "include",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load invoice."
        );
      }

      setSelected(
        data.invoice || data
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load invoice."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredInvoices =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return invoices.filter(
        (invoice) => {
          const status =
            displayStatus(invoice);

          const matchesStatus =
            filter === "all" ||
            status === filter;

          const matchesSearch =
            !query ||
            invoice.invoice_number
              .toLowerCase()
              .includes(query) ||
            invoice.customer?.company_name
              ?.toLowerCase()
              .includes(query) ||
            invoice.customer?.contact_name
              ?.toLowerCase()
              .includes(query);

          return (
            matchesStatus &&
            matchesSearch
          );
        }
      );
    }, [
      invoices,
      search,
      filter,
    ]);

  if (
    selected ||
    detailLoading
  ) {
    return (
      <InvoiceDetails
        invoice={selected}
        loading={detailLoading}
        onBack={() =>
          setSelected(null)
        }
        onRefresh={async () => {
          if (selected) {
            await openInvoice(
              selected.id
            );
          }

          await loadInvoices();
        }}
      />
    );
  }

  const totalInvoiced =
    stats?.total_invoiced ??
    invoices.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.total_amount || 0
        ),
      0
    );

  const totalCollected =
    stats?.total_collected ??
    invoices.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.amount_paid || 0
        ),
      0
    );

  const totalOutstanding =
    stats?.total_outstanding ??
    invoices.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.amount_due || 0
        ),
      0
    );

  const countStatus = (
    status: InvoiceStatus
  ) => {
    const key =
      `${status}_invoices` as keyof Stats;

    const serverValue =
      stats?.[key];

    if (
      typeof serverValue ===
      "number"
    ) {
      return serverValue;
    }

    return invoices.filter(
      (invoice) =>
        displayStatus(invoice) ===
        status
    ).length;
  };

  const isInvoiceOverview =
  activePage === "invoice-overview" ||
  activePage === "invoicing";

const isInvoicesPage =
  activePage === "invoices";

const isCreateInvoicePage =
  activePage === "create-invoice";

const isCustomersPage =
  activePage === "invoice-customers";

const isPaymentsPage =
  activePage === "invoice-payments";

const isProductsPage =
  activePage === "invoice-products";

const isInvoiceSettingsPage =
  activePage === "invoice-settings";

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      {/* HEADER */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Receipt size={16} />
            Sales & billing
          </div>

          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            Invoices
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Create professional invoices,
            manage customer balances,
            track payments and monitor
            outstanding receivables.
          </p>
        </div>

        <button
          onClick={() =>
            setShowCreate(true)
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus size={17} />
          New invoice
        </button>
      </header>

      {/* ERROR */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <span>{error}</span>

          <button
            onClick={loadInvoices}
            className="ml-auto shrink-0 rounded-lg p-1 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      )}

      {/* STATISTICS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total invoices"
          value={String(
            stats?.total_invoices ??
              invoices.length
          )}
          icon={FileText}
        />

        <StatCard
          label="Total invoiced"
          value={money(
            totalInvoiced
          )}
          icon={Receipt}
        />

        <StatCard
          label="Collected"
          value={money(
            totalCollected
          )}
          icon={Wallet}
        />

        <StatCard
          label="Outstanding"
          value={money(
            totalOutstanding
          )}
          icon={CircleDollarSign}
        />
      </section>

      {/* STATUS FILTERS */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(
          [
            "all",
            "draft",
            "sent",
            "partially_paid",
            "paid",
            "overdue",
            "cancelled",
          ] as const
        ).map((status) => (
          <button
            key={status}
            onClick={() =>
              setFilter(status)
            }
            className={`rounded-xl border p-3 text-left transition ${
              filter === status
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
            }`}
          >
            <p className="text-xs opacity-70">
              {status === "all"
                ? "All"
                : STATUS_LABELS[
                    status
                  ]}
            </p>

            <p className="mt-1 text-lg font-bold">
              {status === "all"
                ? invoices.length
                : countStatus(
                    status
                  )}
            </p>
          </button>
        ))}
      </section>

      {/* INVOICE TABLE */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
          <div>
            <h2 className="text-sm font-semibold">
              Invoice register
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {filteredInvoices.length} invoice
              {filteredInvoices.length ===
              1
                ? ""
                : "s"}{" "}
              shown
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search invoice or customer"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <select
              value={filter}
              onChange={(event) =>
                setFilter(
                  event.target
                    .value as
                    | "all"
                    | InvoiceStatus
                )
              }
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="all">
                All statuses
              </option>

              {Object.entries(
                STATUS_LABELS
              ).map(
                ([
                  key,
                  label,
                ]) => (
                  <option
                    key={key}
                    value={key}
                  >
                    {label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[350px] items-center justify-center">
            <Loader2
              size={30}
              className="animate-spin text-blue-500"
            />
          </div>
        ) : filteredInvoices.length ===
          0 ? (
          <EmptyInvoices
            search={search}
            filter={filter}
            onCreate={() =>
              setShowCreate(true)
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3.5">
                    Invoice
                  </th>

                  <th className="px-5 py-3.5">
                    Customer
                  </th>

                  <th className="px-5 py-3.5">
                    Issued
                  </th>

                  <th className="px-5 py-3.5">
                    Due
                  </th>

                  <th className="px-5 py-3.5">
                    Total
                  </th>

                  <th className="px-5 py-3.5">
                    Paid
                  </th>

                  <th className="px-5 py-3.5">
                    Balance
                  </th>

                  <th className="px-5 py-3.5">
                    Status
                  </th>

                  <th />
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredInvoices.map(
                  (invoice) => {
                    const status =
                      displayStatus(
                        invoice
                      );

                    const currency =
                      invoice.currency ||
                      "KES";

                    return (
                      <tr
                        key={
                          invoice.id
                        }
                        onClick={() =>
                          openInvoice(
                            invoice.id
                          )
                        }
                        className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold">
                            {
                              invoice.invoice_number
                            }
                          </p>

                          {invoice.po_number && (
                            <p className="mt-1 text-xs text-gray-500">
                              PO:{" "}
                              {
                                invoice.po_number
                              }
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-sm font-medium">
                            {invoice
                              .customer
                              ?.company_name ||
                              "Unknown customer"}
                          </p>

                          {invoice
                            .customer
                            ?.contact_name && (
                            <p className="text-xs text-gray-500">
                              {
                                invoice
                                  .customer
                                  .contact_name
                              }
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {dateText(
                            invoice.issue_date
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {dateText(
                            invoice.due_date
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm font-semibold">
                          {money(
                            invoice.total_amount,
                            currency
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {money(
                            invoice.amount_paid,
                            currency
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm font-semibold">
                          {money(
                            invoice.amount_due,
                            currency
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                              status
                            )}`}
                          >
                            {
                              STATUS_LABELS[
                                status
                              ]
                            }
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <ChevronRight
                            size={17}
                            className="text-gray-400"
                          />
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CREATE INVOICE */}
      {showCreate && (
        <CreateInvoiceModal
          customers={
            customers
          }
          products={
            products
          }
          paymentTerms={
            paymentTerms
          }
          onClose={() =>
            setShowCreate(false)
          }
          onCreated={async () => {
            setShowCreate(false);
            await loadInvoices();
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   EMPTY STATE
========================================================= */

function EmptyInvoices({
  search,
  filter,
  onCreate,
}: {
  search: string;
  filter:
    | "all"
    | InvoiceStatus;
  onCreate: () => void;
}) {
  const filtered =
    Boolean(search) ||
    filter !== "all";

  return (
    <div className="flex min-h-[350px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
        <FileText
          size={26}
          className="text-gray-400"
        />
      </div>

      <h3 className="mt-4 font-semibold">
        {filtered
          ? "No matching invoices"
          : "No invoices yet"}
      </h3>

      <p className="mt-1 max-w-md text-sm text-gray-500">
        {filtered
          ? "Try changing the search or status filter."
          : "Create your first invoice to start tracking sales and customer payments."}
      </p>

      {!filtered && (
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Create invoice
        </button>
      )}
    </div>
  );
}

/* =========================================================
   CREATE INVOICE
========================================================= */

function CreateInvoiceModal({
  customers,
  products,
  paymentTerms,
  onClose,
  onCreated,
}: {
  customers: Customer[];
  products: Product[];
  paymentTerms: PaymentTerm[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [customerId, setCustomerId] =
    useState("");

  const [issueDate, setIssueDate] =
    useState(today());

  const [dueDate, setDueDate] =
    useState("");

  const [paymentTermsId, setPaymentTermsId] =
    useState("");

  const [currency, setCurrency] =
    useState("KES");

  const [
    taxCalculationMethod,
    setTaxCalculationMethod,
  ] = useState<
    "exclusive" | "inclusive"
  >("exclusive");

  const [poNumber, setPoNumber] =
    useState("");

  const [discountType, setDiscountType] =
    useState<
      "percentage" | "fixed" | ""
    >("");

  const [discountValue, setDiscountValue] =
    useState("0");

  const [shippingCost, setShippingCost] =
    useState("0");

  const [notes, setNotes] =
    useState("");

  const [internalNotes, setInternalNotes] =
    useState("");

  const [items, setItems] =
    useState<DraftItem[]>([
      { ...EMPTY_ITEM },
    ]);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const selectedCustomer =
    customers.find(
      (customer) =>
        customer.id ===
        customerId
    );

  const selectedPaymentTerms =
    paymentTerms.find(
      (term) =>
        term.id ===
        paymentTermsId
    );

  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      calculateItem(item)
        .gross,
    0
  );

  const itemDiscount = items.reduce(
    (sum, item) =>
      sum +
      calculateItem(item)
        .discount,
    0
  );

  const taxableSubtotal =
    items.reduce(
      (sum, item) =>
        sum +
        calculateItem(item)
          .taxable,
      0
    );

  const itemTax = items.reduce(
    (sum, item) =>
      sum +
      calculateItem(item)
        .tax,
    0
  );

  const invoiceDiscount =
    Number(discountValue || 0);

  const calculatedInvoiceDiscount =
    discountType === "percentage"
      ? (taxableSubtotal *
          invoiceDiscount) /
        100
      : discountType === "fixed"
        ? invoiceDiscount
        : 0;

  const safeInvoiceDiscount =
    Math.min(
      Math.max(
        calculatedInvoiceDiscount,
        0
      ),
      taxableSubtotal
    );

  const finalTaxable =
    taxableSubtotal -
    safeInvoiceDiscount;

  const finalTax =
    taxCalculationMethod ===
    "exclusive"
      ? itemTax
      : itemTax;

  const shipping =
    Number(shippingCost || 0);

  const total =
    finalTaxable +
    finalTax +
    shipping;

  const updateItem = (
    index: number,
    field: keyof DraftItem,
    value: string
  ) => {
    setItems(
      (current) =>
        current.map(
          (item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  [field]:
                    value,
                }
              : item
        )
    );
  };

  const selectProduct = (
    index: number,
    productId: string
  ) => {
    const product =
      products.find(
        (item) =>
          item.id ===
          productId
      );

    if (!product) {
      updateItem(
        index,
        "product_id",
        ""
      );

      return;
    }

    setItems(
      (current) =>
        current.map(
          (item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  product_id:
                    product.id,
                  description:
                    product.description ||
                    product.name,
                  unit_price:
                    String(
                      product.unit_price
                    ),
                }
              : item
        )
    );
  };

  const handlePaymentTermsChange =
    (id: string) => {
      setPaymentTermsId(id);

      const term =
        paymentTerms.find(
          (item) =>
            item.id === id
        );

      if (!term) {
        return;
      }

      const base =
        new Date(
          issueDate ||
            today()
        );

      base.setDate(
        base.getDate() +
          Number(
            term.due_days || 0
          )
      );

      setDueDate(
        base
          .toISOString()
          .slice(0, 10)
      );
    };

  const submit = async () => {
    try {
      setSaving(true);
      setError("");

      if (!customerId) {
        throw new Error(
          "Select a customer."
        );
      }

      if (!issueDate) {
        throw new Error(
          "Issue date is required."
        );
      }

      if (
        items.length === 0
      ) {
        throw new Error(
          "Add at least one invoice item."
        );
      }

      if (
        items.some(
          (item) =>
            !item.description.trim()
        )
      ) {
        throw new Error(
          "Every invoice item needs a description."
        );
      }

      if (
        items.some(
          (item) =>
            Number(
              item.quantity
            ) <= 0 ||
            Number(
              item.unit_price
            ) < 0
        )
      ) {
        throw new Error(
          "Check your quantities and prices."
        );
      }

      const payload = {
        customer_id:
          customerId,

        issue_date:
          issueDate,

        due_date:
          dueDate || null,

        payment_terms_id:
          paymentTermsId ||
          null,

        payment_terms_display:
          selectedPaymentTerms
            ?.name ||
          null,

        currency,

        po_number:
          poNumber.trim() ||
          null,

        tax_calculation_method:
          taxCalculationMethod,

        discount_type:
          discountType ||
          null,

        discount_value:
          Number(
            discountValue || 0
          ),

        shipping_cost:
          shipping,

        notes:
          notes.trim() ||
          null,

        internal_notes:
          internalNotes.trim() ||
          null,

        items: items.map(
          (item) => ({
            product_id:
              item.product_id ||
              null,

            description:
              item.description.trim(),

            quantity:
              Number(
                item.quantity
              ),

            unit_price:
              Number(
                item.unit_price
              ),

            discount_type:
              item.discount_type ||
              null,

            discount_value:
              Number(
                item.discount_value ||
                  0
              ),

            tax_rate:
              Number(
                item.tax_rate ||
                  0
              ),
          })
        ),
      };

      const response =
        await fetch(
          "/api/invoices",
          {
            method: "POST",
            credentials:
              "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to create invoice."
        );
      }

      await onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create invoice."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-950">
        {/* MODAL HEADER */}
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold">
              Create invoice
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Build a complete invoice
              using your invoicing
              configuration.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={19} />
          </button>
        </header>

        {/* BODY */}
        <div className="overflow-y-auto p-5 sm:p-6">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0"
              />
              <span>
                {error}
              </span>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* LEFT */}
            <div className="space-y-6">
              {/* CUSTOMER */}
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="mb-5">
                  <h3 className="text-sm font-bold">
                    Customer & invoice details
                  </h3>

                  <p className="mt-1 text-xs text-gray-500">
                    Select the customer
                    and define the basic
                    invoice information.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <FieldLabel>
                      Customer
                    </FieldLabel>

                    <select
                      value={
                        customerId
                      }
                      onChange={(
                        event
                      ) =>
                        setCustomerId(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">
                        Select customer
                      </option>

                      {customers.map(
                        (
                          customer
                        ) => (
                          <option
                            key={
                              customer.id
                            }
                            value={
                              customer.id
                            }
                          >
                            {
                              customer.company_name
                            }
                            {customer.contact_name
                              ? ` — ${customer.contact_name}`
                              : ""}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <FieldLabel>
                      Issue date
                    </FieldLabel>

                    <input
                      type="date"
                      value={
                        issueDate
                      }
                      onChange={(
                        event
                      ) =>
                        setIssueDate(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>

                  <label>
                    <FieldLabel>
                      Due date
                    </FieldLabel>

                    <input
                      type="date"
                      value={
                        dueDate
                      }
                      onChange={(
                        event
                      ) =>
                        setDueDate(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>

                  <label>
                    <FieldLabel>
                      Payment terms
                    </FieldLabel>

                    <select
                      value={
                        paymentTermsId
                      }
                      onChange={(
                        event
                      ) =>
                        handlePaymentTermsChange(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">
                        Select payment terms
                      </option>

                      {paymentTerms.map(
                        (
                          term
                        ) => (
                          <option
                            key={
                              term.id
                            }
                            value={
                              term.id
                            }
                          >
                            {
                              term.name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <FieldLabel>
                      Currency
                    </FieldLabel>

                    <select
                      value={
                        currency
                      }
                      onChange={(
                        event
                      ) =>
                        setCurrency(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      {CURRENCIES.map(
                        (
                          item
                        ) => (
                          <option
                            key={
                              item
                            }
                            value={
                              item
                            }
                          >
                            {item}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <FieldLabel>
                      Purchase order
                    </FieldLabel>

                    <input
                      value={
                        poNumber
                      }
                      onChange={(
                        event
                      ) =>
                        setPoNumber(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="PO-000123"
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>

                  <label>
                    <FieldLabel>
                      Tax calculation
                    </FieldLabel>

                    <select
                      value={
                        taxCalculationMethod
                      }
                      onChange={(
                        event
                      ) =>
                        setTaxCalculationMethod(
                          event
                            .target
                            .value as
                            | "exclusive"
                            | "inclusive"
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="exclusive">
                        Tax exclusive
                      </option>

                      <option value="inclusive">
                        Tax inclusive
                      </option>
                    </select>
                  </label>
                </div>

                {selectedCustomer && (
                  <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs text-gray-500">
                          Customer
                        </p>

                        <p className="mt-1 text-sm font-semibold">
                          {
                            selectedCustomer.company_name
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Email
                        </p>

                        <p className="mt-1 truncate text-sm">
                          {
                            selectedCustomer.email ||
                            "—"
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Phone
                        </p>

                        <p className="mt-1 text-sm">
                          {
                            selectedCustomer.phone ||
                            "—"
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500">
                          Tax ID
                        </p>

                        <p className="mt-1 text-sm">
                          {
                            selectedCustomer.tax_id ||
                            "—"
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ITEMS */}
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="mb-5 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">
                      Invoice items
                    </h3>

                    <p className="mt-1 text-xs text-gray-500">
                      Add products or
                      services, quantities,
                      discounts and tax.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setItems(
                        (
                          current
                        ) => [
                          ...current,
                          {
                            ...EMPTY_ITEM,
                          },
                        ]
                      )
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700"
                  >
                    <Plus size={14} />
                    Add item
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[1050px]">
                    <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800/50">
                      <tr>
                        <th className="p-3 text-left">
                          Product
                        </th>

                        <th className="p-3 text-left">
                          Description
                        </th>

                        <th className="p-3">
                          Qty
                        </th>

                        <th className="p-3">
                          Unit price
                        </th>

                        <th className="p-3">
                          Discount
                        </th>

                        <th className="p-3">
                          Tax
                        </th>

                        <th className="p-3 text-right">
                          Total
                        </th>

                        <th />
                      </tr>
                    </thead>

                    <tbody className="divide-y dark:divide-gray-800">
                      {items.map(
                        (
                          item,
                          index
                        ) => {
                          const calculated =
                            calculateItem(
                              item
                            );

                          return (
                            <tr
                              key={
                                index
                              }
                            >
                              <td className="p-2">
                                <select
                                  value={
                                    item.product_id
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    selectProduct(
                                      index,
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  className="w-40 rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                                >
                                  <option value="">
                                    Custom item
                                  </option>

                                  {products
                                    .filter(
                                      (
                                        product
                                      ) =>
                                        product.is_active !==
                                        false
                                    )
                                    .map(
                                      (
                                        product
                                      ) => (
                                        <option
                                          key={
                                            product.id
                                          }
                                          value={
                                            product.id
                                          }
                                        >
                                          {
                                            product.name
                                          }
                                        </option>
                                      )
                                    )}
                                </select>
                              </td>

                              <td className="p-2">
                                <input
                                  value={
                                    item.description
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateItem(
                                      index,
                                      "description",
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  placeholder="Description"
                                  className="w-56 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                                />
                              </td>

                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={
                                    item.quantity
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateItem(
                                      index,
                                      "quantity",
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  className="w-20 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                                />
                              </td>

                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    item.unit_price
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateItem(
                                      index,
                                      "unit_price",
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  className="w-28 rounded-lg border border-gray-200 px-2.5 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                                />
                              </td>

                              <td className="p-2">
                                <div className="flex gap-1">
                                  <select
                                    value={
                                      item.discount_type
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateItem(
                                        index,
                                        "discount_type",
                                        event
                                          .target
                                          .value
                                      )
                                    }
                                    className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-xs dark:border-gray-700 dark:bg-gray-900"
                                  >
                                    <option value="">
                                      None
                                    </option>

                                    <option value="percentage">
                                      %
                                    </option>

                                    <option value="fixed">
                                      Fixed
                                    </option>
                                  </select>

                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={
                                      item.discount_value
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateItem(
                                        index,
                                        "discount_value",
                                        event
                                          .target
                                          .value
                                      )
                                    }
                                    className="w-20 rounded-lg border border-gray-200 px-2 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                                  />
                                </div>
                              </td>

                              <td className="p-2">
                                <select
                                  value={
                                    item.tax_rate
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateItem(
                                      index,
                                      "tax_rate",
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                                >
                                  {TAX_RATES.map(
                                    (
                                      rate
                                    ) => (
                                      <option
                                        key={
                                          rate.value
                                        }
                                        value={
                                          rate.value
                                        }
                                      >
                                        {
                                          rate.label
                                        }
                                      </option>
                                    )
                                  )}
                                </select>
                              </td>

                              <td className="p-3 text-right text-sm font-semibold">
                                {money(
                                  calculated.total,
                                  currency
                                )}
                              </td>

                              <td className="p-2">
                                <button
                                  type="button"
                                  disabled={
                                    items.length ===
                                    1
                                  }
                                  onClick={() =>
                                    setItems(
                                      (
                                        current
                                      ) =>
                                        current.filter(
                                          (
                                            _,
                                            itemIndex
                                          ) =>
                                            itemIndex !==
                                            index
                                        )
                                    )
                                  }
                                  className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-950/30"
                                >
                                  <Trash2
                                    size={
                                      16
                                    }
                                  />
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                    <p className="text-xs text-gray-500">
                      Item discounts
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {money(
                        itemDiscount,
                        currency
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
                    <p className="text-xs text-gray-500">
                      Item tax
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {money(
                        itemTax,
                        currency
                      )}
                    </p>
                  </div>
                </div>
              </section>

              {/* DISCOUNTS / SHIPPING */}
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <h3 className="text-sm font-bold">
                  Invoice adjustments
                </h3>

                <p className="mt-1 text-xs text-gray-500">
                  Apply an invoice-level
                  discount or shipping charge.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label>
                    <FieldLabel>
                      Discount type
                    </FieldLabel>

                    <select
                      value={
                        discountType
                      }
                      onChange={(
                        event
                      ) =>
                        setDiscountType(
                          event
                            .target
                            .value as
                            | "percentage"
                            | "fixed"
                            | ""
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">
                        No discount
                      </option>

                      <option value="percentage">
                        Percentage
                      </option>

                      <option value="fixed">
                        Fixed amount
                      </option>
                    </select>
                  </label>

                  <label>
                    <FieldLabel>
                      Discount value
                    </FieldLabel>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        discountValue
                      }
                      disabled={
                        !discountType
                      }
                      onChange={(
                        event
                      ) =>
                        setDiscountValue(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
                    />
                  </label>

                  <label>
                    <FieldLabel>
                      Shipping cost
                    </FieldLabel>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        shippingCost
                      }
                      onChange={(
                        event
                      ) =>
                        setShippingCost(
                          event
                            .target
                            .value
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>
                </div>
              </section>

              {/* NOTES */}
              <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <h3 className="text-sm font-bold">
                  Notes & internal information
                </h3>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>
                    <FieldLabel>
                      Customer notes
                    </FieldLabel>

                    <textarea
                      value={notes}
                      onChange={(
                        event
                      ) =>
                        setNotes(
                          event
                            .target
                            .value
                        )
                      }
                      rows={5}
                      placeholder="Notes shown to the customer..."
                      className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>

                  <label>
                    <FieldLabel>
                      Internal notes
                    </FieldLabel>

                    <textarea
                      value={
                        internalNotes
                      }
                      onChange={(
                        event
                      ) =>
                        setInternalNotes(
                          event
                            .target
                            .value
                        )
                      }
                      rows={5}
                      placeholder="Staff-only notes..."
                      className="w-full rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>
                </div>
              </section>
            </div>

            {/* RIGHT PREVIEW */}
            <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900 xl:sticky xl:top-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Invoice preview
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Live calculation
                  </p>
                </div>

                <Receipt
                  size={19}
                  className="text-blue-500"
                />
              </div>

              <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">
                      SaMi
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Invoice
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      Invoice #
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      Auto-generated
                    </p>
                  </div>
                </div>

                <div className="my-5 border-t border-gray-200 dark:border-gray-800" />

                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-500">
                      Bill to
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      {selectedCustomer
                        ?.company_name ||
                        "Select customer"}
                    </p>

                    {selectedCustomer
                      ?.email && (
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {
                          selectedCustomer.email
                        }
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">
                        Issue date
                      </p>

                      <p className="mt-1 text-xs font-medium">
                        {dateText(
                          issueDate
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">
                        Due date
                      </p>

                      <p className="mt-1 text-xs font-medium">
                        {dueDate
                          ? dateText(
                              dueDate
                            )
                          : "Not set"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                    <SummaryRow
                      label="Subtotal"
                      value={money(
                        subtotal,
                        currency
                      )}
                    />

                    {itemDiscount >
                      0 && (
                      <div className="mt-2">
                        <SummaryRow
                          label="Item discounts"
                          value={`-${money(
                            itemDiscount,
                            currency
                          )}`}
                        />
                      </div>
                    )}

                    {safeInvoiceDiscount >
                      0 && (
                      <div className="mt-2">
                        <SummaryRow
                          label="Invoice discount"
                          value={`-${money(
                            safeInvoiceDiscount,
                            currency
                          )}`}
                        />
                      </div>
                    )}

                    <div className="mt-2">
                      <SummaryRow
                        label="Tax"
                        value={money(
                          finalTax,
                          currency
                        )}
                      />
                    </div>

                    {shipping >
                      0 && (
                      <div className="mt-2">
                        <SummaryRow
                          label="Shipping"
                          value={money(
                            shipping,
                            currency
                          )}
                        />
                      </div>
                    )}

                    <div className="my-4 border-t border-gray-200 dark:border-gray-800" />

                    <SummaryRow
                      label="Total"
                      value={money(
                        total,
                        currency
                      )}
                      strong
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
                <div className="flex items-start gap-3">
                  <CreditCard
                    size={18}
                    className="mt-0.5 text-blue-600 dark:text-blue-400"
                  />

                  <div>
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                      Payment terms
                    </p>

                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                      {selectedPaymentTerms
                        ?.name ||
                        "No payment terms selected"}
                    </p>
                  </div>
                </div>
              </div>

              <button
                disabled={
                  saving
                }
                onClick={
                  submit
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                )}

                {saving
                  ? "Creating invoice..."
                  : "Create invoice"}
              </button>

              <button
                disabled={
                  saving
                }
                onClick={
                  onClose
                }
                className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   INVOICE DETAILS
========================================================= */

function InvoiceDetails({
  invoice,
  loading,
  onBack,
  onRefresh,
}: {
  invoice: Invoice | null;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  if (loading || !invoice) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <Loader2
          size={30}
          className="animate-spin text-blue-500"
        />
      </div>
    );
  }

  const status =
    displayStatus(invoice);

  const currency =
    invoice.currency ||
    "KES";

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      {/* BACK */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to invoices
      </button>

      {/* HEADER */}
      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">
                {
                  invoice.invoice_number
                }
              </h1>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                  status
                )}`}
              >
                {
                  STATUS_LABELS[
                    status
                  ]
                }
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Issued{" "}
              {dateText(
                invoice.issue_date
              )}

              {invoice.due_date &&
                ` · Due ${dateText(
                  invoice.due_date
                )}`}
            </p>
          </div>

          <button
            onClick={
              onRefresh
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
          >
            <RefreshCw
              size={16}
            />
            Refresh
          </button>
        </div>
      </header>

      {/* SUMMARY */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Invoice total"
          value={money(
            invoice.total_amount,
            currency
          )}
          icon={Receipt}
        />

        <StatCard
          label="Amount paid"
          value={money(
            invoice.amount_paid,
            currency
          )}
          icon={Wallet}
        />

        <StatCard
          label="Balance due"
          value={money(
            invoice.amount_due,
            currency
          )}
          icon={CircleDollarSign}
        />
      </section>

      {/* CUSTOMER */}
      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">
            Customer
          </h2>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField
            label="Company"
            value={
              invoice.customer
                ?.company_name
            }
          />

          <DetailField
            label="Contact"
            value={
              invoice.customer
                ?.contact_name
            }
          />

          <DetailField
            label="Email"
            value={
              invoice.customer
                ?.email
            }
          />

          <DetailField
            label="Phone"
            value={
              invoice.customer
                ?.phone
            }
          />

          <DetailField
            label="Tax ID"
            value={
              invoice.customer
                ?.tax_id
            }
          />

          <DetailField
            label="Registration"
            value={
              invoice.customer
                ?.registration_number
            }
          />

          <DetailField
            label="Currency"
            value={
              invoice.customer
                ?.currency
            }
          />

          <DetailField
            label="Customer type"
            value={
              invoice.customer
                ?.customer_type
            }
          />
        </div>

        {invoice.customer
          ?.billing_address && (
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Billing address
            </p>

            <p className="mt-1 whitespace-pre-line text-sm">
              {
                invoice.customer
                  .billing_address
              }
            </p>
          </div>
        )}
      </section>

      {/* INVOICE META */}
      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">
            Invoice information
          </h2>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField
            label="Invoice number"
            value={
              invoice.invoice_number
            }
          />

          <DetailField
            label="Purchase order"
            value={
              invoice.po_number
            }
          />

          <DetailField
            label="Currency"
            value={
              invoice.currency
            }
          />

          <DetailField
            label="Payment terms"
            value={
              invoice.payment_terms_display
            }
          />

          <DetailField
            label="Tax calculation"
            value={
              invoice.tax_calculation_method
            }
          />

          <DetailField
            label="Issue date"
            value={
              dateText(
                invoice.issue_date
              )
            }
          />

          <DetailField
            label="Due date"
            value={
              dateText(
                invoice.due_date
              )
            }
          />

          <DetailField
            label="Payment date"
            value={
              dateText(
                invoice.payment_date
              )
            }
          />
        </div>
      </section>

      {/* ITEMS */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">
            Invoice items
          </h2>

          <p className="mt-1 text-xs text-gray-500">
            Products and services included
            in this invoice.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
              <tr>
                <th className="px-5 py-3 text-left">
                  Description
                </th>

                <th className="px-5 py-3 text-right">
                  Qty
                </th>

                <th className="px-5 py-3 text-right">
                  Unit price
                </th>

                <th className="px-5 py-3 text-right">
                  Discount
                </th>

                <th className="px-5 py-3 text-right">
                  Tax
                </th>

                <th className="px-5 py-3 text-right">
                  Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-gray-800">
              {(
                invoice.invoice_items ||
                []
              ).map(
                (item) => (
                  <tr
                    key={
                      item.id
                    }
                  >
                    <td className="px-5 py-4 text-sm">
                      {
                        item.description
                      }
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {
                        item.quantity
                      }
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {money(
                        item.unit_price,
                        currency
                      )}
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {money(
                        item.discount_amount ||
                          0,
                        currency
                      )}
                    </td>

                    <td className="px-5 py-4 text-right text-sm">
                      {money(
                        item.tax_amount,
                        currency
                      )}{" "}
                      (
                      {
                        item.tax_rate
                      }
                      %)
                    </td>

                    <td className="px-5 py-4 text-right text-sm font-bold">
                      {money(
                        item.line_total,
                        currency
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 p-5 dark:border-gray-800">
          <div className="ml-auto max-w-sm space-y-2.5">
            <SummaryRow
              label="Subtotal"
              value={money(
                invoice.subtotal,
                currency
              )}
            />

            {Number(
              invoice.discount_amount ||
                0
            ) > 0 && (
              <SummaryRow
                label="Discount"
                value={`-${money(
                  invoice.discount_amount,
                  currency
                )}`}
              />
            )}

            <SummaryRow
              label="Tax"
              value={money(
                invoice.tax_amount,
                currency
              )}
            />

            {Number(
              invoice.shipping_cost ||
                0
            ) > 0 && (
              <SummaryRow
                label="Shipping"
                value={money(
                  invoice.shipping_cost,
                  currency
                )}
              />
            )}

            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <SummaryRow
                label="Total"
                value={money(
                  invoice.total_amount,
                  currency
                )}
                strong
              />
            </div>
          </div>
        </div>
      </section>

      {/* PAYMENTS */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <h2 className="text-sm font-bold">
            Payment history
          </h2>
        </div>

        {!invoice.payments
          ?.length ? (
          <div className="p-5 text-sm text-gray-500">
            No payments have been
            recorded for this invoice.
          </div>
        ) : (
          <div className="divide-y dark:divide-gray-800">
            {invoice.payments.map(
              (payment) => (
                <div
                  key={
                    payment.id
                  }
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">
                      {money(
                        payment.amount,
                        payment.currency ||
                          currency
                      )}
                    </p>

                    <p className="mt-1 text-xs capitalize text-gray-500">
                      {
                        payment.payment_method
                      }{" "}
                      ·{" "}
                      {dateText(
                        payment.payment_date
                      )}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs text-gray-500">
                      {payment.transaction_reference ||
                        "No reference"}
                    </p>

                    <p className="mt-1 text-xs capitalize text-gray-500">
                      {
                        payment.status
                      }
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* NOTES */}
      {(invoice.notes ||
        invoice.internal_notes) && (
        <section className="grid gap-4 md:grid-cols-2">
          {invoice.notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">
                Customer notes
              </h2>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {
                  invoice.notes
                }
              </p>
            </div>
          )}

          {invoice.internal_notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-sm font-bold">
                Internal notes
              </h2>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {
                  invoice.internal_notes
                }
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* =========================================================
   DETAIL FIELD
========================================================= */

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
        {value || "—"}
      </p>
    </div>
  );
}