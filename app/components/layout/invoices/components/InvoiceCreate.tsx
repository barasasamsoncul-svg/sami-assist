"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Save,
  Send,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  User,
  Package,
  Calendar,
  DollarSign,
  Percent,
} from "lucide-react";

interface Customer {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  currency: string;
}

interface Product {
  id: string;
  name: string;
  unit_price: number;
  tax_rate_id: string | null;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
}

interface LineItem {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number;
  tax_rate: number;
  tax_rate_id: string | null;
  line_total: number;
}

export default function InvoiceCreate() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [footerText, setFooterText] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [taxCalculationMethod, setTaxCalculationMethod] = useState<"exclusive" | "inclusive">("exclusive");

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      product_id: null,
      description: "",
      quantity: 1,
      unit_price: 0,
      discount_type: null,
      discount_value: 0,
      tax_rate: 0,
      tax_rate_id: null,
      line_total: 0,
    },
  ]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    // Check for edit mode
    const params = new URLSearchParams(window.location.hash.split("?")[1]);
    const editId = params.get("edit");
    if (editId) {
      setIsEditMode(true);
      setEditInvoiceId(editId);
      fetchInvoice(editId);
    }
  }, []);

  const fetchData = async () => {
    try {
      const [customersRes, productsRes, taxRatesRes] = await Promise.all([
        fetch("/api/invoices/customers?limit=100"),
        fetch("/api/invoices/products?limit=100"),
        fetch("/api/invoices/tax-rates?limit=100"),
      ]);

      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.customers || []);
      }
      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
      }
      if (taxRatesRes.ok) {
        const data = await taxRatesRes.json();
        setTaxRates(data.tax_rates || []);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  };

  const fetchInvoice = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}`);
      if (!response.ok) throw new Error("Failed to fetch invoice");
      const data = await response.json();
      const invoice = data.invoice;

      setCustomerId(invoice.customer_id);
      setIssueDate(invoice.issue_date);
      setDueDate(invoice.due_date);
      setCurrency(invoice.currency);
      setPoNumber(invoice.po_number || "");
      setNotes(invoice.notes || "");
      setFooterText(invoice.footer_text || "");
      setDiscountType(invoice.discount_type);
      setDiscountValue(invoice.discount_value);
      setShippingCost(invoice.shipping_cost);
      setTaxCalculationMethod(invoice.tax_calculation_method || "exclusive");

      if (invoice.items && invoice.items.length > 0) {
        setLineItems(
          invoice.items.map((item: any) => ({
            id: item.id,
            product_id: item.product_id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_type: item.discount_type,
            discount_value: item.discount_value,
            tax_rate: item.tax_rate,
            tax_rate_id: item.tax_rate_id,
            line_total: item.line_total,
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    }
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        product_id: null,
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_type: null,
        discount_value: 0,
        tax_rate: 0,
        tax_rate_id: null,
        line_total: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // Auto-calculate line total
        if (["quantity", "unit_price", "discount_type", "discount_value", "tax_rate"].includes(field)) {
          const quantity = updated.quantity || 0;
          const unitPrice = updated.unit_price || 0;
          const gross = quantity * unitPrice;
          let discount = 0;

          if (updated.discount_type === "percentage") {
            discount = gross * ((updated.discount_value || 0) / 100);
          } else if (updated.discount_type === "fixed") {
            discount = Math.min(updated.discount_value || 0, gross);
          }

          const net = Math.max(0, gross - discount);
          const tax = net * ((updated.tax_rate || 0) / 100);

          updated.line_total = net + tax;
        }

        // If product selected, auto-fill details
        if (field === "product_id" && value) {
          const product = products.find((p) => p.id === value);
          if (product) {
            updated.description = product.name;
            updated.unit_price = product.unit_price;
            if (product.tax_rate_id) {
              const taxRate = taxRates.find((t) => t.id === product.tax_rate_id);
              if (taxRate) {
                updated.tax_rate = taxRate.rate;
                updated.tax_rate_id = product.tax_rate_id;
              }
            }
            // Recalculate
            const gross = updated.quantity * updated.unit_price;
            let discount = 0;
            if (updated.discount_type === "percentage") {
              discount = gross * ((updated.discount_value || 0) / 100);
            } else if (updated.discount_type === "fixed") {
              discount = Math.min(updated.discount_value || 0, gross);
            }
            const net = Math.max(0, gross - discount);
            const tax = net * ((updated.tax_rate || 0) / 100);
            updated.line_total = net + tax;
          }
        }

        return updated;
      })
    );
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    lineItems.forEach((item) => {
      const gross = item.quantity * item.unit_price;
      subtotal += gross;
      totalDiscount +=
        item.discount_type === "percentage"
          ? gross * ((item.discount_value || 0) / 100)
          : item.discount_type === "fixed"
          ? Math.min(item.discount_value || 0, gross)
          : 0;
    });

    const subtotalAfterDiscount = Math.max(0, subtotal - totalDiscount);

    // Apply invoice-level discount
    let invoiceDiscount = 0;
    if (discountType === "percentage") {
      invoiceDiscount = subtotalAfterDiscount * (discountValue / 100);
    } else if (discountType === "fixed") {
      invoiceDiscount = Math.min(discountValue, subtotalAfterDiscount);
    }

    const totalAfterDiscount = Math.max(0, subtotalAfterDiscount - invoiceDiscount);

    // Tax
    let taxAmount = totalTax;
    if (invoiceDiscount > 0 && subtotalAfterDiscount > 0) {
      taxAmount = totalTax * (1 - invoiceDiscount / subtotalAfterDiscount);
    }

    const shippingTax = shippingCost * 0.16; // Assuming 16% VAT on shipping
    const grandTotal = taxCalculationMethod === "inclusive" ? totalAfterDiscount + shippingCost : totalAfterDiscount + taxAmount + shippingCost + shippingTax;

    return {
      subtotal,
      totalDiscount: totalDiscount + invoiceDiscount,
      taxAmount,
      shippingCost,
      shippingTax,
      grandTotal,
    };
  };

  const totals = calculateTotals();

  const handleSubmit = async (status: "draft" | "sent") => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        customer_id: customerId,
        issue_date: issueDate,
        due_date: dueDate,
        currency,
        po_number: poNumber || null,
        notes: notes || null,
        footer_text: footerText || null,
        discount_type: discountType,
        discount_value: discountValue,
        shipping_cost: shippingCost,
        tax_calculation_method: taxCalculationMethod,
        status,
        items: lineItems.map((item) => ({
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
          tax_rate: item.tax_rate,
          tax_rate_id: item.tax_rate_id,
        })),
      };

      const url = isEditMode ? `/api/invoices/${editInvoiceId}` : "/api/invoices";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save invoice");
      }

      const data = await response.json();
      setSuccess(`Invoice ${isEditMode ? "updated" : "created"} successfully!`);

      if (!isEditMode) {
        // Reset form
        setCustomerId("");
        setIssueDate(new Date().toISOString().split("T")[0]);
        setDueDate("");
        setPoNumber("");
        setNotes("");
        setFooterText("");
        setDiscountType(null);
        setDiscountValue(0);
        setShippingCost(0);
        setLineItems([
          {
            id: crypto.randomUUID(),
            product_id: null,
            description: "",
            quantity: 1,
            unit_price: 0,
            discount_type: null,
            discount_value: 0,
            tax_rate: 0,
            tax_rate_id: null,
            line_total: 0,
          },
        ]);
      }

      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditMode ? "Edit Invoice" : "Create Invoice"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isEditMode ? "Update existing invoice" : "Create a new invoice for your customer"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleSubmit("draft")}
            disabled={saving || !customerId}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Save size={16} />
            Save Draft
          </button>
          <button
            onClick={() => handleSubmit("sent")}
            disabled={saving || !customerId}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={16} />
            {saving ? "Saving..." : "Create & Send"}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle size={16} />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            ×
          </button>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left - Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Customer Details
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Customer *
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  required
                >
                  <option value="">Select a customer...</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Line Items
              </h3>
              <button
                onClick={addLineItem}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-gray-100 p-4 dark:border-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Item #{index + 1}
                    </span>
                    <button
                      onClick={() => removeLineItem(item.id)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      disabled={lineItems.length <= 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <select
                        value={item.product_id || ""}
                        onChange={(e) => updateLineItem(item.id, "product_id", e.target.value || null)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      >
                        <option value="">Select product...</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} - {product.unit_price}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                        placeholder="Description"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        value={item.quantity || 1}
                        onChange={(e) => updateLineItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        value={item.unit_price || 0}
                        onChange={(e) => updateLineItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <select
                        value={item.discount_type || ""}
                        onChange={(e) => updateLineItem(item.id, "discount_type", e.target.value || null)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      >
                        <option value="">No Discount</option>
                        <option value="percentage">%</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <input
                        type="number"
                        value={item.discount_value || 0}
                        onChange={(e) => updateLineItem(item.id, "discount_value", parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <input
                        type="number"
                        value={item.tax_rate || 0}
                        onChange={(e) => updateLineItem(item.id, "tax_rate", parseFloat(e.target.value) || 0)}
                        min="0"
                        max="100"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <span className="block text-right font-medium text-gray-900 dark:text-white">
                        {item.line_total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Additional Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notes (visible to customer)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="Add any notes for the customer..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Footer Text
                </label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="Thank you for your business!"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right - Summary */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Invoice Summary
            </h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  PO Number
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="PO-12345"
                />
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {currency} {totals.subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Discount</span>
                <span className="font-medium text-red-500">-{currency} {totals.totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Tax</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {currency} {totals.taxAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Shipping</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {currency} {totals.shippingCost.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Shipping Tax</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {currency} {totals.shippingTax.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 dark:border-gray-800">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-gray-900 dark:text-white">Total</span>
                  <span className="text-gray-900 dark:text-white">
                    {currency} {totals.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Discount */}
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Discount Type
                  </label>
                  <select
                    value={discountType || ""}
                    onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed" | null || null)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">None</option>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Value
                  </label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Tax Calculation
                </label>
                <select
                  value={taxCalculationMethod}
                  onChange={(e) => setTaxCalculationMethod(e.target.value as "exclusive" | "inclusive")}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="exclusive">Exclusive (Tax added)</option>
                  <option value="inclusive">Inclusive (Tax included)</option>
                </select>
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Shipping Cost
                </label>
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}