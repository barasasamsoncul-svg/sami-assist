"use client";

import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit3,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Receipt,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  tax_number: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type CustomerInvoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
};

type CustomerPayment = {
  id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
};

type CustomerResponse = {
  customer: Customer;
  invoices: CustomerInvoice[];
  payments: CustomerPayment[];
};

type EditForm = {
  name: string;
  email: string;
  phone: string;
  company_name: string;
  tax_number: string;
  address: string;
  city: string;
  country: string;
  notes: string;
  status: string;
};

function formatMoney(
  amount: number,
  currency = "KES"
) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "C"
  );
}

function invoiceStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

    case "overdue":
      return "bg-red-500/10 text-red-400 border-red-500/20";

    case "sent":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";

    case "draft":
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";

    case "partially_paid":
    case "partial":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";

    case "cancelled":
    case "void":
      return "bg-red-500/10 text-red-400 border-red-500/20";

    default:
      return "bg-white/5 text-slate-400 border-white/10";
  }
}

function paymentMethodLabel(
  method: string | null
) {
  if (!method) return "—";

  return method
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

export default function CustomerDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const customerId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";

  const [data, setData] =
    useState<CustomerResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [editing, setEditing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<"overview" | "invoices" | "payments">(
      "overview"
    );

  const [form, setForm] =
    useState<EditForm>({
      name: "",
      email: "",
      phone: "",
      company_name: "",
      tax_number: "",
      address: "",
      city: "",
      country: "",
      notes: "",
      status: "active",
    });

  const loadCustomer = useCallback(
    async () => {
      if (!customerId) return;

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `/api/invoice-customers/${encodeURIComponent(
            customerId
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error ||
              "Unable to load customer."
          );
        }

        setData(result);

        const customer: Customer =
          result.customer;

        setForm({
          name: customer.name || "",
          email: customer.email || "",
          phone: customer.phone || "",
          company_name:
            customer.company_name || "",
          tax_number:
            customer.tax_number || "",
          address: customer.address || "",
          city: customer.city || "",
          country:
            customer.country || "",
          notes: customer.notes || "",
          status:
            customer.status || "active",
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load customer."
        );
      } finally {
        setLoading(false);
      }
    },
    [customerId]
  );

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const customer = data?.customer ?? null;

  const invoices =
    data?.invoices ?? [];

  const payments =
    data?.payments ?? [];

  const invoiceStats = useMemo(() => {
    const totalInvoiced =
      invoices.reduce(
        (sum, invoice) =>
          sum + Number(invoice.total || 0),
        0
      );

    const totalPaid =
      invoices.reduce(
        (sum, invoice) =>
          sum +
          Number(invoice.amount_paid || 0),
        0
      );

    const outstanding =
      invoices.reduce(
        (sum, invoice) =>
          sum +
          Number(invoice.balance_due || 0),
        0
      );

    const overdue =
      invoices
        .filter(
          (invoice) =>
            invoice.status.toLowerCase() ===
            "overdue"
        )
        .reduce(
          (sum, invoice) =>
            sum +
            Number(
              invoice.balance_due || 0
            ),
          0
        );

    return {
      totalInvoiced,
      totalPaid,
      outstanding,
      overdue,
    };
  }, [invoices]);

  function updateField(
    field: keyof EditForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveCustomer() {
    if (!customerId) return;

    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        `/api/invoice-customers/${encodeURIComponent(
          customerId
        )}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: form.name.trim(),
            email:
              form.email.trim() || null,
            phone:
              form.phone.trim() || null,
            company_name:
              form.company_name.trim() ||
              null,
            tax_number:
              form.tax_number.trim() ||
              null,
            address:
              form.address.trim() || null,
            city:
              form.city.trim() || null,
            country:
              form.country.trim() || null,
            notes:
              form.notes.trim() || null,
            status: form.status,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Unable to update customer."
        );
      }

      setEditing(false);

      await loadCustomer();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update customer."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer() {
    if (!customerId) return;

    const confirmed = window.confirm(
      "Delete this customer? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");

      const response = await fetch(
        `/api/invoice-customers/${encodeURIComponent(
          customerId
        )}`,
        {
          method: "DELETE",
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Unable to delete customer."
        );
      }

      router.push("/invoices/customers");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete customer."
      );
    } finally {
      setDeleting(false);
      setMenuOpen(false);
    }
  }

  function createInvoice() {
    router.push(
      `/invoices/new?customerId=${encodeURIComponent(
        customerId
      )}`
    );
  }

  if (loading) {
    return (
      <main className="min-h-full bg-[#07111f] p-6 text-white">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-white/5" />
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />

          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-2xl bg-white/5"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="min-h-full bg-[#07111f] p-6 text-white">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/invoices/customers"
              )
            }
            className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft size={18} />
            Back to Customers
          </button>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <h1 className="text-lg font-semibold">
              Customer not found
            </h1>

            <p className="mt-2 text-sm text-red-300">
              {error ||
                "This customer could not be found."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#07111f] p-4 text-white sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/invoices/customers"
                )
              }
              className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <p className="text-xs text-slate-500">
                Customers
              </p>

              <h1 className="text-2xl font-bold tracking-tight">
                {customer.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={createInvoice}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-500"
            >
              <Receipt size={17} />
              Create Invoice
            </button>

            <button
              type="button"
              onClick={() =>
                setEditing(true)
              }
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Edit3 size={17} />
              Edit
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setMenuOpen(
                    (current) => !current
                  )
                }
                className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
              >
                <MoreHorizontal
                  size={19}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0c1828] p-1 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Edit3 size={16} />
                    Edit Customer
                  </button>

                  <button
                    type="button"
                    disabled={deleting}
                    onClick={deleteCustomer}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={16} />
                    {deleting
                      ? "Deleting..."
                      : "Delete Customer"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* CUSTOMER PROFILE */}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/20 text-xl font-bold text-blue-400">
                {getInitials(
                  customer.name
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    {customer.name}
                  </h2>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      customer.status.toLowerCase() ===
                      "active"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        : "border-slate-500/20 bg-slate-500/10 text-slate-400"
                    }`}
                  >
                    {customer.status}
                  </span>
                </div>

                {customer.company_name && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                    <Building2
                      size={15}
                    />
                    {customer.company_name}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400"
                >
                  <Mail size={16} />
                  {customer.email}
                </a>
              )}

              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400"
                >
                  <Phone size={16} />
                  {customer.phone}
                </a>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 px-6">
            <div className="flex gap-6 overflow-x-auto">
              {(
                [
                  [
                    "overview",
                    "Overview",
                  ],
                  [
                    "invoices",
                    "Invoices",
                  ],
                  [
                    "payments",
                    "Payments",
                  ],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setActiveTab(id)
                  }
                  className={`border-b-2 px-1 py-4 text-sm font-medium transition ${
                    activeTab === id
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-500 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* OVERVIEW */}

        {activeTab === "overview" && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={FileText}
                label="Total Invoiced"
                value={formatMoney(
                  invoiceStats.totalInvoiced
                )}
              />

              <StatCard
                icon={CheckCircle2}
                label="Total Paid"
                value={formatMoney(
                  invoiceStats.totalPaid
                )}
                iconClass="text-emerald-400"
              />

              <StatCard
                icon={CreditCard}
                label="Outstanding"
                value={formatMoney(
                  invoiceStats.outstanding
                )}
                iconClass="text-amber-400"
              />

              <StatCard
                icon={XCircle}
                label="Overdue"
                value={formatMoney(
                  invoiceStats.overdue
                )}
                iconClass="text-red-400"
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 lg:col-span-2">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">
                      Recent Invoices
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Latest invoices for this
                      customer
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveTab(
                        "invoices"
                      )
                    }
                    className="text-xs font-medium text-blue-400 hover:text-blue-300"
                  >
                    View all
                  </button>
                </div>

                {invoices.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No invoices yet"
                    description="Create an invoice for this customer to see it here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <InvoiceTable
                      invoices={invoices.slice(
                        0,
                        5
                      )}
                      onInvoiceClick={(id) =>
                        router.push(
                          `/invoices/${id}`
                        )
                      }
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                <h2 className="font-semibold">
                  Customer Information
                </h2>

                <div className="mt-5 space-y-4">
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={
                      customer.email ||
                      "Not provided"
                    }
                  />

                  <InfoRow
                    icon={Phone}
                    label="Phone"
                    value={
                      customer.phone ||
                      "Not provided"
                    }
                  />

                  <InfoRow
                    icon={Building2}
                    label="Company"
                    value={
                      customer.company_name ||
                      "Not provided"
                    }
                  />

                  <InfoRow
                    icon={CreditCard}
                    label="Tax Number"
                    value={
                      customer.tax_number ||
                      "Not provided"
                    }
                  />

                  <InfoRow
                    icon={MapPin}
                    label="Address"
                    value={
                      [
                        customer.address,
                        customer.city,
                        customer.country,
                      ]
                        .filter(Boolean)
                        .join(", ") ||
                      "Not provided"
                    }
                  />

                  <InfoRow
                    icon={Calendar}
                    label="Customer Since"
                    value={formatDate(
                      customer.created_at
                    )}
                  />
                </div>
              </div>
            </section>

            {customer.notes && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                <h2 className="font-semibold">
                  Notes
                </h2>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                  {customer.notes}
                </p>
              </section>
            )}
          </>
        )}

        {/* INVOICES */}

        {activeTab === "invoices" && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  Customer Invoices
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {invoices.length} invoice
                  {invoices.length === 1
                    ? ""
                    : "s"}
                </p>
              </div>

              <button
                type="button"
                onClick={createInvoice}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold hover:bg-blue-500"
              >
                <Receipt size={16} />
                New Invoice
              </button>
            </div>

            {invoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No invoices"
                description="This customer does not have any invoices yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <InvoiceTable
                  invoices={invoices}
                  onInvoiceClick={(id) =>
                    router.push(
                      `/invoices/${id}`
                    )
                  }
                />
              </div>
            )}
          </section>
        )}

        {/* PAYMENTS */}

        {activeTab === "payments" && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <div className="mb-5">
              <h2 className="font-semibold">
                Payment History
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Payments recorded against this
                customer
              </p>
            </div>

            {payments.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Payments made against this customer's invoices will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-600">
                      <th className="px-4 py-3 font-medium">
                        Date
                      </th>

                      <th className="px-4 py-3 font-medium">
                        Invoice
                      </th>

                      <th className="px-4 py-3 font-medium">
                        Method
                      </th>

                      <th className="px-4 py-3 font-medium">
                        Reference
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {payments.map(
                      (payment) => (
                        <tr
                          key={payment.id}
                          className="border-b border-white/[0.06] transition hover:bg-white/[0.025]"
                        >
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDate(
                              payment.payment_date
                            )}
                          </td>

                          <td className="px-4 py-4">
                            {payment.invoice_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    `/invoices/${payment.invoice_id}`
                                  )
                                }
                                className="text-sm font-medium text-blue-400 hover:text-blue-300"
                              >
                                {payment.invoice_number ||
                                  "View Invoice"}
                              </button>
                            ) : (
                              <span className="text-sm text-slate-500">
                                —
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-400">
                            {paymentMethodLabel(
                              payment.payment_method
                            )}
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-500">
                            {payment.reference ||
                              "—"}
                          </td>

                          <td className="px-4 py-4 text-right text-sm font-semibold text-emerald-400">
                            {formatMoney(
                              Number(
                                payment.amount ||
                                  0
                              )
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {/* EDIT MODAL */}

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0c1828] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0c1828] px-6 py-4">
              <div>
                <h2 className="font-semibold">
                  Edit Customer
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Update customer information
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(false)
                }
                className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-white"
              >
                <X size={19} />
              </button>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-2">
              <FormField
                label="Customer Name"
                required
                value={form.name}
                onChange={(value) =>
                  updateField(
                    "name",
                    value
                  )
                }
              />

              <FormField
                label="Company Name"
                value={
                  form.company_name
                }
                onChange={(value) =>
                  updateField(
                    "company_name",
                    value
                  )
                }
              />

              <FormField
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) =>
                  updateField(
                    "email",
                    value
                  )
                }
              />

              <FormField
                label="Phone"
                value={form.phone}
                onChange={(value) =>
                  updateField(
                    "phone",
                    value
                  )
                }
              />

              <FormField
                label="Tax Number"
                value={form.tax_number}
                onChange={(value) =>
                  updateField(
                    "tax_number",
                    value
                  )
                }
              />

              <FormField
                label="Status"
                select
                value={form.status}
                onChange={(value) =>
                  updateField(
                    "status",
                    value
                  )
                }
                options={[
                  {
                    value: "active",
                    label: "Active",
                  },
                  {
                    value: "inactive",
                    label: "Inactive",
                  },
                ]}
              />

              <FormField
                label="Address"
                value={form.address}
                onChange={(value) =>
                  updateField(
                    "address",
                    value
                  )
                }
              />

              <FormField
                label="City"
                value={form.city}
                onChange={(value) =>
                  updateField(
                    "city",
                    value
                  )
                }
              />

              <FormField
                label="Country"
                value={form.country}
                onChange={(value) =>
                  updateField(
                    "country",
                    value
                  )
                }
              />

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Notes
                </label>

                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    updateField(
                      "notes",
                      event.target.value
                    )
                  }
                  rows={5}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:bg-white/[0.05]"
                  placeholder="Add notes about this customer..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() =>
                  setEditing(false)
                }
                disabled={saving}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveCustomer}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass = "text-blue-400",
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  iconClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
          <Icon
            size={19}
            className={iconClass}
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold">
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon
        size={16}
        className="mt-0.5 flex-shrink-0 text-slate-600"
      />

      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-600">
          {label}
        </p>

        <p className="mt-0.5 break-words text-sm text-slate-300">
          {value}
        </p>
      </div>
    </div>
  );
}

