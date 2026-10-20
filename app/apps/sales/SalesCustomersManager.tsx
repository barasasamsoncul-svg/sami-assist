'use client';

import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Customer = SalesWorkspaceData['billingCustomers'][number];

type CustomerDraft = {
  customerId: string;
  customerType: string;
  name: string;
  legalName: string;
  contactName: string;
  email: string;
  phone: string;
  taxId: string;
  registrationNumber: string;
  billingAddress: string;
  shippingAddress: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  currency: string;
  creditLimit: string;
  notes: string;
};

const CUSTOMER_TYPES: Array<[string, string]> = [
  ['company', 'Company'],
  ['individual', 'Individual'],
  ['government', 'Government'],
  ['non_profit', 'Non-profit'],
];

function emptyDraft(currency: string): CustomerDraft {
  return {
    customerId: '',
    customerType: 'company',
    name: '',
    legalName: '',
    contactName: '',
    email: '',
    phone: '',
    taxId: '',
    registrationNumber: '',
    billingAddress: '',
    shippingAddress: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    countryCode: '',
    currency,
    creditLimit: '',
    notes: '',
  };
}

function fromCustomer(customer: Customer): CustomerDraft {
  return {
    customerId: customer.id,
    customerType: customer.customerType,
    name: customer.name,
    legalName: customer.legalName || '',
    contactName: customer.contactName || '',
    email: customer.email || '',
    phone: customer.phone || '',
    taxId: customer.taxId || '',
    registrationNumber: customer.registrationNumber || '',
    billingAddress: customer.billingAddress || '',
    shippingAddress: customer.shippingAddress || '',
    city: customer.city || '',
    state: customer.state || '',
    postalCode: customer.postalCode || '',
    country: customer.country || '',
    countryCode: customer.countryCode || '',
    currency: customer.currency,
    creditLimit: customer.creditLimit === null ? '' : String(customer.creditLimit),
    notes: customer.notes || '',
  };
}

