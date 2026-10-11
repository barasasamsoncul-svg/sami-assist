'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  | { action: 'create_lead'; name: FormDataEntryValue | null; companyName: FormDataEntryValue | null; contactName: FormDataEntryValue | null; email: FormDataEntryValue | null; phone: FormDataEntryValue | null; source: FormDataEntryValue | null; salespersonUserId: FormDataEntryValue | null; confirmDuplicates?: boolean }
  | { action: 'update_lead'; leadId: string; name: string; companyName: string; contactName: string; email: string; phone: string; source: string; notes: string; salespersonUserId: string | null }
  | { action: 'disqualify_lead'; leadId: string; reason: string }
  | { action: 'reopen_lead'; leadId: string }
  | { action: 'create_lead_activity'; leadId: string; activityType: string; subject: string; description: string; dueDate: string | null; assignedUserId: string | null }
  | { action: 'update_lead_activity'; activityId: string; status: 'completed' | 'cancelled' }
  | { action: 'convert_lead'; leadId: string; name: string; expectedValue: string; currency: string; expectedCloseDate: string | null }
  | { action: 'move_opportunity'; opportunityId: string; stageId: string };

type CreateLeadPayload = Extract<PipelineAction, { action: 'create_lead' }>;

type LeadDuplicateMatch = {
  id: string;
  lead_number: string;
  status: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  salesperson_user_id: string | null;
  created_at: string;
  match_reason: 'email' | 'phone' | 'email_and_phone' | string;
};

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
  const [duplicateCandidates, setDuplicateCandidates] = useState<LeadDuplicateMatch[]>([]);
  const [pendingLeadPayload, setPendingLeadPayload] = useState<CreateLeadPayload | null>(null);
  const createLeadFormRef = useRef<HTMLFormElement | null>(null);
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
      const body = await response.json().catch(() => ({})) as {
        error?: string;
        code?: string;
        duplicates?: LeadDuplicateMatch[];
      };
      if (
        !response.ok &&
        payload.action === 'create_lead' &&
        body.code === 'LEAD_DUPLICATE_CONFIRMATION_REQUIRED' &&
        Array.isArray(body.duplicates)
      ) {
        setPendingLeadPayload(payload);
        setDuplicateCandidates(body.duplicates);
        setError('');
        return false;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Sales action failed.');
      }
      await load();
      if (payload.action === 'create_lead') {
        setPendingLeadPayload(null);
        setDuplicateCandidates([]);
      }
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
    setDuplicateCandidates([]);
    setPendingLeadPayload(null);
    const payload: CreateLeadPayload = {
      action: 'create_lead',
      name: formData.get('name'),
      companyName: formData.get('companyName'),
      contactName: formData.get('contactName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      source: formData.get('source'),
      salespersonUserId: formData.get('salespersonUserId'),
    };
    const succeeded = await action(payload);
    if (succeeded) form.reset();
  }

  async function confirmCreateLeadWithDuplicates() {
    if (!pendingLeadPayload) return;
    const succeeded = await action({
      ...pendingLeadPayload,
      confirmDuplicates: true,
    });
    if (succeeded) {
      createLeadFormRef.current?.reset();
      setDuplicateCandidates([]);
      setPendingLeadPayload(null);
    }
  }

  function dismissDuplicateWarning() {
    setDuplicateCandidates([]);
    setPendingLeadPayload(null);
    setError('');
  }


  function beginLeadEdit(lead: SalesLead) {
    setEditingLeadId(lead.id);
    setQualifyingLeadId(null);
    setDisqualifyingLeadId(null);
    setActivityLeadId(null);
    setLeadDraft({
      name: lead.name || '',
      companyName: lead.company_name || '',
      contactName: lead.contact_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source || '',
      notes: lead.notes || '',
      salespersonUserId: lead.salesperson_user_id || '',
    });
    setError('');
  }

  async function updateLead(event: FormEvent<HTMLFormElement>, lead: SalesLead) {
    event.preventDefault();
    const succeeded = await action({
      action: 'update_lead',
      leadId: lead.id,
      ...leadDraft,
      salespersonUserId: leadDraft.salespersonUserId || null,
    });
    if (succeeded) setEditingLeadId(null);
  }

  async function disqualifyLead(event: FormEvent<HTMLFormElement>, lead: SalesLead) {
    event.preventDefault();
    const succeeded = await action({
      action: 'disqualify_lead',
      leadId: lead.id,
      reason: disqualificationReason,
    });
    if (succeeded) {
      setDisqualifyingLeadId(null);
      setDisqualificationReason('');
    }
  }

  function beginActivity(lead: SalesLead) {
    setActivityLeadId(lead.id);
    setEditingLeadId(null);
    setQualifyingLeadId(null);
    setDisqualifyingLeadId(null);
    setActivityDraft({
      activityType: 'task',
      subject: '',
      description: '',
      dueDate: '',
      assignedUserId: lead.salesperson_user_id || '',
    });
    setError('');
  }

  async function createActivity(event: FormEvent<HTMLFormElement>, lead: SalesLead) {
    event.preventDefault();
    const succeeded = await action({
      action: 'create_lead_activity',
      leadId: lead.id,
      activityType: activityDraft.activityType,
      subject: activityDraft.subject,
      description: activityDraft.description,
      dueDate: activityDraft.dueDate || null,
      assignedUserId: activityDraft.assignedUserId || null,
    });
    if (succeeded) {
      setActivityLeadId(null);
      setActivityDraft({ activityType: 'task', subject: '', description: '', dueDate: '', assignedUserId: '' });
    }
  }

  async function updateActivity(activityId: string, status: 'completed' | 'cancelled') {
    await action({ action: 'update_lead_activity', activityId, status });
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
          ref={createLeadFormRef}
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
          <label className="space-y-1 text-xs font-bold text-slate-500">
            <span>Assigned salesperson</span>
            <select name="salespersonUserId" defaultValue="" className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100">
              <option value="">Unassigned</option>
              {data.salespeople.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-xl border border-[var(--sami-border)] px-4 text-sm font-black disabled:opacity-60 md:col-span-2"
          >
            {busy ? 'Saving…' : 'Create lead'}
          </button>
        </form>
        {pendingLeadPayload && duplicateCandidates.length > 0 ? (
          <section
            aria-live="polite"
            className="mt-4 rounded-[24px] border border-amber-500/40 bg-amber-500/[0.06] p-5"
          >
            <h4 className="font-black">Possible duplicate leads</h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              These existing leads share the submitted email or phone. Review them before continuing.
              Creating anyway will keep a separate lead record.
            </p>
            <div className="mt-4 space-y-2">
              {duplicateCandidates.map(candidate => (
                <article key={candidate.id} className="rounded-xl border border-[var(--sami-border)] bg-white/60 p-3 dark:bg-slate-950/30">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black">{candidate.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {candidate.lead_number} · {candidate.status}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">
                        {[candidate.company_name, candidate.contact_name, candidate.email, candidate.phone]
                          .filter(Boolean)
                          .join(' · ') || 'No additional contact details'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Match: {candidate.match_reason === 'email_and_phone'
                          ? 'Email and phone'
                          : candidate.match_reason === 'email'
                            ? 'Email'
                            : 'Phone'}
                        {' · Owner: '}
                        {data.salespeople.find(person => person.id === candidate.salesperson_user_id)?.name || 'Unassigned'}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmCreateLeadWithDuplicates()}
                className="h-10 rounded-xl bg-amber-600 px-4 text-xs font-black text-white disabled:opacity-60"
              >
                {busy ? 'Creating…' : 'Create anyway'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={dismissDuplicateWarning}
                className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
              >
                Edit lead details
              </button>
            </div>
          </section>
        ) : null}
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
              {filteredLeads.length} / {data.leads.length}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <label className="space-y-1 text-xs font-bold text-slate-500">
              <span>Search leads</span>
              <input type="search" value={leadSearch} onChange={event => setLeadSearch(event.target.value)} placeholder="Name, company, email, owner…" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-500">
              <span>Lead status</span>
              <select value={leadStatusFilter} onChange={event => setLeadStatusFilter(event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100">
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="disqualified">Disqualified</option>
                <option value="converted">Converted</option>
              </select>
            </label>
          </div>
          <div className="mt-3 space-y-2">
            {filteredLeads.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">
                {data.leads.length === 0 ? 'No leads yet. Capture a prospect above to start the qualification process.' : 'No leads match the current search and status filter.'}
              </p>
            ) : filteredLeads.map(lead => (
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
                        {lead.phone ? ' · ' + lead.phone : ''}
                      </p>
                    ) : lead.email || lead.phone ? (
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {[lead.email, lead.phone].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      Owner: {data.salespeople.find(person => person.id === lead.salesperson_user_id)?.name || 'Unassigned'}
                    </p>
                    {lead.disqualification_reason ? (
                      <p className="mt-1 break-words text-xs text-rose-600 dark:text-rose-300">
                        Reason: {lead.disqualification_reason}
                      </p>
                    ) : null}
                  </div>
                  {canManagePipeline ? (
                    <div className="flex max-w-[12rem] shrink-0 flex-wrap justify-end gap-x-3 gap-y-2">
                      {lead.status !== 'converted' && editingLeadId !== lead.id ? (
                        <button type="button" disabled={busy} onClick={() => beginLeadEdit(lead)} className="text-xs font-black text-slate-600 hover:underline disabled:opacity-60">Edit</button>
                      ) : null}
                      {lead.status !== 'converted' && lead.status !== 'disqualified' ? (
                        <button type="button" disabled={busy} onClick={() => beginQualification(lead.id)} className="text-xs font-black text-blue-600 hover:underline disabled:opacity-60">Qualify →</button>
                      ) : null}
                      {lead.status !== 'converted' && lead.status !== 'disqualified' ? (
                        <button type="button" disabled={busy} onClick={() => {
                          setDisqualifyingLeadId(lead.id);
                          setDisqualificationReason('');
                          setEditingLeadId(null);
                          setQualifyingLeadId(null);
                          setActivityLeadId(null);
                        }} className="text-xs font-black text-rose-600 hover:underline disabled:opacity-60">Disqualify</button>
                      ) : null}
                      {lead.status === 'disqualified' ? (
                        <button type="button" disabled={busy} onClick={() => void action({ action: 'reopen_lead', leadId: lead.id })} className="text-xs font-black text-emerald-700 hover:underline disabled:opacity-60">Reopen</button>
                      ) : null}
                      {lead.status !== 'converted' && lead.status !== 'disqualified' ? (
                        <button type="button" disabled={busy} onClick={() => beginActivity(lead)} className="text-xs font-black text-slate-600 hover:underline disabled:opacity-60">+ Follow-up</button>
                      ) : null}
                    </div>
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

                {editingLeadId === lead.id ? (
                  <form onSubmit={event => void updateLead(event, lead)} className="mt-4 grid gap-3 rounded-xl bg-slate-500/[0.04] p-3 sm:grid-cols-2">
                    <h4 className="text-sm font-black sm:col-span-2">Edit lead details</h4>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Lead name *</span>
                      <input required value={leadDraft.name} onChange={event => setLeadDraft(current => ({ ...current, name: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Company</span>
                      <input value={leadDraft.companyName} onChange={event => setLeadDraft(current => ({ ...current, companyName: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Contact name</span>
                      <input value={leadDraft.contactName} onChange={event => setLeadDraft(current => ({ ...current, contactName: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Email</span>
                      <input type="email" value={leadDraft.email} onChange={event => setLeadDraft(current => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Phone</span>
                      <input type="tel" value={leadDraft.phone} onChange={event => setLeadDraft(current => ({ ...current, phone: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Source</span>
                      <input value={leadDraft.source} onChange={event => setLeadDraft(current => ({ ...current, source: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Assigned salesperson</span>
                      <select value={leadDraft.salespersonUserId} onChange={event => setLeadDraft(current => ({ ...current, salespersonUserId: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100">
                        <option value="">Unassigned</option>
                        {data.salespeople.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Notes</span>
                      <textarea rows={3} value={leadDraft.notes} onChange={event => setLeadDraft(current => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="submit" disabled={busy || !leadDraft.name.trim()} className="h-10 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save lead'}</button>
                      <button type="button" disabled={busy} onClick={() => setEditingLeadId(null)} className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60">Cancel</button>
                    </div>
                  </form>
                ) : null}

                {disqualifyingLeadId === lead.id ? (
                  <form onSubmit={event => void disqualifyLead(event, lead)} className="mt-4 space-y-3 rounded-xl bg-rose-500/[0.04] p-3">
                    <h4 className="text-sm font-black">Disqualify lead</h4>
                    <label className="block space-y-1 text-xs font-bold text-slate-500">
                      <span>Reason for disqualification *</span>
                      <textarea required rows={3} value={disqualificationReason} onChange={event => setDisqualificationReason(event.target.value)} className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={busy || !disqualificationReason.trim()} className="h-10 rounded-lg bg-rose-600 px-3.5 text-xs font-black text-white disabled:opacity-60">{busy ? 'Saving…' : 'Confirm disqualification'}</button>
                      <button type="button" disabled={busy} onClick={() => setDisqualifyingLeadId(null)} className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60">Cancel</button>
                    </div>
                  </form>
                ) : null}

                {activityLeadId === lead.id ? (
                  <form onSubmit={event => void createActivity(event, lead)} className="mt-4 grid gap-3 rounded-xl bg-blue-500/[0.04] p-3 sm:grid-cols-2">
                    <h4 className="text-sm font-black sm:col-span-2">Schedule follow-up</h4>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Activity type</span>
                      <select value={activityDraft.activityType} onChange={event => setActivityDraft(current => ({ ...current, activityType: event.target.value as ActivityDraft['activityType'] }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100">
                        <option value="task">Task</option>
                        <option value="call">Call</option>
                        <option value="email">Email</option>
                        <option value="meeting">Meeting</option>
                        <option value="note">Note</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Due date</span>
                      <input type="date" value={activityDraft.dueDate} onChange={event => setActivityDraft(current => ({ ...current, dueDate: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Subject *</span>
                      <input required value={activityDraft.subject} onChange={event => setActivityDraft(current => ({ ...current, subject: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Assigned to</span>
                      <select value={activityDraft.assignedUserId} onChange={event => setActivityDraft(current => ({ ...current, assignedUserId: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100">
                        <option value="">Unassigned</option>
                        {data.salespeople.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Details</span>
                      <textarea rows={2} value={activityDraft.description} onChange={event => setActivityDraft(current => ({ ...current, description: event.target.value }))} className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100" />
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="submit" disabled={busy || !activityDraft.subject.trim()} className="h-10 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60">{busy ? 'Saving…' : 'Schedule follow-up'}</button>
                      <button type="button" disabled={busy} onClick={() => setActivityLeadId(null)} className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60">Cancel</button>
                    </div>
                  </form>
                ) : null}

                <div className="mt-4 space-y-2 border-t border-[var(--sami-border)] pt-3">
                  <p className="text-xs font-black">Follow-up activity</p>
                  {data.activities.filter(activity => activity.lead_id === lead.id).slice(0, 5).length === 0 ? (
                    <p className="text-xs text-slate-400">No follow-up activities recorded.</p>
                  ) : data.activities.filter(activity => activity.lead_id === lead.id).slice(0, 5).map(activity => (
                    <div key={activity.id} className="rounded-lg border border-[var(--sami-border)] p-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-xs font-black">{activity.subject}</p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {activity.activity_type} · {activity.status}
                            {activity.due_date ? ' · Due ' + String(activity.due_date).slice(0, 10) : ''}
                            {activity.assigned_user_id ? ' · ' + (data.salespeople.find(person => person.id === activity.assigned_user_id)?.name || 'Assigned user') : ''}
                          </p>
                          {activity.description ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{activity.description}</p> : null}
                        </div>
                        {canManagePipeline && activity.status === 'planned' ? (
                          <div className="flex gap-2">
                            <button type="button" disabled={busy} onClick={() => void updateActivity(activity.id, 'completed')} className="text-[10px] font-black text-emerald-700 hover:underline disabled:opacity-60">Complete</button>
                            <button type="button" disabled={busy} onClick={() => void updateActivity(activity.id, 'cancelled')} className="text-[10px] font-black text-slate-500 hover:underline disabled:opacity-60">Cancel</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
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
