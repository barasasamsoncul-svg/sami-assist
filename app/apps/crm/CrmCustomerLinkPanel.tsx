'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Link2,
  RefreshCw,
  UsersRound,
} from 'lucide-react';

type CrmAccountLink = {
  id: string;
  account_name: string;
  account_type: string;
  lifecycle_stage: string;
  invoicing_customer_id: string | null;
  linked_customer_name: string | null;
  linked_customer_status: string | null;
  linked_customer_deleted: boolean;
};

type BillingCustomerOption = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  currency?: string | null;
  status?: string | null;
};

type CrmCustomerLinkResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  accounts?: CrmAccountLink[];
  accountsTruncated?: boolean;
  customers?: BillingCustomerOption[];
};

export default function CrmCustomerLinkPanel({
  enabled,
}: {
  enabled: boolean;
}) {
  const [accounts, setAccounts] = useState<CrmAccountLink[]>([]);
  const [customers, setCustomers] = useState<BillingCustomerOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [accountsTruncated, setAccountsTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (searchTerm: string, signal?: AbortSignal) => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/apps/crm/customer-links?search=' + encodeURIComponent(searchTerm),
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal,
        },
      );
      const payload = await response.json() as CrmCustomerLinkResponse;

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'CRM billing-customer links could not be loaded.');
      }

      const nextAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
      setAccounts(nextAccounts);
      setCustomers(Array.isArray(payload.customers) ? payload.customers : []);
      setAccountsTruncated(payload.accountsTruncated === true);
      setSelectedAccountId((current) => {
        if (nextAccounts.some((account) => account.id === current)) return current;
        return (nextAccounts.find((account) => !account.invoicing_customer_id) || nextAccounts[0])?.id || '';
      });
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) return;
      setError(cause instanceof Error ? cause.message : 'CRM billing-customer links could not be loaded.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(customerSearch, controller.signal);
    return () => controller.abort();
  }, [enabled, customerSearch, load]);

  const activeAccount = accounts.find((account) => account.id === selectedAccountId) || null;

  useEffect(() => {
    setSelectedCustomerId(activeAccount?.invoicing_customer_id || '');
  }, [selectedAccountId, accounts, activeAccount?.invoicing_customer_id]);

  const customerOptions = useMemo(() => {
    const options = [...customers];
    if (
      activeAccount?.invoicing_customer_id &&
      !options.some((customer) => customer.id === activeAccount.invoicing_customer_id)
    ) {
      options.unshift({
        id: activeAccount.invoicing_customer_id,
        name: activeAccount.linked_customer_name || 'Currently linked billing customer',
        status: activeAccount.linked_customer_status || 'unknown',
      });
    }
    return options;
  }, [activeAccount, customers]);

  const saveLink = useCallback(async (customerId: string | null) => {
    if (!activeAccount) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/apps/crm/customer-links', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: activeAccount.id,
          customerId,
        }),
      });
      const payload = await response.json() as CrmCustomerLinkResponse;

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'SaMi could not update this customer link.');
      }

      setNotice(
        customerId
          ? 'CRM account linked to the existing billing customer.'
          : 'The billing-customer link was removed. Neither record was deleted.',
      );
      await load(customerSearch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SaMi could not update this customer link.');
    } finally {
      setSaving(false);
    }
  }, [activeAccount, customerSearch, load]);

  if (!enabled) {
    return (
      <section
        aria-label="CRM and Invoicing customer integration"
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="text-sm font-semibold text-slate-900">Billing-customer links</p>
        <p className="mt-1 text-sm text-slate-600">
          Enable SaMi Invoicing and grant customer-view access to link CRM accounts to existing billing customers.
          This control does not create duplicate billing customers.
        </p>
      </section>
    );
  }

  const currentLinkText = !activeAccount?.invoicing_customer_id
    ? 'No billing-customer link yet.'
    : activeAccount.linked_customer_deleted
      ? 'The linked billing customer is deleted. Unlink it or choose another active customer.'
      : activeAccount.linked_customer_status && activeAccount.linked_customer_status !== 'active'
        ? 'Linked billing customer is ' + activeAccount.linked_customer_status + '.'
        : 'Linked to ' + (activeAccount.linked_customer_name || 'an existing billing customer') + '.';

  const alreadyLinked =
    Boolean(activeAccount?.invoicing_customer_id) &&
    activeAccount?.invoicing_customer_id === selectedCustomerId;

  return (
    <section
      aria-label="CRM and Invoicing customer integration"
      className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Shared customer master
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">CRM account links</h2>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
              Existing records only
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Link a CRM account to a customer already managed by SaMi Invoicing. Linking does not create a new customer,
            copy billing details, or change Sales quotations and orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(customerSearch)}
          disabled={loading}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>

      {error ? (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Customer linking is unavailable</p>
          <p className="mt-1">{error}</p>
          <button type="button" onClick={() => void load(customerSearch)} className="mt-3 font-semibold underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="crm-link-account" className="mb-1.5 block text-sm font-semibold text-slate-800">
            CRM account
          </label>
          <select
            id="crm-link-account"
            value={selectedAccountId}
            onChange={(event) => {
              setSelectedAccountId(event.target.value);
              setNotice(null);
            }}
            disabled={loading || accounts.length === 0}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-50"
          >
            {accounts.length === 0 ? <option value="">No CRM accounts available</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name + (account.invoicing_customer_id ? ' · linked' : ' · not linked')}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-slate-600">{currentLinkText}</p>
        </div>

        <div>
          <label htmlFor="crm-link-customer-search" className="mb-1.5 block text-sm font-semibold text-slate-800">
            Find an existing billing customer
          </label>
          <input
            id="crm-link-customer-search"
            type="search"
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            placeholder="Search customer name, email or phone"
            maxLength={100}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <label htmlFor="crm-link-customer" className="mb-1.5 mt-3 block text-sm font-semibold text-slate-800">
            Billing customer
          </label>
          <select
            id="crm-link-customer"
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            disabled={loading || customerOptions.length === 0}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-50"
          >
            <option value="">Choose a customer</option>
            {customerOptions.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name + (customer.email ? ' · ' + customer.email : '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <UsersRound className="h-4 w-4" />
          <span>
            {accountsTruncated
              ? 'Showing the first 200 CRM accounts. Use the Accounts register for the full list.'
              : accounts.length + ' CRM account' + (accounts.length === 1 ? '' : 's') + ' in this workspace.'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveLink(selectedCustomerId)}
            disabled={!activeAccount || !selectedCustomerId || alreadyLinked || saving || loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            {alreadyLinked ? 'Already linked' : 'Link customer'}
          </button>
          <button
            type="button"
            onClick={() => void saveLink(null)}
            disabled={!activeAccount?.invoicing_customer_id || saving || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
      </div>
    </section>
  );
}
