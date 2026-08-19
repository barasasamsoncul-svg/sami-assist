"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Edit3,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

type Customer = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CustomerForm = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  status: string;
};

const EMPTY_FORM: CustomerForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  status: "active",
};

function getInitials(customer: Customer) {
  const name =
    customer.company_name?.trim() ||
    customer.contact_name?.trim() ||
    "Customer";

  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
  }).format(date);
}

function normalizeCustomers(data: unknown): Customer[] {
  if (Array.isArray(data)) {
    return data as Customer[];
  }

  if (
    data &&
    typeof data === "object" &&
    "customers" in data &&
    Array.isArray((data as { customers?: unknown }).customers)
  ) {
    return (data as { customers: Customer[] }).customers;
  }

  return [];
}

export default function CustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null);

  const [form, setForm] =
    useState<CustomerForm>(EMPTY_FORM);

  const [openMenuId, setOpenMenuId] =
    useState<string | null>(null);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/customers", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Failed to load customers."
        );
      }

      setCustomers(normalizeCustomers(data));
    } catch (err) {
      console.error("Load customers error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load customers."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const refreshCustomers = async () => {
    try {
      setRefreshing(true);
      setError("");
      await loadCustomers();
    } finally {
      setRefreshing(false);
    }
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setSuccess("");
    setOpenMenuId(null);
    setShowForm(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);

    setForm({
      company_name: customer.company_name || "",
      contact_name: customer.contact_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      status: customer.status || "active",
    });

    setError("");
    setSuccess("");
    setOpenMenuId(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingCustomer(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleChange = (
    field: keyof CustomerForm,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!form.company_name.trim()) {
      setError("Company name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const isEditing = Boolean(editingCustomer);

      const response = await fetch(
        isEditing
          ? `/api/customers/${editingCustomer!.id}`
          : "/api/customers",
        {
          method: isEditing ? "PATCH" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company_name: form.company_name.trim(),
            contact_name: form.contact_name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            status: form.status,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            (isEditing
              ? "Failed to update customer."
              : "Failed to create customer.")
        );
      }

      setShowForm(false);
      setEditingCustomer(null);
      setForm({ ...EMPTY_FORM });

      setSuccess(
        isEditing
          ? "Customer updated successfully."
          : "Customer added successfully."
      );

      await loadCustomers();

      window.setTimeout(() => {
        setSuccess("");
      }, 4000);
    } catch (err) {
      console.error("Save customer error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to save customer."
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (customer: Customer) => {
    setOpenMenuId(null);

    const confirmed = window.confirm(
      `Delete "${customer.company_name}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(customer.id);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/customers/${customer.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Failed to delete customer."
        );
      }

      setCustomers((current) =>
        current.filter(
          (item) => item.id !== customer.id
        )
      );

      setSuccess("Customer deleted successfully.");

      window.setTimeout(() => {
        setSuccess("");
      }, 4000);
    } catch (err) {
      console.error("Delete customer error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete customer."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch =
        !query ||
        [
          customer.company_name,
          customer.contact_name,
          customer.email,
          customer.phone,
          customer.address,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query)
        );

      const normalizedStatus =
        customer.status || "active";

      const matchesStatus =
        statusFilter === "all" ||
        normalizedStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const activeCount = useMemo(
    () =>
      customers.filter(
        (customer) =>
          (customer.status || "active") === "active"
      ).length,
    [customers]
  );

  const inactiveCount = customers.length - activeCount;

  return (
    <div className="min-h-full bg-[#f8fafc] text-slate-900">
      {/* HEADER */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <button
                  type="button"
                  onClick={() =>
                    router.push("/invoices")
                  }
                  className="transition hover:text-blue-600"
                >
                  Invoices
                </button>

                <ChevronRight size={15} />

                <span className="text-slate-700">
                  Customers
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Users size={22} />
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Customers
                  </h1>

                  <p className="mt-0.5 text-sm text-slate-500">
                    Manage the customers you invoice.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <Plus size={18} />
              Add Customer
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] space-y-6 px-5 py-6 sm:px-8">
        {/* MESSAGES */}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle
              size={19}
              className="mt-0.5 shrink-0"
            />

            <div className="flex-1">
              {error}
            </div>

            <button
              type="button"
              onClick={() => setError("")}
              className="rounded-lg p-1 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <CheckCircle2 size={19} />

            <span>{success}</span>
          </div>
        )}

        {/* SUMMARY */}

        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Total Customers"
            value={customers.length}
            icon={Users}
          />

          <SummaryCard
            label="Active"
            value={activeCount}
            icon={CheckCircle2}
          />

          <SummaryCard
            label="Inactive"
            value={inactiveCount}
            icon={AlertCircle}
          />
        </div>

        {/* TOOLBAR */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search customers..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="all">
                  All statuses
                </option>
                <option value="active">
                  Active
                </option>
                <option value="inactive">
                  Inactive
                </option>
              </select>

              <button
                type="button"
                onClick={() => void refreshCustomers()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />

                <span className="hidden sm:inline">
                  Refresh
                </span>
              </button>
            </div>
          </div>

          {/* TABLE */}

          {loading ? (
            <CustomerTableSkeleton />
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              hasFilters={
                Boolean(search.trim()) ||
                statusFilter !== "all"
              }
              onAdd={openCreate}
              onClear={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Customer
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Contact
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Phone
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Added
                    </th>

                    <th className="w-16 px-5 py-3" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map(
                    (customer) => {
                      const status =
                        customer.status ||
                        "active";

                      return (
                        <tr
                          key={customer.id}
                          className="group transition hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/invoices/customers/${customer.id}`
                                )
                              }
                              className="flex items-center gap-3 text-left"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-600">
                                {getInitials(
                                  customer
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600">
                                  {customer.company_name ||
                                    "Unnamed Customer"}
                                </p>

                                {customer.contact_name && (
                                  <p className="mt-0.5 truncate text-xs text-slate-500">
                                    {
                                      customer.contact_name
                                    }
                                  </p>
                                )}
                              </div>
                            </button>
                          </td>

                          <td className="px-5 py-4">
                            {customer.email ? (
                              <a
                                href={`mailto:${customer.email}`}
                                className="inline-flex max-w-[250px] items-center gap-2 truncate text-sm text-slate-600 hover:text-blue-600"
                              >
                                <Mail
                                  size={15}
                                  className="shrink-0 text-slate-400"
                                />

                                <span className="truncate">
                                  {customer.email}
                                </span>
                              </a>
                            ) : (
                              <span className="text-sm text-slate-400">
                                —
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {customer.phone ? (
                              <a
                                href={`tel:${customer.phone}`}
                                className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"
                              >
                                <Phone
                                  size={15}
                                  className="text-slate-400"
                                />

                                {
                                  customer.phone
                                }
                              </a>
                            ) : (
                              <span className="text-sm text-slate-400">
                                —
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <StatusBadge
                              status={status}
                            />
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-500">
                            {formatDate(
                              customer.created_at
                            )}
                          </td>

                          <td className="relative px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId(
                                  openMenuId ===
                                    customer.id
                                    ? null
                                    : customer.id
                                )
                              }
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Customer actions"
                            >
                              <MoreHorizontal
                                size={18}
                              />
                            </button>

                            {openMenuId ===
                              customer.id && (
                              <div className="absolute right-5 top-12 z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-xl">
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/invoices/customers/${customer.id}`
                                    )
                                  }
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <UserRound
                                    size={16}
                                  />
                                  View customer
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEdit(
                                      customer
                                    )
                                  }
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Edit3
                                    size={16}
                                  />
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    deletingId ===
                                    customer.id
                                  }
                                  onClick={() =>
                                    void deleteCustomer(
                                      customer
                                    )
                                  }
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2
                                    size={16}
                                  />

                                  {deletingId ===
                                  customer.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading &&
            filteredCustomers.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50/50 px-5 py-3 text-xs text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {filteredCustomers.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-700">
                  {customers.length}
                </span>{" "}
                customers
              </div>
            )}
        </section>
      </main>

      {/* CREATE / EDIT MODAL */}

      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingCustomer
                    ? "Edit Customer"
                    : "Add Customer"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {editingCustomer
                    ? "Update this customer's information."
                    : "Add a customer to use on your invoices."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-5 p-6">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle
                      size={17}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    label="Company name"
                    required
                    icon={Building2}
                  >
                    <input
                      value={form.company_name}
                      onChange={(event) =>
                        handleChange(
                          "company_name",
                          event.target.value
                        )
                      }
                      placeholder="e.g. Acme Ltd"
                      autoFocus
                      className={INPUT_CLASS}
                    />
                  </FormField>

                  <FormField
                    label="Contact person"
                    icon={UserRound}
                  >
                    <input
                      value={form.contact_name}
                      onChange={(event) =>
                        handleChange(
                          "contact_name",
                          event.target.value
                        )
                      }
                      placeholder="e.g. John Doe"
                      className={INPUT_CLASS}
                    />
                  </FormField>

                  <FormField
                    label="Email"
                    icon={Mail}
                  >
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        handleChange(
                          "email",
                          event.target.value
                        )
                      }
                      placeholder="customer@example.com"
                      className={INPUT_CLASS}
                    />
                  </FormField>

                  <FormField
                    label="Phone"
                    icon={Phone}
                  >
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) =>
                        handleChange(
                          "phone",
                          event.target.value
                        )
                      }
                      placeholder="+254 7XX XXX XXX"
                      className={INPUT_CLASS}
                    />
                  </FormField>

                  <FormField
                    label="Address"
                    icon={MapPin}
                    className="sm:col-span-2"
                  >
                    <textarea
                      value={form.address}
                      onChange={(event) =>
                        handleChange(
                          "address",
                          event.target.value
                        )
                      }
                      placeholder="Customer address"
                      rows={3}
                      className={`${INPUT_CLASS} resize-none`}
                    />
                  </FormField>

                  <FormField
                    label="Status"
                    className="sm:col-span-2"
                  >
                    <select
                      value={form.status}
                      onChange={(event) =>
                        handleChange(
                          "status",
                          event.target.value
                        )
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="active">
                        Active
                      </option>
                      <option value="inactive">
                        Inactive
                      </option>
                    </select>
                  </FormField>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Saving..."
                    : editingCustomer
                      ? "Save Changes"
                      : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLICK-OUTSIDE MENU */}

      {openMenuId && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 cursor-default"
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const active = status === "active";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active
            ? "bg-emerald-500"
            : "bg-slate-400"
        }`}
      />

      {active ? "Active" : "Inactive"}
    </span>
  );
}

function FormField({
  label,
  required,
  icon: Icon,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  icon?: typeof Building2;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        {Icon && (
          <Icon
            size={15}
            className="text-slate-400"
          />
        )}

        {label}

        {required && (
          <span className="text-red-500">
            *
          </span>
        )}
      </span>

      {children}
    </label>
  );
}

function CustomerTableSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-slate-100">
      {[1, 2, 3, 4, 5].map((row) => (
        <div
          key={row}
          className="flex items-center gap-6 px-5 py-5"
        >
          <div className="h-10 w-10 rounded-xl bg-slate-200" />

          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="h-3 w-28 rounded bg-slate-100" />
          </div>

          <div className="hidden h-4 w-44 rounded bg-slate-100 md:block" />
          <div className="hidden h-4 w-32 rounded bg-slate-100 lg:block" />
          <div className="h-6 w-16 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasFilters,
  onAdd,
  onClear,
}: {
  hasFilters: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        {hasFilters ? (
          <Search size={28} />
        ) : (
          <Users size={28} />
        )}
      </div>

      <h3 className="mt-5 text-lg font-semibold text-slate-900">
        {hasFilters
          ? "No customers found"
          : "No customers yet"}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasFilters
          ? "Try changing your search or status filter."
          : "Add your first customer so you can start creating invoices."}
      </p>

      <div className="mt-5 flex items-center gap-3">
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}

        {!hasFilters && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={17} />
            Add Customer
          </button>
        )}
      </div>
    </div>
  );
}