function draftToCustomer(draft: CustomerDraft, id: string, previous?: Customer): Customer {
  return {
    id,
    customerType: draft.customerType,
    name: draft.name.trim(),
    legalName: draft.legalName.trim() || null,
    contactName: draft.contactName.trim() || null,
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    taxId: draft.taxId.trim() || null,
    registrationNumber: draft.registrationNumber.trim() || null,
    billingAddress: draft.billingAddress.trim() || null,
    shippingAddress: draft.shippingAddress.trim() || null,
    city: draft.city.trim() || null,
    state: draft.state.trim() || null,
    postalCode: draft.postalCode.trim() || null,
    country: draft.country.trim() || null,
    countryCode: draft.countryCode.trim().toUpperCase() || null,
    currency: draft.currency.trim().toUpperCase(),
    creditLimit: draft.creditLimit.trim() ? Number(draft.creditLimit) : null,
    notes: draft.notes.trim() || null,
    status: previous?.status || 'active',
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return '·';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '·';
}

function statusTone(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'inactive':
      return 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
    case 'blocked':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300';
  }
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export default function SalesCustomersManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const [customers, setCustomers] = useState(data.billingCustomers);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<CustomerDraft>(
    emptyDraft(data.company.currency || 'KES'),
  );
  const [editing, setEditing] = useState(false);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) =>
      [
        customer.name,
        customer.legalName,
        customer.contactName,
        customer.email,
        customer.phone,
        customer.taxId,
        customer.registrationNumber,
        customer.city,
        customer.country,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [customers, search]);

  const activeCount = customers.filter((customer) => customer.status === 'active').length;

  function setField<K extends keyof CustomerDraft>(key: K, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setDraft(emptyDraft(data.company.currency || 'KES'));
    setEditing(false);
  }

  function edit(customer: Customer) {
    setDraft(fromCustomer(customer));
    setEditing(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      showError(
        'Customer name required',
        'Enter a customer or company name before saving.',
      );
      return;
    }

    try {
      const result = await request({
        action: editing ? 'update_customer' : 'create_customer',
        customerId: draft.customerId || undefined,
        customerType: draft.customerType,
        name: draft.name,
        legalName: draft.legalName,
        contactName: draft.contactName,
        email: draft.email,
        phone: draft.phone,
        taxId: draft.taxId,
        registrationNumber: draft.registrationNumber,
        billingAddress: draft.billingAddress,
        shippingAddress: draft.shippingAddress,
        city: draft.city,
        state: draft.state,
        postalCode: draft.postalCode,
        country: draft.country,
        countryCode: draft.countryCode,
        currency: draft.currency,
        creditLimit: draft.creditLimit,
        notes: draft.notes,
      });

      const id = String(result.id || draft.customerId || '');
      if (!id) {
        throw new Error('SaMi did not return the saved customer.');
      }

      setCustomers((current) => {
        const previous = current.find((customer) => customer.id === id);
        const next = draftToCustomer(draft, id, previous);
        return [next, ...current.filter((customer) => customer.id !== id)];
      });

      showSuccess(
        editing ? 'Customer updated' : 'Customer created',
        editing
          ? 'The Sales customer and primary contact were updated in the shared customer master.'
          : 'The Sales customer and primary contact are ready for quotations and invoicing.',
      );

      reset();
    } catch (error) {
      showError(
        editing ? 'Customer update failed' : 'Customer creation failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not save this customer.',
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                 */
  /* ------------------------------------------------------------------------ */

  const canManage = data.capabilities.canManageBillingCustomers;

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Sales · Customers &amp; contacts
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight">
            Customers &amp; contacts
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            The shared customer master used by quotations, sales orders,
            invoicing, payments and customer portal flows.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New customer
          </button>
        ) : null}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label="Customers"
          value={String(customers.length)}
          detail="Shared across Sales and Invoicing"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          label="Active"
          value={String(activeCount)}
          detail={`${customers.length - activeCount} inactive or blocked`}
        />
        <KpiCard
          icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
          label="Companies"
          value={String(
            customers.filter((customer) => customer.customerType === 'company').length,
          )}
          detail="Excludes individuals & government bodies"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Split: list + editor                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        {/* ---------------- Left: search + list ---------------- */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <label className="relative block">
              <span className="sr-only">Search customers</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers or contacts"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
              />
            </label>
          </div>

          <div className="max-h-[680px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div
                  aria-hidden="true"
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                >
                  <Users className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-black">No customers found</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {search
                    ? 'No customers match this search. Try another name, email, or phone.'
                    : 'No customers have been added yet.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {visible.map((customer) => {
                  const isEditing =
                    editing && customer.id === draft.customerId;
                  return (
                    <li
                      key={customer.id}
                      className={
                        isEditing
                          ? 'border-l-4 border-indigo-500 bg-indigo-50/50 dark:border-indigo-400 dark:bg-indigo-950/20'
                          : ''
                      }
                    >
                      <button
                        type="button"
                        onClick={() => edit(customer)}
                        className="group flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <span
                          aria-hidden="true"
                          className={
                            customer.customerType === 'individual'
                              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                              : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }
                        >
                          {customer.customerType === 'individual' ? (
                            <UserRound className="h-4 w-4" />
                          ) : (
                            <Building2 className="h-4 w-4" />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black">
                              {customer.name}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${statusTone(customer.status)}`}
                            >
                              {customer.status}
                            </span>
                          </div>

                          {customer.contactName ? (
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {customer.contactName}
                            </p>
                          ) : null}

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {customer.email ? (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" aria-hidden="true" />
                                {customer.email}
                              </span>
                            ) : null}
                            {customer.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" aria-hidden="true" />
                                {customer.phone}
                              </span>
                            ) : null}
                            {customer.city || customer.country ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {[customer.city, customer.country]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <span className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition group-hover:bg-slate-100 group-hover:text-slate-700 dark:group-hover:bg-slate-800 dark:group-hover:text-slate-200">
                          {isEditing ? (
                            <ChevronRight
                              className="h-3.5 w-3.5 rotate-180"
                              aria-hidden="true"
                            />
                          ) : (
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ---------------- Right: editor ---------------- */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-black">
                  {editing ? 'Edit customer' : 'New customer'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {editing
                    ? draft.name || 'Customer'
                    : 'Shared customer master'}
                </p>
              </div>
            </div>
            {editing ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          {!canManage ? (
            <div className="px-5 py-10 text-center">
              <div
                aria-hidden="true"
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              >
                <Users className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-black">View-only access</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                You can view Sales customers, but customer-management permission
                is required to create or edit the shared customer master.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              className="space-y-5 p-5"
            >
              {/* Identity */}
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Identity
                </h4>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    label="Customer name"
                    value={draft.name}
                    onChange={(value) => setField('name', value)}
                    required
                  />
                  <FieldSelect
                    label="Customer type"
                    value={draft.customerType}
                    onChange={(value) => setField('customerType', value)}
                    options={CUSTOMER_TYPES}
                  />
                  <FieldInput
                    label="Legal name"
                    value={draft.legalName}
                    onChange={(value) => setField('legalName', value)}
                  />
                  <FieldInput
                    label="Primary contact"
                    value={draft.contactName}
                    onChange={(value) => setField('contactName', value)}
                  />
                  <FieldInput
                    label="Email"
                    type="email"
                    value={draft.email}
                    onChange={(value) => setField('email', value)}
                  />
                  <FieldInput
                    label="Phone"
                    value={draft.phone}
                    onChange={(value) => setField('phone', value)}
                  />
                  <FieldInput
                    label="Tax ID"
                    value={draft.taxId}
                    onChange={(value) => setField('taxId', value)}
                  />
                  <FieldInput
                    label="Registration number"
                    value={draft.registrationNumber}
                    onChange={(value) => setField('registrationNumber', value)}
                  />
                </div>
              </section>

              {/* Commercial */}
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Commercial
                </h4>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    label="Currency"
                    value={draft.currency}
                    onChange={(value) => setField('currency', value.toUpperCase())}
                    maxLength={3}
                  />
                  <FieldInput
                    label="Credit limit"
                    type="number"
                    value={draft.creditLimit}
                    onChange={(value) => setField('creditLimit', value)}
                  />
                </div>
              </section>

              {/* Location */}
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Location
                </h4>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    label="City"
                    value={draft.city}
                    onChange={(value) => setField('city', value)}
                  />
                  <FieldInput
                    label="State / region"
                    value={draft.state}
                    onChange={(value) => setField('state', value)}
                  />
                  <FieldInput
                    label="Postal code"
                    value={draft.postalCode}
                    onChange={(value) => setField('postalCode', value)}
                  />
                  <FieldInput
                    label="Country"
                    value={draft.country}
                    onChange={(value) => setField('country', value)}
                  />
                  <FieldInput
                    label="Country code"
                    value={draft.countryCode}
                    onChange={(value) => setField('countryCode', value.toUpperCase())}
                    maxLength={2}
                  />
                </div>
              </section>

              {/* Addresses & notes */}
              <section>
                <h4 className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Addresses &amp; notes
                </h4>
                <div className="mt-2 space-y-3">
                  <FieldArea
                    label="Billing address"
                    value={draft.billingAddress}
                    onChange={(value) => setField('billingAddress', value)}
                  />
                  <FieldArea
                    label="Shipping address"
                    value={draft.shippingAddress}
                    onChange={(value) => setField('shippingAddress', value)}
                  />
                  <FieldArea
                    label="Notes"
                    value={draft.notes}
                    onChange={(value) => setField('notes', value)}
                  />
                </div>
              </section>

              {/* Footer actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {editing ? 'Save customer' : 'Create customer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldArea({
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
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <textarea
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}