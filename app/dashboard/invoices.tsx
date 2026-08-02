"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowDownToLine, CheckCircle2, CircleDollarSign,
  FileText, Loader2, Plus, Receipt, Search, Send, Trash2, XCircle
} from "lucide-react";

type Status = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

type Customer = {
  id: string;
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type Product = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  product_type: string;
  unit_price: number | string;
  tax_rate: number | string;
  is_active: boolean;
};

type Item = {
  id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  line_total: number | string;
};

type Payment = {
  id: string;
  amount: number | string;
  payment_method: string;
  transaction_reference?: string | null;
  payment_date: string;
  status: string;
  notes?: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  status: Status;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  notes?: string | null;
  customer: Customer;
  invoice_items?: Item[];
  payments?: Payment[];
};

type Stats = {
  total_invoices: number;
  draft_invoices: number;
  sent_invoices: number;
  partial_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  cancelled_invoices: number;
  total_invoiced: number | string;
  total_collected: number | string;
  total_outstanding: number | string;
};

const labels: Record<Status, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(value));
}

function effectiveStatus(invoice: Invoice): Status {
  if (invoice.status === "paid" || invoice.status === "cancelled") return invoice.status;
  if (Number(invoice.amount_due) <= 0) return "paid";
  if (Number(invoice.amount_paid) > 0) return "partial";
  if (invoice.status !== "draft" && invoice.due_date) {
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const due = new Date(`${invoice.due_date}T00:00:00`);
    if (due < todayOnly) return "overdue";
  }
  return invoice.status;
}

