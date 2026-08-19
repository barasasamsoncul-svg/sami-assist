"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  customer_number?: string | null;
  customer_type?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_number?: string | null;
  notes?: string | null;
};

type Product = {
  id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  selling_price?: number | string | null;
  tax_rate?: number | string | null;
  is_active?: boolean;
  type?: string | null;
};

type PaymentTerm = {
  id: string;
  name: string;
  days?: number | null;
  due_days?: number | null;
  description?: string | null;
  is_default?: boolean;
};

type DraftItem = {
  id: string;
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  discount: string;
};

type InvoiceSettings = {
  currency?: string | null;
  default_tax_rate?: number | string | null;
  default_payment_terms_id?: string | null;
  invoice_prefix?: string | null;
  invoice_notes?: string | null;
  default_notes?: string | null;
};

type Business = {
  id?: string;
  name?: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
};

type ApiResponse<T = unknown> = {
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
} & T;

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-600";

const selectClass = inputClass;

function money(value: number, currency = "KES") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createItem(): DraftItem {
  return {
    id: crypto.randomUUID(),
    product_id: "",
    description: "",
    quantity: "1",
    unit_price: "0",
    tax_rate: "0",
    discount: "0",
  };
}

function Field({
  label,
  children,
  required = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {hint && (
        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`${selectClass} appearance-none pr-10 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {children}
        </select>

        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
      </div>
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className={`${inputClass} resize-y`}
      />
    </Field>
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
      className={`flex items-center justify-between gap-4 ${
        strong
          ? "text-base font-bold text-gray-900 dark:text-white"
          : "text-sm text-gray-600 dark:text-gray-400"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function NewInvoicePage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState("");

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");

  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  const [items, setItems] = useState<DraftItem[]>([createItem()]);

  const [discountType, setDiscountType] = useState<"amount" | "percentage">(
    "amount"
  );
  const [discountValue, setDiscountValue] = useState("0");

  const [taxInclusive, setTaxInclusive] = useState(false);

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  const [newCustomer, setNewCustomer] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    address_line1: "",
    city: "",
    country: "Kenya",
  });

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId]
  );

  const currency = settings?.currency || "KES";

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    if (!query) {
      return customers.slice(0, 10);
    }

    return customers
      .filter((customer) => {
        const values = [
          customer.company_name,
          customer.contact_name,
          customer.email,
          customer.phone,
          customer.customer_number,
        ];

        return values.some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query)
        );
      })
      .slice(0, 10);
  }, [customers, customerSearch]);

  const subtotal = useMemo(() => {
    return items.reduce((total, item) => {
      const quantity = numberValue(item.quantity);
      const unitPrice = numberValue(item.unit_price);
      const discount = numberValue(item.discount);

      const lineSubtotal = quantity * unitPrice;

      return total + Math.max(0, lineSubtotal - discount);
    }, 0);
  }, [items]);

  const itemTax = useMemo(() => {
    return items.reduce((total, item) => {
      const quantity = numberValue(item.quantity);
      const unitPrice = numberValue(item.unit_price);
      const discount = numberValue(item.discount);
      const taxRate = numberValue(item.tax_rate);

      const taxable = Math.max(
        0,
        quantity * unitPrice - discount
      );

      return total + taxable * (taxRate / 100);
    }, 0);
  }, [items]);

  const invoiceDiscount = useMemo(() => {
    const value = numberValue(discountValue);

    if (discountType === "percentage") {
      return subtotal * (value / 100);
    }

    return Math.min(value, subtotal);
  }, [discountType, discountValue, subtotal]);

  const taxableSubtotal = Math.max(
    0,
    subtotal - invoiceDiscount
  );

  const tax = useMemo(() => {
    if (taxInclusive) {
      return itemTax;
    }

    if (invoiceDiscount <= 0) {
      return itemTax;
    }

    if (subtotal <= 0) {
      return 0;
    }

    return itemTax * (taxableSubtotal / subtotal);
  }, [
    taxInclusive,
    itemTax,
    invoiceDiscount,
    subtotal,
    taxableSubtotal,
  ]);

  const total = useMemo(() => {
    if (taxInclusive) {
      return taxableSubtotal;
    }

    return taxableSubtotal + tax;
  }, [taxInclusive, taxableSubtotal, tax]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [
          customersResponse,
          productsResponse,
          paymentTermsResponse,
          settingsResponse,
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
          fetch("/api/invoice-settings", {
            credentials: "include",
          }),
        ]);

        const [
          customersData,
          productsData,
          paymentTermsData,
          settingsData,
        ] = await Promise.all([
          customersResponse.json(),
          productsResponse.json(),
          paymentTermsResponse.json(),
          settingsResponse.json(),
        ]);

        if (!customersResponse.ok) {
          throw new Error(
            customersData.error || "Failed to load customers."
          );
        }

        if (!productsResponse.ok) {
          throw new Error(
            productsData.error || "Failed to load products."
          );
        }

        if (!paymentTermsResponse.ok) {
          throw new Error(
            paymentTermsData.error ||
              "Failed to load payment terms."
          );
        }

        if (!settingsResponse.ok) {
          throw new Error(
            settingsData.error ||
              "Failed to load invoice settings."
          );
        }

        if (cancelled) {
          return;
        }

        const loadedCustomers =
          customersData.customers || [];

        const loadedProducts =
          productsData.products || [];

        const loadedPaymentTerms =
          paymentTermsData.paymentTerms ||
          paymentTermsData.payment_terms ||
          [];

        const loadedSettings =
          settingsData.settings || null;

        setCustomers(loadedCustomers);
        setProducts(loadedProducts);
        setPaymentTerms(loadedPaymentTerms);
        setSettings(loadedSettings);

        if (loadedSettings?.default_payment_terms_id) {
          setPaymentTermsId(
            String(
              loadedSettings.default_payment_terms_id
            )
          );
        } else {
          const defaultTerm =
            loadedPaymentTerms.find(
              (term: PaymentTerm) => term.is_default
            );

          if (defaultTerm) {
            setPaymentTermsId(defaultTerm.id);
          }
        }

        const defaultTaxRate = numberValue(
          loadedSettings?.default_tax_rate
        );

        setItems((currentItems) =>
          currentItems.map((item) => ({
            ...item,
            tax_rate:
              item.tax_rate === "0"
                ? String(defaultTaxRate)
                : item.tax_rate,
          }))
        );

        const defaultNotes =
          loadedSettings?.default_notes ||
          loadedSettings?.invoice_notes ||
          "";

        if (defaultNotes) {
          setNotes(defaultNotes);
        }

        const possibleBusiness =
          settingsData.business ||
          settingsData.businessProfile ||
          null;

        if (possibleBusiness) {
          setBusiness(possibleBusiness);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load invoice data."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!paymentTermsId) {
      return;
    }

    const selectedTerm = paymentTerms.find(
      (term) => term.id === paymentTermsId
    );

    if (!selectedTerm) {
      return;
    }

    const days = numberValue(
      selectedTerm.days ?? selectedTerm.due_days
    );

    if (days <= 0) {
      return;
    }

    const baseDate = new Date(
      `${invoiceDate}T00:00:00`
    );

    if (Number.isNaN(baseDate.getTime())) {
      return;
    }

    baseDate.setDate(
      baseDate.getDate() + days
    );

    setDueDate(
      baseDate.toISOString().slice(0, 10)
    );
  }, [paymentTermsId, invoiceDate, paymentTerms]);

  const updateItem = (
    id: string,
    field: keyof DraftItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  };

  const selectProduct = (
    itemId: string,
    productId: string
  ) => {
    const product = products.find(
      (entry) => entry.id === productId
    );

    if (!product) {
      updateItem(itemId, "product_id", "");
      return;
    }

    const price =
      product.selling_price ??
      product.unit_price ??
      0;

    const taxRate =
      product.tax_rate ??
      settings?.default_tax_rate ??
      0;

    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              product_id: product.id,
              description:
                product.description ||
                product.name,
              unit_price: String(
                numberValue(price)
              ),
              tax_rate: String(
                numberValue(taxRate)
              ),
            }
          : item
      )
    );
  };

  const addItem = () => {
    const defaultTaxRate = numberValue(
      settings?.default_tax_rate
    );

    setItems((current) => [
      ...current,
      {
        ...createItem(),
        tax_rate: String(defaultTaxRate),
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter(
        (item) => item.id !== id
      );
    });
  };

  const selectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerSearch(
      customer.company_name ||
        customer.contact_name ||
        customer.email ||
        ""
    );
    setShowCustomerSearch(false);
  };

  const createCustomer = async () => {
    if (
      !newCustomer.company_name.trim() &&
      !newCustomer.contact_name.trim()
    ) {
      setError(
        "Enter a company name or contact name for the customer."
      );
      return;
    }

    try {
      setNewCustomerSaving(true);
      setError("");

      const response = await fetch(
        "/api/customers",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company_name:
              newCustomer.company_name.trim() ||
              null,
            contact_name:
              newCustomer.contact_name.trim() ||
              null,
            email:
              newCustomer.email.trim() || null,
            phone:
              newCustomer.phone.trim() || null,
            address_line1:
              newCustomer.address_line1.trim() ||
              null,
            city:
              newCustomer.city.trim() || null,
            country:
              newCustomer.country.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to create customer."
        );
      }

      const createdCustomer =
        data.customer ||
        data.data?.customer;

      if (!createdCustomer?.id) {
        throw new Error(
          "Customer was created but the API did not return the customer."
        );
      }

      setCustomers((current) => [
        createdCustomer,
        ...current,
      ]);

      selectCustomer(createdCustomer);

      setNewCustomer({
        company_name: "",
        contact_name: "",
        email: "",
        phone: "",
        address_line1: "",
        city: "",
        country: "Kenya",
      });

      setShowNewCustomer(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create customer."
      );
    } finally {
      setNewCustomerSaving(false);
    }
  };

  const validate = () => {
    if (!customerId) {
      return "Please select a customer.";
    }

    if (items.length === 0) {
      return "Add at least one invoice item.";
    }

    for (const item of items) {
      if (!item.description.trim()) {
        return "Every invoice item needs a description.";
      }

      if (numberValue(item.quantity) <= 0) {
        return "Item quantity must be greater than zero.";
      }

      if (numberValue(item.unit_price) < 0) {
        return "Item price cannot be negative.";
      }

      if (numberValue(item.tax_rate) < 0) {
        return "Tax rate cannot be negative.";
      }

      if (numberValue(item.discount) < 0) {
        return "Item discount cannot be negative.";
      }
    }

    if (total < 0) {
      return "Invoice total cannot be negative.";
    }

    if (
      dueDate &&
      invoiceDate &&
      new Date(dueDate) <
        new Date(invoiceDate)
    ) {
      return "Due date cannot be before the invoice date.";
    }

    return null;
  };

  const saveInvoice = async () => {
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        customer_id: customerId,

        invoice_number:
          invoiceNumber.trim() || undefined,

        invoice_date: invoiceDate,

        due_date: dueDate || null,

        po_number:
          poNumber.trim() || null,

        payment_terms_id:
          paymentTermsId || null,

        notes: notes.trim() || null,

        terms: terms.trim() || null,

        tax_inclusive: taxInclusive,

        discount_type: discountType,

        discount_value:
          numberValue(discountValue),

        items: items.map((item) => ({
          product_id:
            item.product_id || null,

          description:
            item.description.trim(),

          quantity:
            numberValue(item.quantity),

          unit_price:
            numberValue(item.unit_price),

          tax_rate:
            numberValue(item.tax_rate),

          discount:
            numberValue(item.discount),
        })),
      };

      const response = await fetch(
        "/api/invoices",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Failed to create invoice."
        );
      }

      const createdInvoice =
        data.invoice ||
        (data.data as Record<string, unknown> | undefined)
          ?.invoice;

      const createdId =
        typeof createdInvoice === "object" &&
        createdInvoice !== null &&
        "id" in createdInvoice
          ? String(
              (
                createdInvoice as {
                  id: unknown;
                }
              ).id
            )
          : null;

      setSuccess("Invoice created successfully.");

      if (createdId) {
        router.push(
          `/invoices/${createdId}`
        );
        return;
      }

      router.push("/invoices");
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

  const companyName =
    business?.name ||
    business?.business_name ||
    "Your Business";

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Loader2
            size={20}
            className="animate-spin"
          />
          Loading invoice workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-4 dark:bg-gray-950 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        {/* HEADER */}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() =>
                router.push("/invoices")
              }
              className="mt-1 rounded-xl border border-gray-200 bg-white p-2 text-gray-600 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Back to invoices"
            >
              <ArrowLeft size={18} />
            </button>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                Invoicing
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                Create Invoice
              </h1>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create a professional invoice for
                your customer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                router.push("/invoices")
              }
              disabled={saving}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={saveInvoice}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={17} />
                  Create Invoice
                </>
              )}
            </button>
          </div>
        </div>

        {/* ALERTS */}

        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-300">
            <Check size={17} />
            {success}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* MAIN */}

          <div className="space-y-6">
            {/* CUSTOMER + INVOICE DETAILS */}

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Invoice details
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Choose the customer and define the invoice dates.
                </p>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2">
                {/* CUSTOMER */}

                <div className="md:col-span-2">
                  <Field
                    label="Customer"
                    required
                  >
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search
                            size={17}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          />

                          <input
                            value={
                              selectedCustomer
                                ? selectedCustomer.company_name ||
                                  selectedCustomer.contact_name ||
                                  selectedCustomer.email ||
                                  ""
                                : customerSearch
                            }
                            onChange={(event) => {
                              setCustomerId("");
                              setCustomerSearch(
                                event.target.value
                              );
                              setShowCustomerSearch(true);
                            }}
                            onFocus={() =>
                              setShowCustomerSearch(true)
                            }
                            placeholder="Search customers..."
                            className={`${inputClass} pl-10`}
                          />

                          {showCustomerSearch && (
                            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                              {filteredCustomers.length ===
                              0 ? (
                                <div className="p-4 text-center text-sm text-gray-500">
                                  No customers found.
                                </div>
                              ) : (
                                filteredCustomers.map(
                                  (customer) => (
                                    <button
                                      key={customer.id}
                                      type="button"
                                      onClick={() =>
                                        selectCustomer(
                                          customer
                                        )
                                      }
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                        {(
                                          customer.company_name ||
                                          customer.contact_name ||
                                          customer.email ||
                                          "C"
                                        )[0]?.toUpperCase()}
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                          {customer.company_name ||
                                            customer.contact_name ||
                                            "Unnamed customer"}
                                        </p>

                                        <p className="truncate text-xs text-gray-500">
                                          {customer.email ||
                                            customer.phone ||
                                            customer.customer_number ||
                                            ""}
                                        </p>
                                      </div>
                                    </button>
                                  )
                                )
                              )}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setShowNewCustomer(true)
                          }
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <UserPlus size={17} />
                          <span className="hidden sm:inline">
                            New
                          </span>
                        </button>
                      </div>
                    </div>
                  </Field>

                  {selectedCustomer && (
                    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {selectedCustomer.company_name ||
                              selectedCustomer.contact_name ||
                              "Customer"}
                          </p>

                          {selectedCustomer.contact_name &&
                            selectedCustomer.company_name && (
                              <p className="mt-0.5 text-xs text-gray-500">
                                {selectedCustomer.contact_name}
                              </p>
                            )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCustomerId("");
                            setCustomerSearch("");
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Change
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                        {selectedCustomer.email && (
                          <p>
                            Email:{" "}
                            {selectedCustomer.email}
                          </p>
                        )}

                        {selectedCustomer.phone && (
                          <p>
                            Phone:{" "}
                            {selectedCustomer.phone}
                          </p>
                        )}

                        {selectedCustomer.tax_number && (
                          <p>
                            Tax number:{" "}
                            {selectedCustomer.tax_number}
                          </p>
                        )}

                        {(selectedCustomer.city ||
                          selectedCustomer.country) && (
                          <p>
                            Location:{" "}
                            {[
                              selectedCustomer.city,
                              selectedCustomer.country,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Field label="Invoice number">
                  <input
                    value={invoiceNumber}
                    onChange={(event) =>
                      setInvoiceNumber(
                        event.target.value
                      )
                    }
                    placeholder="Auto-generated if empty"
                    className={inputClass}
                  />
                </Field>

                <Field label="PO number">
                  <input
                    value={poNumber}
                    onChange={(event) =>
                      setPoNumber(
                        event.target.value
                      )
                    }
                    placeholder="Optional"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Invoice date"
                  required
                >
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(event) =>
                      setInvoiceDate(
                        event.target.value
                      )
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    min={invoiceDate}
                    onChange={(event) =>
                      setDueDate(
                        event.target.value
                      )
                    }
                    className={inputClass}
                  />
                </Field>

                <SelectField
                  label="Payment terms"
                  value={paymentTermsId}
                  onChange={(event) =>
                    setPaymentTermsId(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select payment terms
                  </option>

                  {paymentTerms.map((term) => (
                    <option
                      key={term.id}
                      value={term.id}
                    >
                      {term.name}
                      {(term.days ??
                        term.due_days) !=
                        null
                        ? ` — ${
                            term.days ??
                            term.due_days
                          } days`
                        : ""}
                    </option>
                  ))}
                </SelectField>

                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
                    <input
                      type="checkbox"
                      checked={taxInclusive}
                      onChange={(event) =>
                        setTaxInclusive(
                          event.target.checked
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />

                    <span>
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                        Tax inclusive
                      </span>

                      <span className="block text-xs text-gray-500">
                        Prices already include tax
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </section>

            {/* ITEMS */}

            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    Items
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Add products or services to this invoice.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <Plus size={17} />
                  Add item
                </button>
              </div>

              <div className="p-5">
                <div className="space-y-4">
                  {items.map((item, index) => {
                    const lineSubtotal =
                      numberValue(
                        item.quantity
                      ) *
                        numberValue(
                          item.unit_price
                        ) -
                      numberValue(
                        item.discount
                      );

                    const lineTax =
                      Math.max(
                        0,
                        lineSubtotal
                      ) *
                      (numberValue(
                        item.tax_rate
                      ) /
                        100);

                    const lineTotal =
                      Math.max(
                        0,
                        lineSubtotal
                      ) + lineTax;

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/50"
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            Item {index + 1}
                          </p>

                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                removeItem(
                                  item.id
                                )
                              }
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                              aria-label={`Remove item ${
                                index + 1
                              }`}
                            >
                              <Trash2
                                size={16}
                              />
                            </button>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
                          <div className="lg:col-span-4">
                            <SelectField
                              label="Product / service"
                              value={
                                item.product_id
                              }
                              onChange={(event) =>
                                selectProduct(
                                  item.id,
                                  event.target
                                    .value
                                )
                              }
                            >
                              <option value="">
                                Manual item
                              </option>

                              {products
                                .filter(
                                  (product) =>
                                    product.is_active !==
                                      false
                                )
                                .map(
                                  (product) => (
                                    <option
                                      key={
                                        product.id
                                      }
                                      value={
                                        product.id
                                      }
                                    >
                                      {product.sku
                                        ? `${product.sku} — `
                                        : ""}
                                      {
                                        product.name
                                      }
                                    </option>
                                  )
                                )}
                            </SelectField>
                          </div>

                          <div className="lg:col-span-8">
                            <Field
                              label="Description"
                              required
                            >
                              <input
                                value={
                                  item.description
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateItem(
                                    item.id,
                                    "description",
                                    event.target
                                      .value
                                  )
                                }
                                placeholder="Describe the product or service"
                                className={
                                  inputClass
                                }
                              />
                            </Field>
                          </div>

                          <div className="lg:col-span-2">
                            <Field
                              label="Quantity"
                              required
                            >
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  item.quantity
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateItem(
                                    item.id,
                                    "quantity",
                                    event.target
                                      .value
                                  )
                                }
                                className={
                                  inputClass
                                }
                              />
                            </Field>
                          </div>

                          <div className="lg:col-span-3">
                            <Field
                              label="Unit price"
                              required
                            >
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
                                    item.id,
                                    "unit_price",
                                    event.target
                                      .value
                                  )
                                }
                                className={
                                  inputClass
                                }
                              />
                            </Field>
                          </div>

                          <div className="lg:col-span-2">
                            <Field label="Tax %">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  item.tax_rate
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateItem(
                                    item.id,
                                    "tax_rate",
                                    event.target
                                      .value
                                  )
                                }
                                className={
                                  inputClass
                                }
                              />
                            </Field>
                          </div>

                          <div className="lg:col-span-2">
                            <Field label="Discount">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  item.discount
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateItem(
                                    item.id,
                                    "discount",
                                    event.target
                                      .value
                                  )
                                }
                                className={
                                  inputClass
                                }
                              />
                            </Field>
                          </div>

                          <div className="lg:col-span-3">
                            <Field label="Line total">
                              <div className="flex h-[42px] items-center rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                                {money(
                                  taxInclusive
                                    ? Math.max(
                                        0,
                                        lineSubtotal
                                      )
                                    : lineTotal,
                                  currency
                                )}
                              </div>
                            </Field>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addItem}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 transition hover:border-blue-400 hover:text-blue-600 dark:border-gray-700"
                >
                  <Plus size={16} />
                  Add another item
                </button>
              </div>
            </section>

            {/* DISCOUNT / NOTES */}

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Additional information
                </h2>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Invoice discount
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue}
                      onChange={(event) =>
                        setDiscountValue(
                          event.target.value
                        )
                      }
                      className={`${inputClass} flex-1`}
                    />

                    <select
                      value={discountType}
                      onChange={(event) =>
                        setDiscountType(
                          event.target
                            .value as
                            | "amount"
                            | "percentage"
                        )
                      }
                      className={`${selectClass} w-32`}
                    >
                      <option value="amount">
                        Amount
                      </option>
                      <option value="percentage">
                        Percentage
                      </option>
                    </select>
                  </div>
                </div>

                <TextAreaField
                  label="Terms & conditions"
                  value={terms}
                  onChange={(event) =>
                    setTerms(event.target.value)
                  }
                  placeholder="Payment terms, late payment policy, etc."
                  rows={3}
                />

                <div className="md:col-span-2">
                  <TextAreaField
                    label="Notes"
                    value={notes}
                    onChange={(event) =>
                      setNotes(event.target.value)
                    }
                    placeholder="Add a note for your customer..."
                    rows={4}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* SUMMARY */}

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-950">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">
                  Invoice preview
                </p>

                <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                  {invoiceNumber ||
                    "New Invoice"}
                </h2>
              </div>

              <div className="space-y-5 p-5">
                <div>
                  <p className="text-xs text-gray-500">
                    From
                  </p>

                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {companyName}
                  </p>

                  {business?.email && (
                    <p className="mt-1 text-xs text-gray-500">
                      {business.email}
                    </p>
                  )}

                  {business?.phone && (
                    <p className="text-xs text-gray-500">
                      {business.phone}
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                  <p className="text-xs text-gray-500">
                    Bill to
                  </p>

                  {selectedCustomer ? (
                    <>
                      <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                        {selectedCustomer.company_name ||
                          selectedCustomer.contact_name ||
                          "Customer"}
                      </p>

                      {selectedCustomer.email && (
                        <p className="mt-1 text-xs text-gray-500">
                          {selectedCustomer.email}
                        </p>
                      )}

                      {selectedCustomer.phone && (
                        <p className="text-xs text-gray-500">
                          {selectedCustomer.phone}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">
                      No customer selected
                    </p>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                  <div className="space-y-3">
                    <SummaryRow
                      label="Subtotal"
                      value={money(
                        subtotal,
                        currency
                      )}
                    />

                    {invoiceDiscount > 0 && (
                      <SummaryRow
                        label="Discount"
                        value={`-${money(
                          invoiceDiscount,
                          currency
                        )}`}
                      />
                    )}

                    <SummaryRow
                      label="Tax"
                      value={money(
                        tax,
                        currency
                      )}
                    />
                  </div>

                  <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
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

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Invoice date</span>
                    <span>
                      {invoiceDate || "—"}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>Due date</span>
                    <span>
                      {dueDate || "—"}
                    </span>
                  </div>

                  {paymentTermsId && (
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>Payment terms</span>
                      <span>
                        {paymentTerms.find(
                          (term) =>
                            term.id ===
                            paymentTermsId
                        )?.name ||
                          "Selected"}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={saveInvoice}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />
                      Creating invoice...
                    </>
                  ) : (
                    <>
                      <Check size={17} />
                      Create Invoice
                    </>
                  )}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* NEW CUSTOMER MODAL */}

      {showNewCustomer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Add customer
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Create the customer without leaving the invoice.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowNewCustomer(false)
                }
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
              >
                <X size={19} />
              </button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Company name">
                <input
                  value={
                    newCustomer.company_name
                  }
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        company_name:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Company Ltd"
                  className={inputClass}
                />
              </Field>

              <Field label="Contact name">
                <input
                  value={
                    newCustomer.contact_name
                  }
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        contact_name:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="John Doe"
                  className={inputClass}
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        email:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="customer@example.com"
                  className={inputClass}
                />
              </Field>

              <Field label="Phone">
                <input
                  value={newCustomer.phone}
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        phone:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="+254..."
                  className={inputClass}
                />
              </Field>

              <Field label="Address">
                <input
                  value={
                    newCustomer.address_line1
                  }
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        address_line1:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Street / building"
                  className={inputClass}
                />
              </Field>

              <Field label="City">
                <input
                  value={newCustomer.city}
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        city:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Nairobi"
                  className={inputClass}
                />
              </Field>

              <Field label="Country">
                <input
                  value={newCustomer.country}
                  onChange={(event) =>
                    setNewCustomer(
                      (current) => ({
                        ...current,
                        country:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Kenya"
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() =>
                  setShowNewCustomer(false)
                }
                disabled={newCustomerSaving}
                className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createCustomer}
                disabled={newCustomerSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {newCustomerSaving ? (
                  <>
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Create customer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE CUSTOMER SEARCH WHEN CLICKING OUTSIDE */}

      {showCustomerSearch && (
        <button
          type="button"
          aria-label="Close customer search"
          onClick={() =>
            setShowCustomerSearch(false)
          }
          className="fixed inset-0 z-20 cursor-default"
        />
      )}
    </div>
  );
}