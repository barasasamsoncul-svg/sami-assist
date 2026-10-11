'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

type PipelineStage = {
  id: string;
  name: string;
  stage_type: string;
};

type SalesLead = {
  id: string;
  lead_number: string;
  status: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  salesperson_user_id: string | null;
  sales_team_id?: string | null;
  territory_id?: string | null;
  disqualification_reason: string | null;
};

type Salesperson = { id: string; name: string; email: string };

type SalesLeadActivity = {
  id: string;
  lead_id: string;
  activity_type: 'call' | 'email' | 'meeting' | 'task' | 'note';
  subject: string;
  description: string | null;
  due_date: string | null;
  status: 'planned' | 'completed' | 'cancelled';
  assigned_user_id: string | null;
  completed_at: string | null;
  created_at: string;
};

type SalesOpportunity = {
  id: string;
  opportunity_number: string;
  stage_id: string;
  stage_type: string;
  stage_name: string;
  name: string;
  billing_customer_id: string | null;
  customer_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  expected_value: number | string;
  probability: number | string;
  expected_close_date: string | null;
  latest_quote_id: string | null;
};

type PipelineData = {
  stages: PipelineStage[];
  leads: SalesLead[];
  opportunities: SalesOpportunity[];
  activities: SalesLeadActivity[];
  salespeople: Salesperson[];
};

type PipelineAction =
  | { action: 'create_lead'; name: FormDataEntryValue | null; companyName: FormDataEntryValue | null; contactName: FormDataEntryValue | null; email: FormDataEntryValue | null; phone: FormDataEntryValue | null; source: FormDataEntryValue | null; salespersonUserId: FormDataEntryValue | null }
  | { action: 'update_lead'; leadId: string; name: string; companyName: string; contactName: string; email: string; phone: string; source: string; notes: string; salespersonUserId: string | null }
  | { action: 'disqualify_lead'; leadId: string; reason: string }
  | { action: 'reopen_lead'; leadId: string }
  | { action: 'create_lead_activity'; leadId: string; activityType: string; subject: string; description: string; dueDate: string | null; assignedUserId: string | null }
  | { action: 'update_lead_activity'; activityId: string; status: 'completed' | 'cancelled' }
  | { action: 'convert_lead'; leadId: string; name: string; expectedValue: string; currency: string; expectedCloseDate: string | null }
  | { action: 'move_opportunity'; opportunityId: string; stageId: string };

type QualificationDraft = {
  expectedValue: string;
  currency: string;
  expectedCloseDate: string;
};

type LeadDraft = {
  name: string; companyName: string; contactName: string; email: string;
  phone: string; source: string; notes: string; salespersonUserId: string;
};

type ActivityDraft = {
  activityType: 'call' | 'email' | 'meeting' | 'task' | 'note';
  subject: string; description: string; dueDate: string; assignedUserId: string;
};

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

function normalizedCurrency(value: string) {
  return value.trim().toUpperCase().slice(0, 3) || 'KES';
}

