'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import Link from 'next/link';

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  RefreshCw,
  UsersRound,
} from 'lucide-react';

type RelationshipAccount = {
  id: string;
  account_name: string;
};

type RelationshipContact = {
  id: string;
  account_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  do_not_contact: boolean;
};

type CrmInteraction = {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  interaction_type: string;
  subject: string;
  description: string | null;
  status: string;
  occurred_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  account_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_do_not_contact: boolean | null;
};

type SalesActivity = {
  id: string;
  status?: string | null;
  subject?: string | null;
  activity_type?: string | null;
  due_date?: string | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  lead_name?: string | null;
  opportunity_name?: string | null;
  lead_contact_name?: string | null;
  opportunity_contact_name?: string | null;
};

type SalesPipelineResponse = {
  success?: boolean;
  pipeline?: {
    activities?: SalesActivity[];
    opportunityActivities?: SalesActivity[];
  };
  error?: string;
};

type TimelineItem = {
  key: string;
  source: 'crm' | 'sales';
  title: string;
  detail: string | null;
  status: string;
  type: string;
  dateValue: string | null;
  accountName: string | null;
  contactName: string | null;
  dueAt: string | null;
  interactionId?: string;
};

type TimelinePayload = {
  success?: boolean;
  error?: string;
  interactions?: CrmInteraction[];
  accounts?: RelationshipAccount[];
  contacts?: RelationshipContact[];
  hasMore?: boolean;
  accountsTruncated?: boolean;
  contactsTruncated?: boolean;
};

const TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email log' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'task', label: 'Follow-up task' },
  { value: 'sms', label: 'SMS log' },
  { value: 'whatsapp', label: 'WhatsApp log' },
  { value: 'other', label: 'Other' },
];

