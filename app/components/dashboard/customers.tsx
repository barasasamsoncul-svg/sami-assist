"use client";

import { FormEvent, useEffect, useState } from "react";
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
  const [customers, setCustomers] = useState<
    Customer[]
  >([]);

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
  // REFRESH CUSTOMERS
  // ==========================================

  async function refreshCustomers() {
    try {
      setRefreshing(true);
      setError(null);

      await loadCustomers();
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

      // Add the newly created customer
      // to the top of the current list.
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

      // Remove success message
      // after a few seconds.
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
  // RENDER
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
            ❌ {error}
          </span>

          <button
            onClick={() =>
              setError(null)
            }
            className="font-bold"
          >
            ×
          </button>

        </div>
      )}

      {success && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">

          ✅ {success}

        </div>
      )}

      {/* ======================================
          SUMMARY
      ====================================== */}

      <div className="mt-8 grid gap-6 md:grid-cols-2">

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          <p className="text-sm text-gray-500">
            Total Customers
          </p>

          <p className="mt-2 text-3xl font-bold text-gray-900">
            {customers.length}
          </p>

        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          <p className="text-sm text-gray-500">
            Search Results
          </p>

          <p className="mt-2 text-3xl font-bold text-gray-900">
            {filteredCustomers.length}
          </p>

        </div>

      </div>

      {/* ======================================
          SEARCH
      ====================================== */}

      <div className="mt-8 rounded-2xl bg-white p-4 shadow-sm">

        <div className="relative">

          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            placeholder="Search by company, contact, email or phone..."
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />

        </div>

      </div>

      {/* ======================================
          CUSTOMER LIST
      ====================================== */}

      <div className="mt-6">

        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">

            <RefreshCw
              size={28}
              className="mx-auto animate-spin text-blue-600"
            />

            <p className="mt-4 text-sm text-gray-500">
              Loading customers...
            </p>

          </div>
        ) : filteredCustomers.length ===
          0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">

              <Users
                size={28}
                className="text-gray-400"
              />

            </div>

            <h2 className="mt-5 text-lg font-bold text-gray-900">

              {searchTerm
                ? "No customers found"
                : "No customers yet"}

            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">

              {searchTerm
                ? "Try a different search term."
                : "Add your first customer to start managing your business relationships."}

            </p>

            {!searchTerm && (
              <button
                onClick={openForm}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
              >

                <Plus size={18} />

                Add Your First Customer

              </button>
            )}

          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">

            {filteredCustomers.map(
              (customer) => (
                <div
                  key={customer.id}
                  className="group rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
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

                          {customer.company_name}

                        </h3>

                        {customer.contact_name && (
                          <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">

                            <User size={14} />

                            {customer.contact_name}

                          </p>
                        )}

                      </div>

                    </div>

                    <button
                      onClick={() =>
                        deleteCustomer(
                          customer.id
                        )
                      }
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

                        <a
                          href={`mailto:${customer.email}`}
                          className="truncate hover:text-blue-600"
                        >
                          {customer.email}
                        </a>

                      </div>
                    )}

                    {customer.phone && (
                      <div className="flex items-center gap-3 text-sm text-gray-600">

                        <Phone
                          size={16}
                          className="shrink-0 text-gray-400"
                        />

                        <a
                          href={`tel:${customer.phone}`}
                          className="truncate hover:text-blue-600"
                        >
                          {customer.phone}
                        </a>

                      </div>
                    )}

                    {customer.address && (
                      <div className="flex items-start gap-3 text-sm text-gray-600">

                        <MapPin
                          size={16}
                          className="mt-0.5 shrink-0 text-gray-400"
                        />

                        <span>
                          {customer.address}
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
                        "en-KE",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )}

                    </p>

                  </div>

                </div>
              )
            )}

          </div>
        )}

      </div>

      {/* ======================================
          ADD CUSTOMER MODAL
      ====================================== */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            {/* MODAL HEADER */}

            <div className="flex items-center justify-between border-b border-gray-100 p-6">

              <div>

                <h2 className="text-xl font-bold text-gray-900">
                  Add Customer
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Add a new customer to your business.
                </p>

              </div>

              <button
                onClick={closeForm}
                disabled={saving}
                className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed"
              >

                <X size={22} />

              </button>

            </div>

            {/* FORM */}

            <form
              onSubmit={handleSubmit}
              className="p-6"
            >

              <div className="grid gap-5 md:grid-cols-2">

                {/* COMPANY NAME */}

                <div className="md:col-span-2">

                  <label className="mb-2 block text-sm font-medium text-gray-700">

                    Company Name
                    <span className="text-red-500">
                      {" "}*
                    </span>

                  </label>

                  <input
                    type="text"
                    required
                    value={
                      form.company_name
                    }
                    onChange={(event) =>
                      handleInputChange(
                        "company_name",
                        event.target.value
                      )
                    }
                    placeholder="e.g. ABC Solutions Ltd"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />

                </div>

                {/* CONTACT NAME */}

                <div>

                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Contact Person
                  </label>

                  <input
                    type="text"
                    value={
                      form.contact_name
                    }
                    onChange={(event) =>
                      handleInputChange(
                        "contact_name",
                        event.target.value
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
                    onChange={(event) =>
                      handleInputChange(
                        "email",
                        event.target.value
                      )
                    }
                    placeholder="e.g. john@company.com"
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
                    onChange={(event) =>
                      handleInputChange(
                        "phone",
                        event.target.value
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
                    onChange={(event) =>
                      handleInputChange(
                        "address",
                        event.target.value
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
                  className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >

                  {saving && (
                    <RefreshCw
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Saving..."
                    : "Save Customer"}

                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </div>
  );
}