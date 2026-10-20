'use client';

import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  FileText,
  Info,
  Package,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';

import { useMemo, useState } from 'react';

import type {
  SalesQuoteDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

type DraftLine = {
  key: string;
  catalogItemId: string;
  description: string;
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  taxName: string;
  taxRate: string;
};

function newKey() {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}

function blankLine(): DraftLine {
  return {
    key: newKey(),
    catalogItemId: '',
    description: '',
    sku: '',
    unit: 'unit',
    quantity: '1',
    unitPrice: '0',
    unitCost: '0',
    discountType: 'percent',
    discountValue: '0',
    taxName: '',
    taxRate: '0',
  };
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function lineSubtotal(line: DraftLine): { base: number; discount: number; taxable: number; tax: number } {
  const qty = Math.max(0, Number(line.quantity) || 0);
  const price = Math.max(0, Number(line.unitPrice) || 0);
  const base = qty * price;
  const discountValue = Math.max(0, Number(line.discountValue) || 0);
  const discountAmount =
    line.discountType === 'fixed'
      ? Math.min(base, discountValue)
      : (base * Math.min(100, discountValue)) / 100;
  const taxable = Math.max(0, base - discountAmount);
  const tax = (taxable * Math.min(100, Math.max(0, Number(line.taxRate) || 0))) / 100;
  return { base, discount: discountAmount, taxable, tax };
}

export default function SalesQuoteComposer({
  data,
  salespeople,
  currentSalespersonId,
  initialQuote = null,
  linkedOpportunity = null,
  busy,
  onSave,
  onCancel,
  onLocalError,
}: {
  data: SalesWorkspaceData;
  salespeople: SalesWorkspaceData['salespeople'];
  currentSalespersonId: string | null;
  initialQuote?: SalesQuoteDetail | null;
  linkedOpportunity?: {
    id: string;
    opportunity_number: string;
    name: string;
    billing_customer_id: string | null;
    customer_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    currency: string;
    expected_value: number | string;
  } | null;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  onCancel: () => void;
  onLocalError?: (message: string) => void;
}) {
  const [customerId, setCustomerId] = useState(
    initialQuote?.billingCustomerId ||
      (data.capabilities.canUseBillingCustomers ? linkedOpportunity?.billing_customer_id : null) ||
      '',
  );
  const [customerName, setCustomerName] = useState(
    initialQuote?.customerName ||
      linkedOpportunity?.customer_name ||
      linkedOpportunity?.name ||
      linkedOpportunity?.contact_name ||
      '',
  );
  const [customerEmail, setCustomerEmail] = useState(
    initialQuote?.customerEmail || linkedOpportunity?.email || '',
  );
  const [customerPhone, setCustomerPhone] = useState(
    initialQuote?.customerPhone || linkedOpportunity?.phone || '',
  );
  const [billingAddress, setBillingAddress] = useState(initialQuote?.billingAddress || '');
  const [shippingAddress, setShippingAddress] = useState(initialQuote?.shippingAddress || '');
  const [reference, setReference] = useState(
    initialQuote?.reference || linkedOpportunity?.opportunity_number || '',
  );
  const [currency, setCurrency] = useState(
    initialQuote?.currency ||
      linkedOpportunity?.currency ||
      data.settings.defaultCurrency ||
      data.company.currency,
  );
  const [salespersonUserId, setSalespersonUserId] = useState(
    initialQuote ? initialQuote.salespersonUserId ?? '' : currentSalespersonId ?? '',
  );
  const [manualExchangeRate, setManualExchangeRate] = useState('');
  const [quoteDate, setQuoteDate] = useState(
    initialQuote?.quoteDate || new Date().toISOString().slice(0, 10),
  );
  const [validUntil, setValidUntil] = useState(
    initialQuote?.validUntil ||
      new Date(Date.now() + data.settings.defaultValidityDays * 86400000)
        .toISOString()
        .slice(0, 10),
  );
  const [shippingTotal, setShippingTotal] = useState(
    String(initialQuote?.shippingTotal || 0),
  );
  const [depositType, setDepositType] = useState<'none' | 'percent' | 'fixed'>(
    initialQuote?.depositType || 'none',
  );
  const [depositValue, setDepositValue] = useState(
    String(initialQuote?.depositValue || 0),
  );
  const [notes, setNotes] = useState(
    initialQuote?.notes || data.settings.defaultNotes || '',
  );
  const [terms, setTerms] = useState(
    initialQuote?.terms || data.settings.termsAndConditions || '',
  );
  const [internalNotes, setInternalNotes] = useState(initialQuote?.internalNotes || '');
  const [templateId, setTemplateId] = useState(
    data.templates.find((item) => item.isDefault)?.id || data.templates[0]?.id || '',
  );
  const [pricelistId, setPricelistId] = useState(initialQuote?.pricelistId || '');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>(
    initialQuote?.lines.map((line) => ({
      key: line.id,
      catalogItemId: line.catalogItemId || '',
      description: line.description,
      sku: line.sku || '',
      unit: line.unit,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      unitCost: String(line.unitCost || 0),
      discountType: line.discountType,
      discountValue: String(line.discountValue),
      taxName: line.taxName || '',
      taxRate: String(line.taxRate),
    })) || [blankLine()],
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let cost = 0;
    for (const line of lines) {
      const qty = Math.max(0, Number(line.quantity) || 0);
      const parts = lineSubtotal(line);
      subtotal += parts.base;
      discount += parts.discount;
      cost += qty * Math.max(0, Number(line.unitCost) || 0);
      tax += parts.tax;
    }
    const shipping = Math.max(0, Number(shippingTotal) || 0);
    const netRevenue = subtotal - discount;
    const margin = netRevenue - cost;
    return {
      subtotal,
      discount,
      tax,
      shipping,
      cost,
      margin,
      marginPercent: netRevenue > 0 ? (margin / netRevenue) * 100 : 0,
      total: subtotal - discount + tax + shipping,
    };
  }, [lines, shippingTotal]);

  const depositComputed = useMemo(() => {
    if (depositType === 'none') return 0;
    const value = Math.max(0, Number(depositValue) || 0);
    if (depositType === 'percent') return (totals.total * Math.min(100, value)) / 100;
    return Math.min(totals.total, value);
  }, [depositType, depositValue, totals.total]);

  const needsExchangeRate = currency !== data.company.currency;
  const exchangeRateInvalid =
    needsExchangeRate &&
    (!manualExchangeRate ||
      !Number.isFinite(Number(manualExchangeRate)) ||
      Number(manualExchangeRate) <= 0);
  const missingCustomer = !customerId && !customerName.trim();

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, currentIndex) =>
        currentIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeLine(index: number) {
    setLines((current) =>
      current.length === 1
        ? current
        : current.filter((_item, i) => i !== index),
    );
  }

  function selectCatalog(index: number, value: string) {
    const item = data.catalogItems.find((candidate) => candidate.id === value);
    if (!item) {
      patchLine(index, { catalogItemId: '' });
      return;
    }
    patchLine(index, {
      catalogItemId: item.id,
      description: item.isVariant ? item.name : item.description || item.name,
      sku: item.sku || '',
      unit: item.unit || 'unit',
      unitPrice: String(item.unitPrice),
      unitCost: String(item.unitCost || 0),
      taxName: item.taxName || '',
      taxRate: String(item.taxRate),
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (missingCustomer) {
      const message = 'Enter a billing customer or a customer name before saving.';
      setSubmitError(message);
      onLocalError?.(message);
      return;
    }
    if (exchangeRateInvalid) {
      const message = 'Enter the exchange rate to ' + data.company.currency + ' before saving.';
      setSubmitError(message);
      onLocalError?.(message);
      return;
    }

    await onSave({
      action: initialQuote ? 'update_quote' : 'create_quote',
      quoteId: initialQuote?.id,
      opportunityId: initialQuote ? undefined : linkedOpportunity?.id,
      billingCustomerId: customerId || undefined,
      templateId: templateId || undefined,
      pricelistId: pricelistId || undefined,
      quoteDate,
      validUntil,
      currency,
      salespersonUserId: salespersonUserId || undefined,
      exchangeRate:
        currency !== data.company.currency && manualExchangeRate
          ? Number(manualExchangeRate)
          : undefined,
      reference,
      customerName: customerId ? undefined : customerName,
      customerEmail: customerId ? undefined : customerEmail,
      customerPhone: customerId ? undefined : customerPhone,
      billingAddress: customerId ? undefined : billingAddress,
      shippingAddress: customerId ? undefined : shippingAddress,
      shippingTotal: Number(shippingTotal),
      depositType,
      depositValue: depositType === 'none' ? 0 : Number(depositValue),
      notes,
      terms,
      internalNotes,
      lines: lines.map((line) => ({
        catalogItemId: line.catalogItemId || undefined,
        description: line.description,
        sku: line.sku || undefined,
        unit: line.unit,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        unitCost: data.capabilities.canManageMargin ? Number(line.unitCost) : undefined,
        discountType: line.discountType,
        discountValue: Number(line.discountValue),
        taxName: line.taxName || undefined,
        taxRate: Number(line.taxRate),
      })),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {linkedOpportunity ? (
        <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-3 text-sm dark:border-blue-900/60 dark:bg-blue-950/20">
          <p className="font-black text-blue-800 dark:text-blue-200">
            Opportunity {linkedOpportunity.opportunity_number}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Expected value:{' '}
            {formatMoney(
              Number(linkedOpportunity.expected_value || 0),
              linkedOpportunity.currency,
            )}
            . The quote will be linked to this opportunity; review the line items and
            final quote total before saving.
          </p>
        </div>
      ) : null}

      {/* -------- Customer + details -------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-black">Customer</p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.capabilities.canUseBillingCustomers && data.billingCustomers.length > 0 ? (
              <label className="sm:col-span-2">
                <Label>Billing customer</Label>
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">Manual customer</option>
                  {data.billingCustomers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                  Select a billing customer to attach invoices, or switch to Manual to
                  enter contact details on the quote.
                </span>
              </label>
            ) : null}

            {!customerId ? (
              <>
                <Input
                  label="Customer name"
                  value={customerName}
                  onChange={setCustomerName}
                  required
                />
                <Input
                  label="Email"
                  value={customerEmail}
                  onChange={setCustomerEmail}
                  type="email"
                />
                <Input
                  label="Phone"
                  value={customerPhone}
                  onChange={setCustomerPhone}
                />
                <Input
                  label="Billing address"
                  value={billingAddress}
                  onChange={setBillingAddress}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Shipping address"
                    value={shippingAddress}
                    onChange={setShippingAddress}
                  />
                </div>
              </>
            ) : (
              <p className="sm:col-span-2 inline-flex items-start gap-1.5 rounded-lg bg-[var(--sami-surface-soft)] p-2 text-xs text-slate-500 dark:text-slate-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Contact details are read from the selected billing customer. Switch to
                Manual customer to override for this quote.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-black">Quotation details</p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Quote date"
              type="date"
              value={quoteDate}
              onChange={setQuoteDate}
              required
            />
            <Input
              label="Valid until"
              type="date"
              value={validUntil}
              onChange={setValidUntil}
              required
            />
            <label className="block">
              <Label>Salesperson</Label>
              <select
                aria-label="Salesperson"
                value={salespersonUserId}
                onChange={(event) => setSalespersonUserId(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
              >
                <option value="">Self (me)</option>
                {salespeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.email ? ' · ' + person.email : ''}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                Leave as Self (me) to assign this quotation to your own account.
              </span>
            </label>

            <label className="block">
              <Label>Deposit / advance</Label>
              <select
                aria-label="Deposit type"
                value={depositType}
                onChange={(event) => {
                  const next = event.target.value as 'none' | 'percent' | 'fixed';
                  setDepositType(next);
                  if (next !== 'none' && (!depositValue || Number(depositValue) <= 0)) {
                    setDepositValue('30');
                  }
                }}
                className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
              >
                <option value="none">No deposit required</option>
                <option value="percent">Percentage of quotation total</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>

            {depositType !== 'none' ? (
              <label className="block sm:col-span-2">
                <Label>
                  {depositType === 'percent'
                    ? 'Deposit percentage (%)'
                    : 'Deposit amount'}
                </Label>
                <input
                  type="number"
                  min="0.01"
                  max={depositType === 'percent' ? 100 : undefined}
                  step="0.01"
                  value={depositValue}
                  required
                  onChange={(event) => setDepositValue(event.target.value)}
                  aria-label="Deposit value"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
                <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                  {depositComputed > 0
                    ? `Computed deposit: ${formatMoney(depositComputed, currency)}. `
                    : ''}
                  Calculated from the final quotation total and carried to the sales
                  order. Payments are recorded through SaMi Invoicing.
                </span>
              </label>
            ) : null}

            <Input
              label="Currency"
              value={currency}
              onChange={(value) => setCurrency(value.toUpperCase().slice(0, 3))}
              required
            />

            {needsExchangeRate ? (
              <>
                <Input
                  label={'Manual FX rate to ' + data.company.currency}
                  type="number"
                  value={manualExchangeRate}
                  onChange={setManualExchangeRate}
                  error={
                    exchangeRateInvalid && manualExchangeRate
                      ? 'Must be greater than zero.'
                      : undefined
                  }
                />
                <span
                  className={`mt-1 block text-[10px] ${
                    exchangeRateInvalid
                      ? 'font-bold text-amber-700 dark:text-amber-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Required before saving when the quotation currency differs from the
                  company currency ({data.company.currency}).
                </span>
              </>
            ) : null}

            <Input label="Reference" value={reference} onChange={setReference} />

            {data.capabilities.canViewPricing && data.pricelists.length > 0 ? (
              <label className="sm:col-span-2">
                <Label>Pricelist</Label>
                <select
                  value={pricelistId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPricelistId(next);
                    const selected = data.pricelists.find((item) => item.id === next);
                    if (selected) setCurrency(selected.currency);
                  }}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">Standard prices</option>
                  {data.pricelists
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.code ? ' · ' + item.code : ''}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Matching quantity and product rules are recalculated securely when the
                  quotation is saved.
                </p>
              </label>
            ) : null}

            {data.templates.length > 0 ? (
              <label className="sm:col-span-2">
                <Label>Template</Label>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  {data.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? ' · Default' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>
      </div>

      {/* -------- Lines -------- */}
      <section className="overflow-hidden rounded-[22px] border border-[var(--sami-border)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
              <Package className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-sm font-black">Products & services</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Catalog-linked or custom commercial lines.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLines((current) => [...current, blankLine()])}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
          >
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>

        <div className="space-y-3 p-4">
          {lines.map((line, index) => {
            const parts = lineSubtotal(line);
            return (
              <div
                key={line.key}
                className="rounded-2xl border border-[var(--sami-border)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black">Line {index + 1}</p>
                    {line.catalogItemId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Catalog
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Calculator className="h-3 w-3" />
                      {formatMoney(parts.base, currency)}
                      {parts.discount > 0 ? (
                        <>
                          {' '}
                          − {formatMoney(parts.discount, currency)}
                        </>
                      ) : null}
                    </span>
                  </div>

                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-500/30 px-2 text-[11px] font-black text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {data.capabilities.canUseCatalog && data.catalogItems.length > 0 ? (
                    <label className="md:col-span-2">
                      <Label>Catalog item</Label>
                      <select
                        value={line.catalogItemId}
                        onChange={(event) => selectCatalog(index, event.target.value)}
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      >
                        <option value="">Custom line</option>
                        {data.catalogItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="md:col-span-2">
                    <Input
                      label="Description"
                      value={line.description}
                      onChange={(value) => patchLine(index, { description: value })}
                      required
                    />
                  </div>

                  <Input
                    label="Quantity"
                    type="number"
                    value={line.quantity}
                    onChange={(value) => patchLine(index, { quantity: value })}
                  />

                  <Input
                    label="Unit"
                    value={line.unit}
                    onChange={(value) => patchLine(index, { unit: value })}
                    disabled={Boolean(line.catalogItemId)}
                  />

                  <Input
                    label="Unit price"
                    type="number"
                    value={line.unitPrice}
                    onChange={(value) => patchLine(index, { unitPrice: value })}
                  />

                  {data.capabilities.canManageMargin ? (
                    <Input
                      label="Unit cost"
                      type="number"
                      value={line.unitCost}
                      onChange={(value) => patchLine(index, { unitCost: value })}
                    />
                  ) : null}

                  <Input
                    label="Tax %"
                    type="number"
                    value={line.taxRate}
                    onChange={(value) => patchLine(index, { taxRate: value })}
                    disabled={Boolean(line.catalogItemId)}
                  />

                  <label>
                    <Label>Discount</Label>
                    <div className="mt-1 flex">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.discountValue}
                        onChange={(event) =>
                          patchLine(index, { discountValue: event.target.value })
                        }
                        className="h-11 min-w-0 flex-1 rounded-l-xl border border-r-0 border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      />
                      <select
                        value={line.discountType}
                        onChange={(event) =>
                          patchLine(index, {
                            discountType:
                              event.target.value === 'fixed' ? 'fixed' : 'percent',
                          })
                        }
                        className="h-11 rounded-r-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs font-black"
                      >
                        <option value="percent">%</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </div>
                  </label>

                  <Input
                    label="SKU"
                    value={line.sku}
                    onChange={(value) => patchLine(index, { sku: value })}
                    disabled={Boolean(line.catalogItemId)}
                  />

                  <Input
                    label="Tax name"
                    value={line.taxName}
                    onChange={(value) => patchLine(index, { taxName: value })}
                    disabled={Boolean(line.catalogItemId)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------- Notes + summary -------- */}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Area label="Customer notes" value={notes} onChange={setNotes} />
            <Area label="Terms & conditions" value={terms} onChange={setTerms} />
            <div className="sm:col-span-2">
              <Area
                label="Internal notes"
                value={internalNotes}
                onChange={setInternalNotes}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-[var(--sami-border)] p-4">
          <p className="text-sm font-black">Commercial summary</p>

          <div className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
            <Row label="Discount" value={'− ' + formatMoney(totals.discount, currency)} />
            <Row label="Tax" value={formatMoney(totals.tax, currency)} />

            {data.capabilities.canViewMargin ? (
              <>
                <Row label="Estimated cost" value={formatMoney(totals.cost, currency)} />
                <Row
                  label="Estimated margin"
                  value={
                    formatMoney(totals.margin, currency) +
                    ' · ' +
                    totals.marginPercent.toFixed(1) +
                    '%'
                  }
                />
              </>
            ) : null}

            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Shipping</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={shippingTotal}
                onChange={(event) => setShippingTotal(event.target.value)}
                className="h-9 w-32 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-right"
              />
            </label>

            {depositComputed > 0 ? (
              <Row
                label="Deposit due"
                value={formatMoney(depositComputed, currency)}
              />
            ) : null}

            <div className="flex items-center justify-between border-t border-[var(--sami-border)] pt-3">
              <span className="font-black">Total</span>
              <span className="text-lg font-black text-blue-700 dark:text-blue-300">
                {formatMoney(totals.total, currency)}
              </span>
            </div>
          </div>

          {submitError ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          ) : (
            <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              Rules are recalculated server-side when the quotation is saved.
            </p>
          )}
        </section>
      </div>

      {/* -------- Actions -------- */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-xl border border-[var(--sami-border)] px-5 text-sm font-black"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-60"
        >
          {initialQuote ? 'Save quotation' : 'Create quotation'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {children}
    </span>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  disabled = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <Label>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <input
        type={type}
        value={value}
        required={required}
        disabled={disabled}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? '0.01' : undefined}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        className={
          'mt-1 h-11 w-full rounded-xl border bg-transparent px-3 text-sm ' +
          (error
            ? 'border-red-400 ring-1 ring-red-400/40'
            : 'border-[var(--sami-border)]') +
          (disabled ? ' cursor-not-allowed opacity-60' : '')
        }
      />
      {error ? (
        <span className="mt-1 block text-[10px] font-bold text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}