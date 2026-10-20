'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Building2, CalendarClock, CircleAlert, FileText, Phone, RefreshCw, UsersRound } from 'lucide-react';

type Account = {
  id: string;
  account_name: string;
  account_type: string;
  lifecycle_stage: string;
  source: string | null;
  website: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  invoicing_customer_id: string | null;
  employee_count: number | null;
  annual_revenue: string | number | null;
  owner_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contact_role: string;
  preferred_channel: string;
  is_primary: boolean;
  do_not_contact: boolean;
};
type Interaction = {
  id: string;
  interaction_type: string;
  subject: string;
  description: string | null;
  status: string;
  occurred_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
};
type SalesLead = { id: string; name?: string | null; company_name?: string | null; status?: string | null; contact_name?: string | null };
type SalesOpportunity = { id: string; name?: string | null; customer_name?: string | null; stage_name?: string | null; stage_type?: string | null; expected_value?: number | string | null; currency?: string | null; probability?: number | string | null };
type BillingLink = { id: string; invoicing_customer_id: string | null; linked_customer_name: string | null; linked_customer_status: string | null; linked_customer_deleted: boolean };
type Payload = { success?: boolean; error?: string; account?: Account; contacts?: Contact[] };
type SalesPayload = { success?: boolean; error?: string; pipeline?: { leads?: SalesLead[]; opportunities?: SalesOpportunity[] } };
type CustomerPayload = { success?: boolean; error?: string; accounts?: BillingLink[] };