function InvoiceTable({
  invoices,
  onInvoiceClick,
}: {
  invoices: CustomerInvoice[];
  onInvoiceClick: (id: string) => void;
}) {
  return (
    <table className="w-full min-w-[800px]">
      <thead>
        <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-600">
          <th className="px-4 py-3 font-medium">
            Invoice
          </th>

          <th className="px-4 py-3 font-medium">
            Issue Date
          </th>

          <th className="px-4 py-3 font-medium">
            Due Date
          </th>

          <th className="px-4 py-3 font-medium">
            Status
          </th>

          <th className="px-4 py-3 text-right font-medium">
            Total
          </th>

          <th className="px-4 py-3 text-right font-medium">
            Balance
          </th>
        </tr>
      </thead>

      <tbody>
        {invoices.map((invoice) => (
          <tr
            key={invoice.id}
            onClick={() =>
              onInvoiceClick(
                invoice.id
              )
            }
            className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025]"
          >
            <td className="px-4 py-4">
              <span className="text-sm font-semibold text-blue-400">
                {invoice.invoice_number}
              </span>
            </td>

            <td className="px-4 py-4 text-sm text-slate-400">
              {formatDate(
                invoice.issue_date
              )}
            </td>

            <td className="px-4 py-4 text-sm text-slate-400">
              {formatDate(
                invoice.due_date
              )}
            </td>

            <td className="px-4 py-4">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${invoiceStatusClasses(
                  invoice.status
                )}`}
              >
                {invoice.status.replace(
                  /_/g,
                  " "
                )}
              </span>
            </td>

            <td className="px-4 py-4 text-right text-sm font-medium text-slate-200">
              {formatMoney(
                Number(invoice.total),
                invoice.currency
              )}
            </td>

            <td className="px-4 py-4 text-right text-sm font-semibold">
              <span
                className={
                  Number(
                    invoice.balance_due
                  ) > 0
                    ? "text-amber-400"
                    : "text-emerald-400"
                }
              >
                {formatMoney(
                  Number(
                    invoice.balance_due
                  ),
                  invoice.currency
                )}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
        <Icon
          size={21}
          className="text-slate-500"
        />
      </div>

      <h3 className="mt-4 text-sm font-semibold">
        {title}
      </h3>

      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  select = false,
  options = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  select?: boolean;
  options?: {
    value: string;
    label: string;
  }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">
        {label}

        {required && (
          <span className="ml-1 text-red-400">
            *
          </span>
        )}
      </label>

      {select ? (
        <select
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          className="w-full rounded-xl border border-white/10 bg-[#101d2d] px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:bg-white/[0.05]"
        />
      )}
    </div>
  );
}