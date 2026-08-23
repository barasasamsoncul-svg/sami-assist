"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  Users,
  Plus,
  Search,
  X,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Building2,
  User,
  RefreshCw,
  ArrowLeft,
  CalendarDays,
  FileText,
  CreditCard,
  Wallet,
} from "lucide-react";

type Customer = {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerForm = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
};

const emptyForm: CustomerForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
};

export default function Customers() {
  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [showForm, setShowForm] =
    useState(false);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [form, setForm] =
    useState<CustomerForm>(
      emptyForm
    );

  const [saving, setSaving] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  // ==========================================
  // SELECTED CUSTOMER
  // ==========================================

  const [
    selectedCustomer,
    setSelectedCustomer,
  ] = useState<Customer | null>(null);

  const [
    loadingCustomer,
    setLoadingCustomer,
  ] = useState(false);

  // ==========================================
  // LOAD CUSTOMERS
  // ==========================================

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);
      setError(null);

      const response =
        await fetch(
          "/api/customers",
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load customers"
        );
      }

      setCustomers(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (error) {
      console.error(
        "Load customers error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to load customers"
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // LOAD SINGLE CUSTOMER
  // ==========================================

  async function loadCustomerDetails(
    id: string
  ) {
    try {
      setLoadingCustomer(true);
      setError(null);

      const response =
        await fetch(
          `/api/customers/${id}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load customer details"
        );
      }

      setSelectedCustomer(data);
    } catch (error) {
      console.error(
        "Customer details error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to load customer details"
      );
    } finally {
      setLoadingCustomer(false);
    }
  }

  // ==========================================
  // OPEN CUSTOMER DETAILS
  // ==========================================

  function openCustomer(
    customer: Customer
  ) {
    setSelectedCustomer(customer);

    // Fetch the latest version
    // from the database.
    loadCustomerDetails(
      customer.id
    );
  }

  // ==========================================
  // CLOSE CUSTOMER DETAILS
  // ==========================================

  function closeCustomerDetails() {
    setSelectedCustomer(null);
    setError(null);
  }

  // ==========================================
  // REFRESH CUSTOMERS
  // ==========================================

  async function refreshCustomers() {
    try {
      setRefreshing(true);
      setError(null);

      await loadCustomers();

      // Refresh selected customer
      // if one is currently open.
      if (selectedCustomer) {
        await loadCustomerDetails(
          selectedCustomer.id
        );
      }
    } finally {
      setRefreshing(false);
    }
  }

  // ==========================================
  // FORM HANDLING
  // ==========================================

  function handleInputChange(
    field: keyof CustomerForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function openForm() {
    setForm(emptyForm);
    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setForm(emptyForm);
  }

  // ==========================================
  // CREATE CUSTOMER
  // ==========================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !form.company_name.trim()
    ) {
      setError(
        "Company name is required."
      );

      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response =
        await fetch(
          "/api/customers",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              company_name:
                form.company_name.trim(),

              contact_name:
                form.contact_name.trim(),

              email:
                form.email.trim(),

              phone:
                form.phone.trim(),

              address:
                form.address.trim(),
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to create customer"
        );
      }

      setCustomers(
        (previous) => [
          data,
          ...previous,
        ]
      );

      setForm(emptyForm);

      setShowForm(false);

      setSuccess(
        "Customer added successfully."
      );

      setTimeout(() => {
        setSuccess(null);
      }, 4000);
    } catch (error) {
      console.error(
        "Create customer error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to create customer"
      );
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // DELETE CUSTOMER
  // ==========================================

  async function deleteCustomer(
    id: string
  ) {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this customer?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(id);
      setError(null);

      const response =
        await fetch(
          `/api/customers/${id}`,
          {
            method: "DELETE",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to delete customer"
        );
      }

      setCustomers(
        (previous) =>
          previous.filter(
            (customer) =>
              customer.id !== id
          )
      );

      // Close details if the
      // deleted customer was open.
      if (
        selectedCustomer?.id === id
      ) {
        setSelectedCustomer(null);
      }

      setSuccess(
        "Customer deleted successfully."
      );

      setTimeout(() => {
        setSuccess(null);
      }, 4000);
    } catch (error) {
      console.error(
        "Delete customer error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete customer"
      );
    } finally {
      setDeletingId(null);
    }
  }

  // ==========================================
  // SEARCH CUSTOMERS
  // ==========================================

  const filteredCustomers =
    customers.filter(
      (customer) => {
        const search =
          searchTerm
            .toLowerCase()
            .trim();

        if (!search) {
          return true;
        }

        return (
          customer.company_name
            ?.toLowerCase()
            .includes(search) ||
          customer.contact_name
            ?.toLowerCase()
            .includes(search) ||
          customer.email
            ?.toLowerCase()
            .includes(search) ||
          customer.phone
            ?.toLowerCase()
            .includes(search)
        );
      }
    );

  // ==========================================
  // CUSTOMER DETAILS VIEW
  // ==========================================

  if (selectedCustomer) {
    return (
      <div className="mt-8">

        {/* HEADER */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <button
            onClick={
              closeCustomerDetails
            }
            className="flex w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <ArrowLeft size={18} />

            Back to Customers
          </button>

          <button
            onClick={() =>
              deleteCustomer(
                selectedCustomer.id
              )
            }
            disabled={
              deletingId ===
              selectedCustomer.id
            }
            className="flex w-fit items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingId ===
            selectedCustomer.id ? (
              <RefreshCw
                size={18}
                className="animate-spin"
              />
            ) : (
              <Trash2 size={18} />
            )}

            Delete Customer
          </button>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* CUSTOMER PROFILE */}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">

          {/* MAIN PROFILE */}

          <div className="lg:col-span-2">

            <div className="rounded-2xl bg-white p-8 shadow-sm">

              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">

                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-blue-100">

                  <Building2
                    size={36}
                    className="text-blue-600"
                  />

                </div>

                <div>

                  <p className="text-sm font-medium text-blue-600">
                    Customer Profile
                  </p>

                  <h1 className="mt-1 text-3xl font-bold text-gray-900">
                    {
                      selectedCustomer.company_name
                    }
                  </h1>

                  {selectedCustomer.contact_name && (
                    <p className="mt-2 flex items-center gap-2 text-gray-500">

                      <User size={16} />

                      {
                        selectedCustomer.contact_name
                      }

                    </p>
                  )}

                </div>

              </div>

              {/* CONTACT INFORMATION */}

              <div className="mt-8 border-t border-gray-100 pt-8">

                <h2 className="text-lg font-bold text-gray-900">
                  Contact Information
                </h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">

                  {/* EMAIL */}

                  <div className="rounded-xl bg-gray-50 p-5">

                    <div className="flex items-center gap-3">

                      <div className="rounded-lg bg-blue-100 p-2">

                        <Mail
                          size={18}
                          className="text-blue-600"
                        />

                      </div>

                      <div>

                        <p className="text-xs text-gray-500">
                          Email
                        </p>

                        {selectedCustomer.email ? (
                          <a
                            href={`mailto:${selectedCustomer.email}`}
                            className="mt-1 block break-all text-sm font-medium text-gray-900 hover:text-blue-600"
                          >
                            {
                              selectedCustomer.email
                            }
                          </a>
                        ) : (
                          <p className="mt-1 text-sm text-gray-400">
                            Not provided
                          </p>
                        )}

                      </div>

                    </div>

                  </div>

                  {/* PHONE */}

                  <div className="rounded-xl bg-gray-50 p-5">

                    <div className="flex items-center gap-3">

                      <div className="rounded-lg bg-green-100 p-2">

                        <Phone
                          size={18}
                          className="text-green-600"
                        />

                      </div>

                      <div>

                        <p className="text-xs text-gray-500">
                          Phone
                        </p>

                        {selectedCustomer.phone ? (
                          <a
                            href={`tel:${selectedCustomer.phone}`}
                            className="mt-1 block text-sm font-medium text-gray-900 hover:text-blue-600"
                          >
                            {
                              selectedCustomer.phone
                            }
                          </a>
                        ) : (
                          <p className="mt-1 text-sm text-gray-400">
                            Not provided
                          </p>
                        )}

                      </div>

                    </div>

                  </div>

                  {/* ADDRESS */}

                  <div className="rounded-xl bg-gray-50 p-5 md:col-span-2">

                    <div className="flex items-start gap-3">

                      <div className="rounded-lg bg-purple-100 p-2">

                        <MapPin
                          size={18}
                          className="text-purple-600"
                        />

                      </div>

                      <div>

                        <p className="text-xs text-gray-500">
                          Address
                        </p>

                        <p className="mt-1 text-sm font-medium text-gray-900">
                          {
                            selectedCustomer.address ||
                            "Not provided"
                          }
                        </p>

                      </div>

                    </div>

                  </div>

                </div>

              </div>

              {/* ACCOUNT INFORMATION */}

              <div className="mt-8 border-t border-gray-100 pt-8">

                <h2 className="text-lg font-bold text-gray-900">
                  Account Information
                </h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">

                  <div className="flex items-center gap-3">

                    <CalendarDays
                      size={18}
                      className="text-gray-400"
                    />

                    <div>

                      <p className="text-xs text-gray-500">
                        Customer since
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-900">

                        {new Date(
                          selectedCustomer.created_at
                        ).toLocaleDateString(
                          "en-KE",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }
                        )}

                      </p>

                    </div>

                  </div>

                  <div className="flex items-center gap-3">

                    <RefreshCw
                      size={18}
                      className="text-gray-400"
                    />

                    <div>

                      <p className="text-xs text-gray-500">
                        Last updated
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-900">

                        {new Date(
                          selectedCustomer.updated_at
                        ).toLocaleDateString(
                          "en-KE",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }
                        )}

                      </p>

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

          {/* BUSINESS SUMMARY */}

          <div className="space-y-6">

            {/* INVOICES */}

            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div className="rounded-xl bg-purple-100 p-3">

                  <FileText
                    size={22}
                    className="text-purple-600"
                  />

                </div>

                <span className="text-xs font-medium text-gray-400">
                  Coming soon
                </span>

              </div>

              <p className="mt-5 text-sm text-gray-500">
                Total Invoices
              </p>

              <h3 className="mt-1 text-3xl font-bold text-gray-900">
                0
              </h3>

              <p className="mt-2 text-xs text-gray-400">
                No invoices yet
              </p>

            </div>

            {/* PAYMENTS */}

            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div className="rounded-xl bg-green-100 p-3">

                  <CreditCard
                    size={22}
                    className="text-green-600"
                  />

                </div>

                <span className="text-xs font-medium text-gray-400">
                  Coming soon
                </span>

              </div>

              <p className="mt-5 text-sm text-gray-500">
                Total Paid
              </p>

              <h3 className="mt-1 text-3xl font-bold text-gray-900">
                KSh 0
              </h3>

              <p className="mt-2 text-xs text-gray-400">
                No payments yet
              </p>

            </div>

            {/* BALANCE */}

            <div className="rounded-2xl bg-white p-6 shadow-sm">

              <div className="flex items-center justify-between">

                <div className="rounded-xl bg-orange-100 p-3">

                  <Wallet
                    size={22}
                    className="text-orange-600"
                  />

                </div>

                <span className="text-xs font-medium text-gray-400">
                  Coming soon
                </span>

              </div>

              <p className="mt-5 text-sm text-gray-500">
                Outstanding Balance
              </p>

              <h3 className="mt-1 text-3xl font-bold text-gray-900">
                KSh 0
              </h3>

              <p className="mt-2 text-xs text-gray-400">
                No outstanding balance
              </p>

            </div>

          </div>

        </div>

        {/* LOADING OVERLAY */}

        {loadingCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">

            <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-4 shadow-xl">

              <RefreshCw
                size={20}
                className="animate-spin text-blue-600"
              />

              <span className="text-sm font-medium text-gray-700">
                Loading customer...
              </span>

            </div>

          </div>
        )}

      </div>
    );
  }

  // ==========================================
  // CUSTOMERS LIST VIEW
  // ==========================================

  return (
    <div className="mt-8">

      {/* ======================================
          PAGE HEADER
      ====================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-blue-100 p-3">

              <Users
                size={24}
                className="text-blue-600"
              />

            </div>

            <div>

              <h1 className="text-3xl font-bold text-gray-900">
                Customers
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Manage your business customers
                and their contact information.
              </p>

            </div>

          </div>

        </div>

        <div className="flex gap-3">

          <button
            onClick={
              refreshCustomers
            }
            disabled={refreshing}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >

            <RefreshCw
              size={18}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh

          </button>

          <button
            onClick={openForm}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >

            <Plus size={18} />

            Add Customer

          </button>

        </div>

      </div>

      {/* ======================================
          ALERTS
      ====================================== */}

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">

          <span>
            {error}
          </span>

          <button
            onClick={() =>
              setError(null)
            }
            className="rounded-lg p-1 hover:bg-red-100"
          >

            <X size={16} />

          </button>

        </div>
      )}

      {success && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">

          {success}

        </div>
      )}

      {/* ======================================
          SEARCH
      ====================================== */}

      <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">

        <div className="relative">

          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search customers by company, contact, email or phone..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />

        </div>

      </div>

      {/* ======================================
          CUSTOMER COUNT
      ====================================== */}

      <div className="mt-6 flex items-center justify-between">

        <p className="text-sm text-gray-500">

          Showing{" "}

          <span className="font-semibold text-gray-900">
            {filteredCustomers.length}
          </span>{" "}

          of{" "}

          <span className="font-semibold text-gray-900">
            {customers.length}
          </span>{" "}

          customers

        </p>

      </div>

      {/* ======================================
          LOADING
      ====================================== */}

      {loading ? (
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">

          {Array.from({
            length: 6,
          }).map(
            (_, index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl bg-white shadow-sm"
              />
            )
          )}

        </div>
      ) : filteredCustomers.length ===
        0 ? (
        <div className="mt-6 rounded-2xl bg-white p-12 text-center shadow-sm">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">

            <Users
              size={28}
              className="text-gray-400"
            />

          </div>

          <h2 className="mt-5 text-xl font-bold text-gray-900">

            {customers.length ===
            0
              ? "No customers yet"
              : "No customers found"}

          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">

            {customers.length ===
            0
              ? "Add your first customer to start building your business customer database."
              : "Try adjusting your search to find the customer you're looking for."}

          </p>

          {customers.length ===
            0 && (
            <button
              onClick={openForm}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
            >

              <Plus size={18} />

              Add Customer

            </button>
          )}

        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">

          {filteredCustomers.map(
            (customer) => (
              <div
                key={customer.id}
                onClick={() =>
                  openCustomer(
                    customer
                  )
                }
                className="group cursor-pointer rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >

                {/* CUSTOMER HEADER */}

                <div className="flex items-start justify-between gap-4">

                  <div className="flex min-w-0 items-center gap-3">

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100">

                      <Building2
                        size={22}
                        className="text-blue-600"
                      />

                    </div>

                    <div className="min-w-0">

                      <h3 className="truncate font-bold text-gray-900">

                        {
                          customer.company_name
                        }

                      </h3>

                      {customer.contact_name && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">

                          <User size={14} />

                          {
                            customer.contact_name
                          }

                        </p>
                      )}

                    </div>

                  </div>

                  <button
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      deleteCustomer(
                        customer.id
                      );
                    }}
                    disabled={
                      deletingId ===
                      customer.id
                    }
                    className="rounded-lg p-2 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete customer"
                  >

                    {deletingId ===
                    customer.id ? (
                      <RefreshCw
                        size={18}
                        className="animate-spin"
                      />
                    ) : (
                      <Trash2
                        size={18}
                      />
                    )}

                  </button>

                </div>

                {/* CUSTOMER DETAILS */}

                <div className="mt-6 space-y-3">

                  {customer.email && (
                    <div className="flex items-center gap-3 text-sm text-gray-600">

                      <Mail
                        size={16}
                        className="shrink-0 text-gray-400"
                      />

                      <span className="truncate">
                        {
                          customer.email
                        }
                      </span>

                    </div>
                  )}

                  {customer.phone && (
                    <div className="flex items-center gap-3 text-sm text-gray-600">

                      <Phone
                        size={16}
                        className="shrink-0 text-gray-400"
                      />

                      <span>
                        {
                          customer.phone
                        }
                      </span>

                    </div>
                  )}

                  {customer.address && (
                    <div className="flex items-start gap-3 text-sm text-gray-600">

                      <MapPin
                        size={16}
                        className="mt-0.5 shrink-0 text-gray-400"
                      />

                      <span className="line-clamp-2">
                        {
                          customer.address
                        }
                      </span>

                    </div>
                  )}

                </div>

                {/* CUSTOMER FOOTER */}

                <div className="mt-6 border-t border-gray-100 pt-4">

                  <p className="text-xs text-gray-400">
                    Added{" "}

                    {new Date(
                      customer.created_at
                    ).toLocaleDateString(
                      "en-KE"
                    )}

                  </p>

                  <p className="mt-2 text-xs font-medium text-blue-600">
                    Click to view customer details →
                  </p>

                </div>

              </div>
            )
          )}

        </div>
      )}

      {/* ======================================
          ADD CUSTOMER MODAL
      ====================================== */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            {/* MODAL HEADER */}

            <div className="flex items-center justify-between border-b border-gray-100 p-6">

              <div>

                <h2 className="text-xl font-bold text-gray-900">
                  Add Customer
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Add a new customer to your business workspace.
                </p>

              </div>

              <button
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >

                <X size={20} />

              </button>

            </div>

            {/* FORM */}

            <form
              onSubmit={handleSubmit}
              className="p-6"
            >

              <div className="grid gap-5 md:grid-cols-2">

                {/* COMPANY */}

                <div className="md:col-span-2">

                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Company Name *
                  </label>

                  <input
                    type="text"
                    value={
                      form.company_name
                    }
                    onChange={(
                      event
                    ) =>
                      handleInputChange(
                        "company_name",
                        event.target
                          .value
                      )
                    }
                    placeholder="e.g. Acme Limited"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    required
                  />

                </div>

                {/* CONTACT */}

                <div>

                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Contact Person
                  </label>

                  <input
                    type="text"
                    value={
                      form.contact_name
                    }
                    onChange={(
                      event
                    ) =>
                      handleInputChange(
                        "contact_name",
                        event.target
                          .value
                      )
                    }
                    placeholder="e.g. John Doe"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                </div>

                {/* EMAIL */}

                <div>

                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Email
                  </label>

                  <input
                    type="email"
                    value={
                      form.email
                    }
                    onChange={(
                      event
                    ) =>
                      handleInputChange(
                        "email",
                        event.target
                          .value
                      )
                    }
                    placeholder="customer@example.com"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                </div>

                {/* PHONE */}

                <div>

                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Phone
                  </label>

                  <input
                    type="tel"
                    value={
                      form.phone
                    }
                    onChange={(
                      event
                    ) =>
                      handleInputChange(
                        "phone",
                        event.target
                          .value
                      )
                    }
                    placeholder="e.g. 0712 345 678"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                </div>

                {/* ADDRESS */}

                <div>

                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Address
                  </label>

                  <input
                    type="text"
                    value={
                      form.address
                    }
                    onChange={(
                      event
                    ) =>
                      handleInputChange(
                        "address",
                        event.target
                          .value
                      )
                    }
                    placeholder="e.g. Nairobi, Kenya"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                </div>

              </div>

              {/* FORM ACTIONS */}

              <div className="mt-8 flex justify-end gap-3">

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >

                  {saving && (
                    <RefreshCw
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Saving..."
                    : "Add Customer"}

                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </div>
  );
}