function label(value: string | null | undefined) {
  if (!value) return 'Not set';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function date(value: string | null | undefined) {
  if (!value) return 'No date recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'No date recorded' : parsed.toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function matchesAccount(value: string | null | undefined, account: Account) {
  const target = account.account_name.trim().toLowerCase();
  return Boolean(value && target && value.trim().toLowerCase() === target);
}

export default function CrmAccount360Panel({
  accountId,
  salesEnabled,
  invoicingEnabled,
  canCreateInteraction,
}: {
  accountId: string;
  salesEnabled: boolean;
  invoicingEnabled: boolean;
  canCreateInteraction: boolean;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [salesLeads, setSalesLeads] = useState<SalesLead[]>([]);
  const [salesOpportunities, setSalesOpportunities] = useState<SalesOpportunity[]>([]);
  const [billingLink, setBillingLink] = useState<BillingLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setTimelineError(null);
    setSalesError(null);
    setBillingError(null);

    const requests: Promise<void>[] = [
      fetch('/api/apps/crm/accounts/' + encodeURIComponent(accountId), { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(async (response) => {
          const payload = await response.json() as Payload;
          if (!response.ok || payload.success !== true || !payload.account) throw new Error(payload.error || 'Account profile could not be loaded.');
          setAccount(payload.account);
          setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Account profile could not be loaded.')),
      fetch('/api/apps/crm/interactions?accountId=' + encodeURIComponent(accountId), { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(async (response) => {
          const payload = await response.json() as { success?: boolean; error?: string; interactions?: Interaction[] };
          if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Relationship history could not be loaded.');
          setInteractions(Array.isArray(payload.interactions) ? payload.interactions : []);
        })
        .catch((cause) => setTimelineError(cause instanceof Error ? cause.message : 'Relationship history could not be loaded.')),
    ];

    if (salesEnabled) {
      requests.push(
        fetch('/api/apps/sales?pipeline=1', { cache: 'no-store', headers: { Accept: 'application/json' } })
          .then(async (response) => {
            const payload = await response.json() as SalesPayload;
            if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Sales records could not be loaded.');
            setSalesLeads(Array.isArray(payload.pipeline?.leads) ? payload.pipeline.leads : []);
            setSalesOpportunities(Array.isArray(payload.pipeline?.opportunities) ? payload.pipeline.opportunities : []);
          })
          .catch((cause) => setSalesError(cause instanceof Error ? cause.message : 'Sales records could not be loaded.')),
      );
    } else {
      setSalesLeads([]);
      setSalesOpportunities([]);
    }

    if (invoicingEnabled) {
      requests.push(
        fetch('/api/apps/crm/customer-links?accountId=' + encodeURIComponent(accountId), { cache: 'no-store', headers: { Accept: 'application/json' } })
          .then(async (response) => {
            const payload = await response.json() as CustomerPayload;
            if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Billing link details are unavailable to this user.');
            setBillingLink(payload.accounts?.[0] || null);
          })
          .catch((cause) => setBillingError(cause instanceof Error ? cause.message : 'Billing link details are unavailable.')),
      );
    } else {
      setBillingLink(null);
    }

    await Promise.all(requests);
    setLoading(false);
    setRefreshing(false);
  }, [accountId, salesEnabled, invoicingEnabled]);

  useEffect(() => { void load(); }, [load]);

  const filteredLeads = useMemo(() => account ? salesLeads.filter((lead) => matchesAccount(lead.company_name, account) || matchesAccount(lead.name, account)) : [], [salesLeads, account]);
  const filteredOpportunities = useMemo(() => account ? salesOpportunities.filter((item) => matchesAccount(item.customer_name, account) || matchesAccount(item.name, account)) : [], [salesOpportunities, account]);
  const metrics = [
    { label: 'Contacts', value: String(contacts.length), detail: 'Associated people' },
    { label: 'Interactions', value: String(interactions.length), detail: 'CRM relationship events' },
    { label: 'Sales leads', value: String(filteredLeads.length), detail: 'Matching account name' },
    { label: 'Opportunities', value: String(filteredOpportunities.length), detail: 'Matching customer name' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/apps/crm/crm_accounts" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5" /> Back to Accounts</Link>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Customer 360 profile</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{account?.account_name || (loading ? 'Loading account…' : 'Account unavailable')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Account details, contacts, relationship history, linked billing identity and matching Sales records in one view.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={refreshing} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm font-bold transition hover:bg-[var(--sami-surface-soft)] disabled:opacity-60"><RefreshCw className={'h-4 w-4 ' + (refreshing ? 'animate-spin' : '')} /> Refresh</button>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><p className="font-bold">Profile unavailable</p><p className="mt-1">{error}</p></div> : null}
      {loading && !account ? <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)]" />)}</div> : null}

      {account ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => <section key={metric.label} className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)]"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{metric.label}</p><p className="mt-2 text-2xl font-black tabular-nums">{metric.value}</p><p className="mt-1 text-xs text-slate-500">{metric.detail}</p></section>)}
          </div>

          <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Account overview</h2><span className="ml-auto rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-bold">{label(account.lifecycle_stage)}</span></div>
            <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Account type" value={label(account.account_type)} />
              <Field label="Industry" value={account.industry} />
              <Field label="Source" value={account.source} />
              <Field label="Email" value={account.email} />
              <Field label="Phone" value={account.phone} />
              <Field label="Website" value={account.website} href={account.website} />
              <Field label="Employees" value={account.employee_count === null ? null : String(account.employee_count)} />
              <Field label="Annual revenue" value={account.annual_revenue === null ? null : Number(account.annual_revenue).toLocaleString('en-KE')} />
              <Field label="Last updated" value={date(account.updated_at)} />
            </div>
            {account.notes ? <div className="mt-4 border-t border-[var(--sami-border)] pt-4"><p className="text-xs font-bold text-slate-500">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{account.notes}</p></div> : null}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
              <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Contacts</h2><span className="ml-auto text-xs font-bold text-slate-500">{contacts.length}</span></div>
              {contacts.length === 0 ? <Empty text="No contacts are associated with this account yet." /> : <div className="mt-3 divide-y divide-[var(--sami-border)]">{contacts.map((contact) => <article key={contact.id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{[contact.first_name, contact.last_name].filter(Boolean).join(' ')}</p>{contact.is_primary ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">Primary</span> : null}{contact.do_not_contact ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Do not contact</span> : null}</div><p className="mt-1 text-xs text-slate-500">{contact.job_title || 'Role not set'}{contact.department ? ' · ' + contact.department : ''} · {label(contact.contact_role)}</p><p className="mt-1 break-words text-xs text-slate-600">{contact.email || 'No email'}{contact.phone || contact.mobile ? ' · ' + (contact.phone || contact.mobile) : ''}</p></article>)}</div>}
              <Link href="/apps/crm/crm_contacts" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">Open Contacts register <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </section>

            <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
              <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Relationship history</h2><span className="ml-auto text-xs font-bold text-slate-500">{interactions.length}</span></div>
              {timelineError ? <Notice text={timelineError} /> : interactions.length === 0 ? <Empty text="No relationship activity has been recorded for this account." /> : <div className="mt-3 space-y-3">{interactions.slice(0, 12).map((item) => <article key={item.id} className="relative border-l-2 border-blue-100 pl-3"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{item.subject}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{label(item.interaction_type)} · {label(item.status)}</span></div><p className="mt-1 text-xs text-slate-500">{date(item.due_at || item.occurred_at || item.completed_at)}{item.contact_first_name ? ' · ' + [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') : ''}</p>{item.description || item.outcome ? <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{item.description || item.outcome}</p> : null}</article>)}</div>}
              {canCreateInteraction ? <Link href="/apps/crm/crm_interactions" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">Open interaction register <ArrowUpRight className="h-3.5 w-3.5" /></Link> : null}
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Sales relationship</h2><span className="ml-auto rounded-full border border-[var(--sami-border)] px-2 py-0.5 text-[10px] font-bold">Read-only</span></div>
              {salesError ? <Notice text={salesError} /> : !salesEnabled ? <Empty text="Sales is not enabled for this workspace." /> : filteredLeads.length === 0 && filteredOpportunities.length === 0 ? <Empty text="No Sales leads or opportunities matched this account name. Name-based matching is indicative, not a guaranteed record link." /> : <div className="mt-3 space-y-3">{filteredLeads.map((lead) => <article key={'lead-' + lead.id} className="rounded-xl border border-[var(--sami-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{lead.name || lead.company_name || 'Sales lead'}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold">{label(lead.status)}</span></div><p className="mt-1 text-xs text-slate-500">{lead.company_name || 'Company not set'}{lead.contact_name ? ' · ' + lead.contact_name : ''}</p></article>)}{filteredOpportunities.map((item) => <article key={'opportunity-' + item.id} className="rounded-xl border border-[var(--sami-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{item.name || 'Opportunity'}</p><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{item.stage_name || label(item.stage_type)}</span></div><p className="mt-1 text-xs text-slate-500">{item.customer_name || 'Customer not set'}{item.expected_value !== null && item.expected_value !== undefined ? ' · ' + String(item.currency || 'KES') + ' ' + Number(item.expected_value).toLocaleString('en-KE') : ''}</p></article>)}</div>}
              {salesEnabled ? <Link href="/apps/sales/pipeline" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">Open Sales pipeline <ArrowUpRight className="h-3.5 w-3.5" /></Link> : null}
            </section>

            <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Invoicing connection</h2></div>
              {billingError ? <Notice text={billingError} /> : !invoicingEnabled ? <Empty text="Invoicing is not enabled for this workspace." /> : billingLink?.invoicing_customer_id ? <div className="mt-3 rounded-xl border border-[var(--sami-border)] p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Existing billing customer</p><p className="mt-1 text-base font-black">{billingLink.linked_customer_name || 'Linked billing customer'}</p><p className="mt-2 text-xs text-slate-500">{billingLink.linked_customer_deleted ? 'Deleted billing record — review the link.' : 'Status: ' + label(billingLink.linked_customer_status)}</p><p className="mt-3 text-xs text-slate-500">CRM links to the shared customer master; it does not create a second billing identity.</p><Link href="/apps/invoicing/customers" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">Open Invoicing customers <ArrowUpRight className="h-3.5 w-3.5" /></Link></div> : <Empty text="This CRM account is not linked to an existing Invoicing customer yet." />}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Field({ label: fieldLabel, value, href }: { label: string; value: string | number | null | undefined; href?: string | null }) {
  const rendered = value === null || value === undefined || value === '' ? 'Not set' : String(value);
  return <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{fieldLabel}</p>{href && rendered !== 'Not set' ? <a href={/^https?:\/\//i.test(href) ? href : 'https://' + href} target="_blank" rel="noreferrer" className="mt-1 block break-words text-sm font-semibold text-blue-700 hover:underline">{rendered}</a> : <p className="mt-1 break-words text-sm font-semibold">{rendered}</p>}</div>;
}
function Notice({ text }: { text: string }) {
  return <div role="status" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><CircleAlert className="h-4 w-4 shrink-0" />{text}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="mt-3 rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">{text}</div>;
}