function displayDate(value: string | null | undefined) {
  if (!value) return 'Date not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not set';
  return date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function prettyLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeTimelineDate(item: CrmInteraction) {
  return item.due_at || item.occurred_at || item.completed_at || item.created_at;
}

export default function CrmRelationshipTimelinePanel({
  salesEnabled,
  canCreate,
  canEdit,
}: {
  salesEnabled: boolean;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [accounts, setAccounts] = useState<RelationshipAccount[]>([]);
  const [contacts, setContacts] = useState<RelationshipContact[]>([]);
  const [salesActivities, setSalesActivities] = useState<SalesActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [contactId, setContactId] = useState('');
  const [interactionType, setInteractionType] = useState('note');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const [status, setStatus] = useState('completed');
  const [dueAt, setDueAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      fetch('/api/apps/crm/interactions', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }).then(async (response) => {
        const payload = await response.json() as TimelinePayload;
        if (!response.ok || payload.success !== true) {
          throw new Error(payload.error || 'CRM relationship history could not be loaded.');
        }
        return payload;
      }),
      salesEnabled
        ? fetch('/api/apps/sales?pipeline=1', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          }).then(async (response) => {
            const payload = await response.json() as SalesPipelineResponse;
            if (!response.ok || payload.success !== true) {
              throw new Error(payload.error || 'Sales history is currently unavailable.');
            }
            return payload;
          })
        : Promise.resolve(null),
    ]);

    const crmResult = results[0];
    if (crmResult.status === 'fulfilled') {
      setInteractions(Array.isArray(crmResult.value.interactions) ? crmResult.value.interactions : []);
      setAccounts(Array.isArray(crmResult.value.accounts) ? crmResult.value.accounts : []);
      setContacts(Array.isArray(crmResult.value.contacts) ? crmResult.value.contacts : []);
    } else {
      setError(crmResult.reason instanceof Error ? crmResult.reason.message : 'CRM relationship history could not be loaded.');
    }

    const salesResult = results[1];
    if (salesResult.status === 'fulfilled' && salesResult.value) {
      const pipeline = salesResult.value.pipeline;
      setSalesActivities([
        ...(Array.isArray(pipeline?.activities) ? pipeline.activities : []),
        ...(Array.isArray(pipeline?.opportunityActivities) ? pipeline.opportunityActivities : []),
      ].slice(0, 100));
    } else {
      setSalesActivities([]);
      if (salesEnabled && salesResult.status === 'rejected') {
        setError((current) => current || 'Sales activity history could not be loaded; CRM interactions remain available.');
      }
    }

    setLoading(false);
  }, [salesEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableContacts = useMemo(() => {
    if (!accountId) return contacts;
    return contacts.filter((contact) => !contact.account_id || contact.account_id === accountId);
  }, [accountId, contacts]);

  useEffect(() => {
    if (contactId && !availableContacts.some((contact) => contact.id === contactId)) {
      setContactId('');
    }
  }, [availableContacts, contactId]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const crmItems: TimelineItem[] = interactions.map((item) => ({
      key: 'crm-' + item.id,
      source: 'crm',
      title: item.subject,
      detail: item.description || item.outcome,
      status: item.status,
      type: item.interaction_type,
      dateValue: safeTimelineDate(item),
      accountName: item.account_name,
      contactName: [item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ') || null,
      dueAt: item.due_at,
      interactionId: item.id,
    }));

    const salesItems: TimelineItem[] = salesActivities.map((item, index) => ({
      key: 'sales-' + item.id + '-' + index,
      source: 'sales',
      title: item.subject || prettyLabel(item.activity_type || 'activity'),
      detail: item.lead_name || item.opportunity_name || item.lead_contact_name || item.opportunity_contact_name || null,
      status: item.status || 'unknown',
      type: item.activity_type || 'activity',
      dateValue: item.due_date || item.scheduled_at || item.completed_at || item.created_at || null,
      accountName: null,
      contactName: item.lead_contact_name || item.opportunity_contact_name || null,
      dueAt: item.due_date || null,
    }));

    return [...crmItems, ...salesItems].sort((left, right) => {
      const leftTime = left.dateValue ? new Date(left.dateValue).getTime() : 0;
      const rightTime = right.dateValue ? new Date(right.dateValue).getTime() : 0;
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    }).slice(0, 30);
  }, [interactions, salesActivities]);

  const createInteraction = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/apps/crm/interactions', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: accountId || null,
          contactId: contactId || null,
          interactionType,
          subject,
          description,
          outcome,
          status,
          dueAt: status === 'planned' ? new Date(dueAt).toISOString() : null,
          occurredAt: status === 'completed' ? new Date().toISOString() : null,
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'SaMi could not record this interaction.');
      }

      setSubject('');
      setDescription('');
      setOutcome('');
      setDueAt('');
      setStatus('completed');
      setNotice('Interaction saved to the CRM relationship history.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SaMi could not record this interaction.');
    } finally {
      setSaving(false);
    }
  }, [accountId, contactId, interactionType, subject, description, outcome, status, dueAt, load]);

  const completeInteraction = useCallback(async (interactionId: string, nextStatus: 'completed' | 'cancelled') => {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/apps/crm/interactions', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interactionId, status: nextStatus }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'SaMi could not update this follow-up.');
      }

      setNotice(nextStatus === 'completed' ? 'Follow-up marked complete.' : 'Follow-up cancelled.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SaMi could not update this follow-up.');
    } finally {
      setSaving(false);
    }
  }, [load]);

  return (
    <section
      aria-label="CRM relationship timeline"
      className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Relationship history
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Calls, notes, meetings and follow-ups</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Record relationship activity against an account or contact. Sales activities appear read-only and stay owned by SaMi Sales.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </div>

      {error ? (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Timeline warning</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">{notice}</p>
      ) : null}

      {canCreate ? (
        <form onSubmit={createInteraction} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Record an interaction</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">CRM account</span>
              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Choose account (or use a contact)</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Contact (optional)</span>
              <select
                value={contactId}
                onChange={(event) => setContactId(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">No specific contact</option>
                {availableContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ') + (contact.email ? ' · ' + contact.email : '') + (contact.do_not_contact ? ' · Do not contact' : '')}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">This logs activity only; it does not send a message or make a call.</p>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Activity type</span>
              <select value={interactionType} onChange={(event) => setInteractionType(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
                <option value="completed">Completed / log history</option>
                <option value="planned">Planned / follow-up task</option>
              </select>
            </label>
            {status === 'planned' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Due date and time</span>
                <input
                  type="datetime-local"
                  required
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
              </label>
            ) : null}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Subject</span>
            <input required maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Discussed renewal requirements" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Details / notes</span>
              <textarea maxLength={8000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Context, commitments, next steps…" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Outcome (optional)</span>
              <textarea maxLength={255} rows={3} value={outcome} onChange={(event) => setOutcome(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" placeholder="e.g. Customer requested a revised proposal" />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving || loading || (!accountId && !contactId) || !subject.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving…' : status === 'planned' ? 'Create follow-up' : 'Save interaction'}
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Your current CRM permissions allow viewing this timeline but not creating new interactions.</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Latest relationship activity</p>
        <span className="text-xs text-slate-500">{timelineItems.length} items shown</span>
      </div>

      {timelineItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <CalendarClock className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-800">No relationship activity yet</p>
          <p className="mt-1 text-xs text-slate-500">Record a note or plan a follow-up to start the timeline.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {timelineItems.map((item) => {
            const isPlanned = item.source === 'crm' && item.status === 'planned';
            return (
              <article key={item.key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">{prettyLabel(item.type)}</span>
                    <span className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + (isPlanned ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700')}>{prettyLabel(item.status)}</span>
                    <span className={'rounded-full px-2 py-0.5 text-[11px] font-semibold ' + (item.source === 'sales' ? 'bg-blue-50 text-blue-800' : 'bg-indigo-50 text-indigo-800')}>{item.source === 'sales' ? 'Sales · read-only' : 'CRM'}</span>
                  </div>
                  {item.detail ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.detail}</p> : null}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {item.accountName ? <span>{item.accountName}</span> : null}
                    {item.contactName ? <span>{item.contactName}</span> : null}
                    <span>{displayDate(item.dateValue)}</span>
                    {item.dueAt ? <span>Due {displayDate(item.dueAt)}</span> : null}
                  </p>
                </div>
                {isPlanned && canEdit ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => item.interactionId && void completeInteraction(item.interactionId, 'completed')} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </button>
                    <button type="button" onClick={() => item.interactionId && void completeInteraction(item.interactionId, 'cancelled')} disabled={saving} className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                ) : null}
                {item.source === 'sales' ? (
                  <Link href="/apps/sales/pipeline" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
                    Open Sales
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock3 className="h-3.5 w-3.5" />
        <span>Showing the latest CRM interactions and Sales follow-up activities. Sales events are not edited from CRM.</span>
      </div>
      {(accounts.length === 0 || contacts.length === 0) ? (
        <p className="text-xs text-slate-500">Create accounts and contacts in their CRM registers to associate relationship activity.</p>
      ) : null}
    </section>
  );
}