function statusClass(status: Status) {
  const map: Record<Status, string> = {
    draft: "bg-purple-500/10 text-purple-600",
    sent: "bg-blue-500/10 text-blue-600",
    partial: "bg-amber-500/10 text-amber-600",
    paid: "bg-emerald-500/10 text-emerald-600",
    overdue: "bg-red-500/10 text-red-600",
    cancelled: "bg-gray-500/10 text-gray-500",
  };
  return map[status];
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [a, b] = await Promise.all([
        fetch("/api/invoices", { credentials: "include" }),
        fetch("/api/invoices/stats", { credentials: "include" }),
      ]);
      const invoicesData = await a.json();
      const statsData = await b.json();
      if (!a.ok) throw new Error(invoicesData.error || "Failed to load invoices");
      if (!b.ok) throw new Error(statsData.error || "Failed to load invoice statistics");
      setInvoices(invoicesData.invoices || []);
      setStats(statsData.stats || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function open(id: string) {
    try {
      setDetailsLoading(true);
      setError("");
      const response = await fetch(`/api/invoices/${id}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load invoice");
      setSelected(data.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoice");
    } finally {
      setDetailsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return invoices.filter((invoice) => {
      const status = effectiveStatus(invoice);
      const matchesStatus = filter === "all" || status === filter;
      const matchesSearch =
        !q ||
        invoice.invoice_number.toLowerCase().includes(q) ||
        invoice.customer.company_name.toLowerCase().includes(q) ||
        String(invoice.customer.contact_name || "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [invoices, search, filter]);

  if (selected) {
    return (
      <InvoiceDetails
        invoice={selected}
        loading={detailsLoading}
        onBack={() => setSelected(null)}
        onRefresh={async () => { await open(selected.id); await load(); }}
        onChanged={async () => { setSelected(null); await load(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Invoices</h2>
          <p className="mt-1 text-sm text-gray-500">Create, track and manage invoices and payments.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-gray-900">
          <Plus size={17} /> New Invoice
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Invoices", stats?.total_invoices ?? 0],
          ["Invoiced", money(stats?.total_invoiced)],
          ["Collected", money(stats?.total_collected)],
          ["Outstanding", money(stats?.total_outstanding)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {(["draft", "sent", "partial", "paid", "overdue", "cancelled"] as Status[]).map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? "all" : s)} className={`rounded-xl border p-3 text-left ${filter === s ? "border-gray-900 dark:border-white" : "border-gray-200 dark:border-gray-800"}`}>
            <p className="text-xs text-gray-500">{labels[s]}</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
              {stats?.[`${s}_invoices` as keyof Stats] as number ?? 0}
            </p>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row dark:border-gray-800">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoices or customers..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | Status)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
            <option value="all">All statuses</option>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
            <FileText className="text-gray-400" />
            <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">No invoices found</h3>
            <p className="mt-1 text-sm text-gray-500">Create an invoice or change your search/filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800/50">
                <tr>
                  <th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((invoice) => {
                  const status = effectiveStatus(invoice);
                  return (
                    <tr key={invoice.id} onClick={() => open(invoice.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-5 py-4"><p className="font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</p><p className="text-xs text-gray-500">{formatDate(invoice.issue_date)}</p></td>
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{invoice.customer.company_name}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{formatDate(invoice.due_date)}</td>
                      <td className="px-5 py-4 text-sm font-medium dark:text-white">{money(invoice.total_amount)}</td>
                      <td className="px-5 py-4 text-sm font-medium dark:text-white">{money(invoice.amount_due)}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>{labels[status]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen && <CreateInvoice onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await load(); }} />}
    </div>
  );
}

function CreateInvoice({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ productId: "", description: "", quantity: "1", unitPrice: "0", taxRate: "0" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/customers", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/products", { credentials: "include" }).then((r) => r.json()),
    ]).then(([c, p]) => {
      setCustomers(Array.isArray(c) ? c : c.customers || []);
      setProducts(p.products || []);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load invoice data"));
  }, []);

  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);
  const tax = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0) * Number(i.taxRate || 0) / 100, 0);

  function chooseProduct(index: number, id: string) {
    const p = products.find((x) => x.id === id);
    setItems((current) => current.map((item, i) => i !== index ? item : {
      ...item,
      productId: id,
      description: p?.description?.trim() || p?.name || item.description,
      unitPrice: p ? String(p.unit_price) : item.unitPrice,
      taxRate: p ? String(p.tax_rate) : item.taxRate,
    }));
  }

  async function submit() {
    try {
      setSaving(true); setError("");
      if (!customerId) throw new Error("Select a customer.");
      if (items.some((i) => !i.description.trim() || Number(i.quantity) <= 0 || Number(i.unitPrice) < 0)) throw new Error("Complete every invoice item with a valid description, quantity and price.");
      const response = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          due_date: dueDate || null,
          notes: notes.trim() || null,
          items: items.map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity), unit_price: Number(i.unitPrice), tax_rate: Number(i.taxRate || 0) })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create invoice");
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    } finally { setSaving(false); }
  }

  return (
    <Modal title="New Invoice" onClose={onClose}>
      {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="space-y-5">
        <label className="block text-sm">Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800">
            <option value="">Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name}{c.contact_name ? ` — ${c.contact_name}` : ""}</option>)}
          </select>
        </label>
        <label className="block text-sm">Due date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800" />
        </label>

        {items.map((item, index) => (
          <div key={index} className="rounded-2xl border p-4 dark:border-gray-700">
            <div className="grid gap-3">
              <select value={item.productId} onChange={(e) => chooseProduct(index, e.target.value)} className="rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800">
                <option value="">Custom item / select product or service</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
              </select>
              <input value={item.description} onChange={(e) => setItems((x) => x.map((v,i) => i === index ? {...v, description:e.target.value} : v))} placeholder="Description" className="rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800" />
              <div className="grid grid-cols-3 gap-3">
                <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => setItems((x) => x.map((v,i) => i === index ? {...v, quantity:e.target.value} : v))} placeholder="Qty" className="rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800" />
                <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItems((x) => x.map((v,i) => i === index ? {...v, unitPrice:e.target.value} : v))} placeholder="Unit price" className="rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800" />
                <input type="number" min="0" max="100" step="0.01" value={item.taxRate} onChange={(e) => setItems((x) => x.map((v,i) => i === index ? {...v, taxRate:e.target.value} : v))} placeholder="Tax %" className="rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800" />
              </div>
              {items.length > 1 && <button onClick={() => setItems((x) => x.filter((_,i) => i !== index))} className="text-left text-sm text-red-600">Remove item</button>}
            </div>
          </div>
        ))}
        <button onClick={() => setItems((x) => [...x, { productId:"", description:"", quantity:"1", unitPrice:"0", taxRate:"0" }])} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Plus size={16}/> Add item</button>

        <label className="block text-sm">Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800" />
        </label>

        <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800">
          <div className="flex justify-between text-sm"><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <div className="mt-2 flex justify-between text-sm"><span>Tax</span><b>{money(tax)}</b></div>
          <div className="mt-3 flex justify-between border-t pt-3 text-lg font-semibold"><span>Total</span><b>{money(subtotal + tax)}</b></div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm">Cancel</button>
        <button onClick={submit} disabled={saving} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Creating..." : "Create invoice"}</button>
      </div>
    </Modal>
  );
}

function InvoiceDetails({ invoice, loading, onBack, onRefresh, onChanged }: { invoice: Invoice; loading: boolean; onBack: () => void; onRefresh: () => Promise<void>; onChanged: () => Promise<void> }) {
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = effectiveStatus(invoice);

  async function action(nextStatus: "sent" | "cancelled") {
    setBusy(true);
    try {
      const r = await fetch(`/api/invoices/${invoice.id}`, { method: "PATCH", credentials: "include", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ status: nextStatus }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Action failed");
      await onRefresh();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE", credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Delete failed");
      await onChanged();
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-gray-500"><ArrowLeft size={16}/> Back to invoices</button>
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:justify-between">
        <div>
          <div className="flex items-center gap-3"><h2 className="text-xl font-semibold dark:text-white">{invoice.invoice_number}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>{labels[status]}</span></div>
          <p className="mt-1 text-sm text-gray-500">{invoice.customer.company_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><ArrowDownToLine size={16}/> Print / PDF</button>
          {invoice.status === "draft" && <button disabled={busy} onClick={() => action("sent")} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm text-white"><Send size={16}/> Send</button>}
          {status !== "paid" && status !== "cancelled" && <button onClick={() => setPayOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white"><CircleDollarSign size={16}/> Record payment</button>}
          {status !== "cancelled" && status !== "paid" && <button disabled={busy} onClick={() => action("cancelled")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-red-600"><XCircle size={16}/> Cancel</button>}
          {invoice.amount_paid === 0 && <button disabled={busy} onClick={remove} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-red-600"><Trash2 size={16}/> Delete</button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Summary label="Subtotal" value={money(invoice.subtotal)}/>
        <Summary label="Tax" value={money(invoice.tax_amount)}/>
        <Summary label="Total" value={money(invoice.total_amount)}/>
        <Summary label="Balance" value={money(invoice.amount_due)}/>
      </div>

      <section className="rounded-2xl border bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b p-5 dark:border-gray-800"><h3 className="font-semibold dark:text-white">Invoice items</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800"><tr><th className="px-5 py-3">Description</th><th className="px-5 py-3">Qty</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Tax</th><th className="px-5 py-3">Total</th></tr></thead><tbody className="divide-y dark:divide-gray-800">{(invoice.invoice_items || []).map((i) => <tr key={i.id}><td className="px-5 py-4 dark:text-white">{i.description}</td><td className="px-5 py-4">{i.quantity}</td><td className="px-5 py-4">{money(i.unit_price)}</td><td className="px-5 py-4">{i.tax_rate}%</td><td className="px-5 py-4 font-medium dark:text-white">{money(i.line_total)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="rounded-2xl border bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b p-5 dark:border-gray-800"><h3 className="font-semibold dark:text-white">Payment history</h3></div>
        {(invoice.payments || []).length === 0 ? <p className="p-5 text-sm text-gray-500">No payments recorded.</p> : <div className="divide-y dark:divide-gray-800">{invoice.payments!.map((p) => <div key={p.id} className="flex justify-between gap-4 p-5"><div><p className="font-medium dark:text-white">{money(p.amount)}</p><p className="text-xs text-gray-500">{p.payment_method} · {formatDate(p.payment_date)}</p></div><span className="text-xs text-gray-500">{p.transaction_reference || "No reference"}</span></div>)}</div>}
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2">
        <div><p className="text-xs text-gray-500">Issued</p><p className="mt-1 dark:text-white">{formatDate(invoice.issue_date)}</p></div>
        <div><p className="text-xs text-gray-500">Due</p><p className="mt-1 dark:text-white">{formatDate(invoice.due_date)}</p></div>
        <div><p className="text-xs text-gray-500">Customer email</p><p className="mt-1 dark:text-white">{invoice.customer.email || "—"}</p></div>
        <div><p className="text-xs text-gray-500">Customer phone</p><p className="mt-1 dark:text-white">{invoice.customer.phone || "—"}</p></div>
      </section>

      {invoice.notes && <section className="rounded-2xl border p-5 dark:border-gray-800"><p className="text-xs text-gray-500">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm dark:text-gray-200">{invoice.notes}</p></section>}

      {payOpen && <PaymentModal invoice={invoice} onClose={() => setPayOpen(false)} onSaved={async () => { setPayOpen(false); await onRefresh(); }} />}
    </div>
  );
}

function PaymentModal({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState(String(invoice.amount_due));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    try {
      setSaving(true); setError("");
      const r = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST", credentials: "include", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ amount: Number(amount), payment_method: method, transaction_reference: reference || null, notes: notes || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to record payment");
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to record payment"); }
    finally { setSaving(false); }
  }

  return <Modal title="Record payment" onClose={onClose}>
    {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Outstanding balance: <b>{money(invoice.amount_due)}</b></p>
      <input type="number" min="0.01" max={Number(invoice.amount_due)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800"/>
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option><option value="other">Other</option></select>
      <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference (optional)" className="w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800"/>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3} className="w-full rounded-xl border p-3 dark:border-gray-700 dark:bg-gray-800"/>
    </div>
    <div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm">Cancel</button><button onClick={save} disabled={saving} className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm text-white disabled:opacity-50">{saving ? "Saving..." : "Record payment"}</button></div>
  </Modal>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-semibold dark:text-white">{value}</p></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900"><div className="flex items-center justify-between"><h3 className="font-semibold dark:text-white">{title}</h3><button onClick={onClose}><XCircle className="text-gray-500"/></button></div><div className="mt-5">{children}</div></div></div>;
}