export default function SalesPipelineManager({
  canCreateQuote,
  canManagePipeline,
  defaultCurrency,
}: {
  canCreateQuote: boolean;
  canManagePipeline: boolean;
  defaultCurrency: string;
}) {
  const [data, setData] = useState<PipelineData>({
    stages: [], leads: [], opportunities: [], activities: [], salespeople: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qualifyingLeadId, setQualifyingLeadId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({ name: '', companyName: '', contactName: '', email: '', phone: '', source: '', notes: '', salespersonUserId: '' });
  const [disqualifyingLeadId, setDisqualifyingLeadId] = useState<string | null>(null);
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [activityLeadId, setActivityLeadId] = useState<string | null>(null);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>({ activityType: 'task', subject: '', description: '', dueDate: '', assignedUserId: '' });
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  const [qualification, setQualification] = useState<QualificationDraft>({
    expectedValue: '',
    currency: normalizedCurrency(defaultCurrency),
    expectedCloseDate: '',
  });

  const load = useCallback(async () => {
    const response = await fetch('/api/apps/sales?pipeline=1', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({})) as {
      pipeline?: PipelineData;
      error?: string;
    };
    if (!response.ok || !body.pipeline) {
      throw new Error(body.error || 'Could not load the Sales pipeline.');
    }
    setData(body.pipeline);
  }, []);

  useEffect(() => {
    void load().catch(caught => {
      setError(caught instanceof Error ? caught.message : 'Could not load the Sales pipeline.');
    });
  }, [load]);

  const filteredLeads = data.leads.filter(lead => {
    const search = leadSearch.trim().toLowerCase();
    const matchesStatus = leadStatusFilter === 'all' || lead.status === leadStatusFilter;
    const matchesSearch = !search || [
      lead.name, lead.lead_number, lead.company_name, lead.contact_name,
      lead.email, lead.phone, lead.source, lead.status,
      data.salespeople.find(person => person.id === lead.salesperson_user_id)?.name,
    ].some(value => String(value || '').toLowerCase().includes(search));
    return matchesStatus && matchesSearch;
  });

  async function action(payload: PipelineAction): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Sales action failed.');
      }
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sales action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function beginQualification(leadId: string) {
    setQualifyingLeadId(leadId);
    setQualification({
      expectedValue: '',
      currency: normalizedCurrency(defaultCurrency),
      expectedCloseDate: '',
    });
    setError('');
  }

  async function qualifyLead(event: FormEvent<HTMLFormElement>, lead: SalesLead) {
    event.preventDefault();
    const succeeded = await action({
      action: 'convert_lead',
      leadId: lead.id,
      name: lead.name,
      expectedValue: qualification.expectedValue,
      currency: normalizedCurrency(qualification.currency),
      expectedCloseDate: qualification.expectedCloseDate || null,
    });
    if (succeeded) {
      setQualifyingLeadId(null);
    }
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const succeeded = await action({
      action: 'create_lead',
      name: formData.get('name'),
      companyName: formData.get('companyName'),
      contactName: formData.get('contactName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      source: formData.get('source'),
    });
    if (succeeded) form.reset();
  }

  return (
    <div className="space-y-5">
      <header className="sami-surface rounded-[24px] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          Roadmap Part 11
        </p>
        <h2 className="mt-1 text-xl font-black">Leads &amp; Opportunities</h2>
        <p className="mt-1 text-sm text-slate-500">
          Qualify prospects with realistic deal value and expected close dates, then create a quotation without losing customer context.
        </p>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {canManagePipeline ? (
        <form
          className="sami-surface grid gap-3 rounded-[24px] p-5 md:grid-cols-2"
          onSubmit={createLead}
        >
          <h3 className="font-black md:col-span-2">Capture lead</h3>
          {['name', 'companyName', 'contactName', 'email', 'phone', 'source'].map(field => (
            <label key={field} className="space-y-1 text-xs font-bold text-slate-500">
              <span>
                {field.replace(/[A-Z]/g, match => ' ' + match).replace(/^./, match => match.toUpperCase())}
                {field === 'name' ? ' (required)' : ''}
              </span>
              <input
                name={field}
                type={field === 'email' ? 'email' : 'text'}
                required={field === 'name'}
                autoComplete={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'off'}
                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-xl border border-[var(--sami-border)] px-4 text-sm font-black disabled:opacity-60 md:col-span-2"
          >
            {busy ? 'Saving…' : 'Create lead'}
          </button>
        </form>
      ) : (
        <p className="rounded-xl border border-[var(--sami-border)] p-4 text-sm text-slate-500">
          You have read-only access to leads and opportunities. Pipeline changes require management permission.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sami-surface min-w-0 rounded-[24px] p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-black">Leads</h3>
            <span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-black text-slate-500">
              {data.leads.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {data.leads.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">
                No leads yet. Capture a prospect above to start the qualification process.
              </p>
            ) : data.leads.map(lead => (
              <article key={lead.id} className="rounded-xl border border-[var(--sami-border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black">{lead.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {lead.lead_number} · {lead.status} · {lead.source || 'Direct'}
                    </p>
                    {lead.company_name || lead.contact_name ? (
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {lead.company_name || lead.contact_name}
                        {lead.email ? ' · ' + lead.email : ''}
                      </p>
                    ) : null}
                  </div>
                  {canManagePipeline && lead.status !== 'converted' && lead.status !== 'disqualified' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => beginQualification(lead.id)}
                      className="shrink-0 text-xs font-black text-blue-600 hover:underline disabled:opacity-60"
                    >
                      Qualify →
                    </button>
                  ) : null}
                </div>

                {qualifyingLeadId === lead.id ? (
                  <form onSubmit={event => void qualifyLead(event, lead)} className="mt-4 space-y-3 rounded-xl bg-slate-500/[0.04] p-3">
                    <div>
                      <h4 className="text-sm font-black">Qualify {lead.name}</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Add a realistic expected deal value. Enter 0 when revenue is not known yet.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs font-bold text-slate-500">
                        <span>Expected deal value</span>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={qualification.expectedValue}
                          onChange={event => setQualification(current => ({ ...current, expectedValue: event.target.value }))}
                          className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-bold text-slate-500">
                        <span>Currency (3 letters)</span>
                        <input
                          type="text"
                          required
                          minLength={3}
                          maxLength={3}
                          pattern="[A-Za-z]{3}"
                          autoCapitalize="characters"
                          value={qualification.currency}
                          onChange={event => setQualification(current => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))}
                          className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal uppercase text-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                        <span>Expected close date (optional)</span>
                        <input
                          type="date"
                          value={qualification.expectedCloseDate}
                          onChange={event => setQualification(current => ({ ...current, expectedCloseDate: event.target.value }))}
                          className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy || qualification.expectedValue.trim() === ''}
                        className="h-10 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60"
                      >
                        {busy ? 'Qualifying…' : 'Qualify lead'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setQualifyingLeadId(null)}
                        className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="sami-surface min-w-0 rounded-[24px] p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-black">Opportunity pipeline</h3>
            <span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-black text-slate-500">
              {data.opportunities.length}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {data.opportunities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">
                No opportunities yet. Qualify a lead to create the first pipeline opportunity.
              </p>
            ) : data.opportunities.map(opportunity => (
              <article key={opportunity.id} className="rounded-xl border border-[var(--sami-border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black">{opportunity.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {opportunity.opportunity_number} · {opportunity.stage_name} · {opportunity.probability}%
                    </p>
                    <p className="mt-1 break-words text-sm font-black tabular-nums">
                      {formatMoney(Number(opportunity.expected_value || 0), opportunity.currency || defaultCurrency)}
                    </p>
                    {opportunity.expected_close_date ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Expected close: {String(opportunity.expected_close_date).slice(0, 10)}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Expected close date not set
                      </p>
                    )}
                    {opportunity.customer_name || opportunity.contact_name ? (
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {opportunity.customer_name || opportunity.contact_name}
                        {opportunity.email ? ' · ' + opportunity.email : ''}
                      </p>
                    ) : null}
                  </div>
                  <select
                    aria-label={'Stage for ' + opportunity.name}
                    value={opportunity.stage_id}
                    disabled={busy || !canManagePipeline}
                    onChange={event => void action({
                      action: 'move_opportunity',
                      opportunityId: opportunity.id,
                      stageId: event.target.value,
                    })}
                    className="max-w-[8rem] rounded-lg border border-[var(--sami-border)] bg-transparent p-2 text-xs"
                  >
                    {data.stages.map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.name}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-black">
                  {opportunity.stage_type === 'lost' ? (
                    <span className="text-slate-400">Lost opportunity</span>
                  ) : canCreateQuote ? (
                    <Link
                      href={'/apps/sales/quotes/new?opportunityId=' + encodeURIComponent(opportunity.id)}
                      className="text-blue-600 hover:underline"
                    >
                      Create quotation →
                    </Link>
                  ) : null}
                  {opportunity.latest_quote_id ? (
                    <Link
                      href={'/apps/sales/quotes/' + encodeURIComponent(opportunity.latest_quote_id)}
                      className="text-slate-600 hover:underline"
                    >
                      Open latest quotation
                    </Link>
                  ) : (
                    <span className="text-slate-400">No quotation yet</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
