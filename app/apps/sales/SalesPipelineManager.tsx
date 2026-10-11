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
  lead_name: string;
  lead_number: string;
  lead_company_name: string | null;
  lead_contact_name: string | null;
  activity_type: 'call' | 'email' | 'meeting' | 'task' | 'note';
  subject: string;
  description: string | null;
  due_date: string | null;
  status: 'planned' | 'completed' | 'cancelled';
  assigned_user_id: string | null;
  completed_at: string | null;
  created_at: string;
};

type SalesOpportunityActivity = {
  id: string;
  opportunity_id: string;
  opportunity_number: string;
  opportunity_name: string;
  opportunity_customer_name: string | null;
  opportunity_contact_name: string | null;
  activity_type: 'call' | 'email' | 'meeting' | 'task' | 'note';
  subject: string;
  description: string | null;
  due_date: string | null;
  status: 'planned' | 'completed' | 'cancelled';
  assigned_user_id: string | null;
  completed_at: string | null;
  created_at: string;
};

type ActivityRecord = SalesLeadActivity | SalesOpportunityActivity;

type SalesOpportunity = {
  id: string;
  opportunity_number: string;
  lead_id: string | null;
  stage_id: string;
  stage_type: 'open' | 'won' | 'lost' | string;
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
  salesperson_user_id: string | null;
  sales_team_id: string | null;
  territory_id: string | null;
  source: string | null;
  notes: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  latest_quote_id: string | null;
  created_at: string;
};

type OpportunityDraft = {
  name: string;
  customerName: string;
  contactName: string;
  email: string;
  phone: string;
  expectedValue: string;
  currency: string;
  expectedCloseDate: string;
  source: string;
  notes: string;
  salespersonUserId: string;
};

type OpportunityStageHistoryEntry = {
  id: string;
  opportunity_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  probability: number | string;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
  from_stage_name: string | null;
  to_stage_name: string;
};

type PipelineData = {
  stages: PipelineStage[];
  leads: SalesLead[];
  opportunities: SalesOpportunity[];
  activities: SalesLeadActivity[];
  opportunityActivities: SalesOpportunityActivity[];
  salespeople: Salesperson[];
  opportunityHistory: OpportunityStageHistoryEntry[];
};

type SalesPipelineSavedView = {
  id: string;
  name: string;
  viewType: 'leads' | 'opportunities';
  statusView: string;
  searchQuery: string;
  createdAt: string;
};

type PipelineAction =
  | { action: 'create_lead'; name: FormDataEntryValue | null; companyName: FormDataEntryValue | null; contactName: FormDataEntryValue | null; email: FormDataEntryValue | null; phone: FormDataEntryValue | null; source: FormDataEntryValue | null; salespersonUserId: FormDataEntryValue | null; confirmDuplicates?: boolean }
  | { action: 'update_lead'; leadId: string; name: string; companyName: string; contactName: string; email: string; phone: string; source: string; notes: string; salespersonUserId: string | null }
  | { action: 'disqualify_lead'; leadId: string; reason: string }
  | { action: 'reopen_lead'; leadId: string }
  | { action: 'create_lead_activity'; leadId: string; activityType: string; subject: string; description: string; dueDate: string | null; assignedUserId: string | null }
  | { action: 'update_lead_activity'; activityId: string; status: 'completed' | 'cancelled' }
  | { action: 'edit_lead_activity'; activityId: string; activityType: ActivityDraft['activityType']; subject: string; description: string; dueDate: string | null; assignedUserId: string | null }
  | { action: 'create_opportunity_activity'; opportunityId: string; activityType: string; subject: string; description: string; dueDate: string | null; assignedUserId: string | null }
  | { action: 'update_opportunity_activity'; activityId: string; status: 'completed' | 'cancelled' }
  | { action: 'edit_opportunity_activity'; activityId: string; activityType: ActivityDraft['activityType']; subject: string; description: string; dueDate: string | null; assignedUserId: string | null }
  | { action: 'convert_lead'; leadId: string; name: string; expectedValue: string; currency: string; expectedCloseDate: string | null }
  | { action: 'update_opportunity'; opportunityId: string; name: string; customerName: string; contactName: string; email: string; phone: string; expectedValue: string; currency: string; expectedCloseDate: string | null; source: string; notes: string; salespersonUserId: string | null }
  | { action: 'move_opportunity'; opportunityId: string; stageId: string; reason?: string }
  | { action: 'save_pipeline_view'; name: string; viewType: 'leads' | 'opportunities'; statusView: string; searchQuery: string }
  | { action: 'delete_pipeline_view'; viewId: string };

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

type ActivityDueBucket = 'overdue' | 'today' | 'upcoming' | 'unscheduled' | 'later';
type ActivityAgendaFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'unscheduled';

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function activityDueBucket(
  dueDate: string | null,
  todayKey: string,
  nextWeekKey: string,
): ActivityDueBucket {
  if (!dueDate) return 'unscheduled';
  const dateKey = String(dueDate).slice(0, 10);
  if (dateKey < todayKey) return 'overdue';
  if (dateKey === todayKey) return 'today';
  if (dateKey <= nextWeekKey) return 'upcoming';
  return 'later';
}

function formatActivityDate(value: string | null) {
  if (!value) return 'No due date';
  const dateKey = String(value).slice(0, 10);
  const date = new Date(dateKey + 'T00:00:00');
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}


function formatHistoryTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
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
    stages: [], leads: [], opportunities: [], activities: [], opportunityActivities: [], salespeople: [], opportunityHistory: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qualifyingLeadId, setQualifyingLeadId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({ name: '', companyName: '', contactName: '', email: '', phone: '', source: '', notes: '', salespersonUserId: '' });
  const [disqualifyingLeadId, setDisqualifyingLeadId] = useState<string | null>(null);
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [activityLeadId, setActivityLeadId] = useState<string | null>(null);
  const [activityOpportunityId, setActivityOpportunityId] = useState<string | null>(null);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>({ activityType: 'task', subject: '', description: '', dueDate: '', assignedUserId: '' });
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingActivityRecordType, setEditingActivityRecordType] = useState<'lead' | 'opportunity' | null>(null);
  const [activityEditDraft, setActivityEditDraft] = useState<ActivityDraft>({
    activityType: 'task', subject: '', description: '', dueDate: '', assignedUserId: '',
  });
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  const [opportunitySearch, setOpportunitySearch] = useState('');
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState<'all' | 'open' | 'won' | 'lost'>('all');
  const [savedPipelineViews, setSavedPipelineViews] = useState<SalesPipelineSavedView[]>([]);
  const [leadSavedViewName, setLeadSavedViewName] = useState('');
  const [opportunitySavedViewName, setOpportunitySavedViewName] = useState('');
  const [pipelineViewsLoading, setPipelineViewsLoading] = useState(false);
  const [pipelineViewsError, setPipelineViewsError] = useState('');
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const [opportunityDraft, setOpportunityDraft] = useState<OpportunityDraft>({
    name: '', customerName: '', contactName: '', email: '', phone: '',
    expectedValue: '', currency: normalizedCurrency(defaultCurrency),
    expectedCloseDate: '', source: '', notes: '', salespersonUserId: '',
  });
  const [closingOpportunityId, setClosingOpportunityId] = useState<string | null>(null);
  const [closingOpportunityStageId, setClosingOpportunityStageId] = useState<string | null>(null);
  const [opportunityLossReason, setOpportunityLossReason] = useState('');
  const [expandedOpportunityHistoryId, setExpandedOpportunityHistoryId] = useState<string | null>(null);
  const [agendaSearch, setAgendaSearch] = useState('');
  const [agendaFilter, setAgendaFilter] = useState<ActivityAgendaFilter>('all');
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

  const loadSavedPipelineViews = useCallback(async () => {
    setPipelineViewsLoading(true);
    try {
      const response = await fetch('/api/apps/sales?pipelineViews=1', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({})) as {
        savedPipelineViews?: SalesPipelineSavedView[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(body.savedPipelineViews)) {
        throw new Error(body.error || 'Could not load saved pipeline views.');
      }
      setSavedPipelineViews(body.savedPipelineViews);
      setPipelineViewsError('');
    } catch (caught) {
      setPipelineViewsError(caught instanceof Error ? caught.message : 'Could not load saved pipeline views.');
    } finally {
      setPipelineViewsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedPipelineViews();
  }, [loadSavedPipelineViews]);

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

  const filteredOpportunities = data.opportunities.filter(opportunity => {
    const status = ['open', 'won', 'lost'].includes(opportunity.stage_type) ? opportunity.stage_type : 'open';
    const filter = opportunityStatusFilter === 'all' || status === opportunityStatusFilter;
    const search = opportunitySearch.trim().toLowerCase();
    const matchesSearch = !search || [
      opportunity.name, opportunity.opportunity_number, opportunity.customer_name,
      opportunity.contact_name, opportunity.email, opportunity.phone, opportunity.stage_name,
      opportunity.source, opportunity.notes,
      data.salespeople.find(person => person.id === opportunity.salesperson_user_id)?.name,
    ].some(value => String(value || '').toLowerCase().includes(search));
    return filter && matchesSearch;
  });

  const today = new Date();
  const todayKey = localDateKey(today);
  const nextWeekDate = new Date(today);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekKey = localDateKey(nextWeekDate);

  const plannedActivities = [
    ...data.activities
      .filter(activity => activity.status === 'planned')
      .map(activity => ({
        activity,
        recordType: 'lead' as const,
        recordId: activity.lead_id,
        recordNumber: activity.lead_number,
        recordName: activity.lead_name,
        recordCompanyName: activity.lead_company_name,
        recordContactName: activity.lead_contact_name,
        dueBucket: activityDueBucket(activity.due_date, todayKey, nextWeekKey),
        ownerName: data.salespeople.find(person => person.id === activity.assigned_user_id)?.name || 'Unassigned',
      })),
    ...data.opportunityActivities
      .filter(activity => activity.status === 'planned')
      .map(activity => ({
        activity,
        recordType: 'opportunity' as const,
        recordId: activity.opportunity_id,
        recordNumber: activity.opportunity_number,
        recordName: activity.opportunity_name,
        recordCompanyName: activity.opportunity_customer_name,
        recordContactName: activity.opportunity_contact_name,
        dueBucket: activityDueBucket(activity.due_date, todayKey, nextWeekKey),
        ownerName: data.salespeople.find(person => person.id === activity.assigned_user_id)?.name || 'Unassigned',
      })),
  ];

  const agendaFilterOptions: { key: ActivityAgendaFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All planned', count: plannedActivities.length },
    { key: 'overdue', label: 'Overdue', count: plannedActivities.filter(item => item.dueBucket === 'overdue').length },
    { key: 'today', label: 'Due today', count: plannedActivities.filter(item => item.dueBucket === 'today').length },
    { key: 'upcoming', label: 'Next 7 days', count: plannedActivities.filter(item => item.dueBucket === 'upcoming').length },
    { key: 'unscheduled', label: 'No due date', count: plannedActivities.filter(item => item.dueBucket === 'unscheduled').length },
  ];

  const filteredAgendaActivities = plannedActivities
    .filter(item => agendaFilter === 'all' || item.dueBucket === agendaFilter)
    .filter(({ activity, ownerName, recordName, recordNumber, recordCompanyName, recordContactName }) => {
      const search = agendaSearch.trim().toLowerCase();
      return !search || [
        activity.subject,
        activity.description,
        activity.activity_type,
        recordName,
        recordNumber,
        recordCompanyName,
        recordContactName,
        ownerName,
      ].some(value => String(value || '').toLowerCase().includes(search));
    })
    .sort((a, b) => {
      const aDate = a.activity.due_date ? String(a.activity.due_date).slice(0, 10) : '9999-12-31';
      const bDate = b.activity.due_date ? String(b.activity.due_date).slice(0, 10) : '9999-12-31';
      return aDate.localeCompare(bDate) || b.activity.created_at.localeCompare(a.activity.created_at);
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
      if (payload.action === 'save_pipeline_view' || payload.action === 'delete_pipeline_view') {
        await loadSavedPipelineViews();
      }
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

  async function savePipelineView(viewType: 'leads' | 'opportunities') {
    const isLeads = viewType === 'leads';
    const name = (isLeads ? leadSavedViewName : opportunitySavedViewName).trim();
    if (!name) {
      setPipelineViewsError('Enter a name before saving this view.');
      return;
    }
    const succeeded = await action({
      action: 'save_pipeline_view',
      name,
      viewType,
      statusView: isLeads ? leadStatusFilter : opportunityStatusFilter,
      searchQuery: isLeads ? leadSearch : opportunitySearch,
    });
    if (succeeded) {
      if (isLeads) setLeadSavedViewName('');
      else setOpportunitySavedViewName('');
      setPipelineViewsError('');
    }
  }

  function applySavedPipelineView(view: SalesPipelineSavedView) {
    if (view.viewType === 'leads') {
      setLeadSearch(view.searchQuery);
      setLeadStatusFilter(view.statusView);
    } else {
      setOpportunitySearch(view.searchQuery);
      setOpportunityStatusFilter(view.statusView as typeof opportunityStatusFilter);
    }
    setPipelineViewsError('');
  }

  async function deleteSavedPipelineView(view: SalesPipelineSavedView) {
    if (!window.confirm('Delete saved pipeline view "' + view.name + '"?')) return;
    const succeeded = await action({ action: 'delete_pipeline_view', viewId: view.id });
    if (succeeded) setPipelineViewsError('');
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
    setActivityOpportunityId(null);
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

  function beginOpportunityActivity(opportunity: SalesOpportunity) {
    setActivityLeadId(null);
    setActivityOpportunityId(opportunity.id);
    setEditingOpportunityId(null);
    setActivityDraft({ activityType: 'task', subject: '', description: '', dueDate: '', assignedUserId: opportunity.salesperson_user_id || '' });
    setError('');
  }

  async function createOpportunityActivity(event: FormEvent<HTMLFormElement>, opportunity: SalesOpportunity) {
    event.preventDefault();
    const succeeded = await action({
      action: 'create_opportunity_activity', opportunityId: opportunity.id,
      activityType: activityDraft.activityType, subject: activityDraft.subject,
      description: activityDraft.description, dueDate: activityDraft.dueDate || null,
      assignedUserId: activityDraft.assignedUserId || null,
    });
    if (succeeded) {
      setActivityOpportunityId(null);
      setActivityDraft({ activityType: 'task', subject: '', description: '', dueDate: '', assignedUserId: '' });
    }
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

  function beginActivityEdit(activity: ActivityRecord) {
    setEditingActivityId(activity.id);
    setEditingActivityRecordType('opportunity_id' in activity ? 'opportunity' : 'lead');
    setActivityEditDraft({
      activityType: activity.activity_type,
      subject: activity.subject || '',
      description: activity.description || '',
      dueDate: activity.due_date ? String(activity.due_date).slice(0, 10) : '',
      assignedUserId: activity.assigned_user_id || '',
    });
    setError('');
  }

  async function saveActivityEdit(event: FormEvent<HTMLFormElement>, activity: ActivityRecord) {
    event.preventDefault();
    const fields = {
      activityId: activity.id, activityType: activityEditDraft.activityType,
      subject: activityEditDraft.subject, description: activityEditDraft.description,
      dueDate: activityEditDraft.dueDate || null, assignedUserId: activityEditDraft.assignedUserId || null,
    };
    const succeeded = 'opportunity_id' in activity
      ? await action({ action: 'edit_opportunity_activity', ...fields })
      : await action({ action: 'edit_lead_activity', ...fields });
    if (succeeded) { setEditingActivityId(null); setEditingActivityRecordType(null); }
  }

  async function updateActivity(activity: string | ActivityRecord, status: 'completed' | 'cancelled') {
    if (typeof activity === 'string') await action({ action: 'update_lead_activity', activityId: activity, status });
    else if ('opportunity_id' in activity) await action({ action: 'update_opportunity_activity', activityId: activity.id, status });
    else await action({ action: 'update_lead_activity', activityId: activity.id, status });
  }

  function beginOpportunityEdit(opportunity: SalesOpportunity) {
    setEditingOpportunityId(opportunity.id);
    setClosingOpportunityId(null);
    setClosingOpportunityStageId(null);
    setOpportunityDraft({
      name: opportunity.name || '',
      customerName: opportunity.customer_name || '',
      contactName: opportunity.contact_name || '',
      email: opportunity.email || '',
      phone: opportunity.phone || '',
      expectedValue: String(opportunity.expected_value ?? 0),
      currency: normalizedCurrency(opportunity.currency || defaultCurrency),
      expectedCloseDate: opportunity.expected_close_date ? String(opportunity.expected_close_date).slice(0, 10) : '',
      source: opportunity.source || '',
      notes: opportunity.notes || '',
      salespersonUserId: opportunity.salesperson_user_id || '',
    });
    setError('');
  }

  async function saveOpportunityEdit(event: FormEvent<HTMLFormElement>, opportunity: SalesOpportunity) {
    event.preventDefault();
    const succeeded = await action({
      action: 'update_opportunity',
      opportunityId: opportunity.id,
      name: opportunityDraft.name,
      customerName: opportunityDraft.customerName,
      contactName: opportunityDraft.contactName,
      email: opportunityDraft.email,
      phone: opportunityDraft.phone,
      expectedValue: opportunityDraft.expectedValue,
      currency: normalizedCurrency(opportunityDraft.currency),
      expectedCloseDate: opportunityDraft.expectedCloseDate || null,
      source: opportunityDraft.source,
      notes: opportunityDraft.notes,
      salespersonUserId: opportunityDraft.salespersonUserId || null,
    });
    if (succeeded) setEditingOpportunityId(null);
  }

  function changeOpportunityStage(opportunityId: string, stageId: string) {
    const stage = data.stages.find(item => item.id === stageId);
    if (!stage) return;
    if (stage.stage_type === 'lost') {
      setClosingOpportunityId(opportunityId);
      setClosingOpportunityStageId(stageId);
      setOpportunityLossReason('');
      setEditingOpportunityId(null);
      setError('');
      return;
    }
    void action({ action: 'move_opportunity', opportunityId, stageId });
    setClosingOpportunityId(null);
    setClosingOpportunityStageId(null);
    setOpportunityLossReason('');
  }

  function beginOpportunityLoss(opportunity: SalesOpportunity) {
    const lostStage = data.stages.find(stage => stage.stage_type === 'lost');
    if (!lostStage) {
      setError('A Lost pipeline stage is not configured. Refresh the Sales workspace and try again.');
      return;
    }
    setClosingOpportunityId(opportunity.id);
    setClosingOpportunityStageId(lostStage.id);
    setOpportunityLossReason('');
    setEditingOpportunityId(null);
    setError('');
  }

  async function confirmOpportunityLost(event: FormEvent<HTMLFormElement>, opportunity: SalesOpportunity) {
    event.preventDefault();
    if (!closingOpportunityStageId || !opportunityLossReason.trim()) return;
    const succeeded = await action({
      action: 'move_opportunity',
      opportunityId: opportunity.id,
      stageId: closingOpportunityStageId,
      reason: opportunityLossReason.trim(),
    });
    if (succeeded) {
      setClosingOpportunityId(null);
      setClosingOpportunityStageId(null);
      setOpportunityLossReason('');
    }
  }

  async function markOpportunityWon(opportunity: SalesOpportunity) {
    const wonStage = data.stages.find(stage => stage.stage_type === 'won');
    if (!wonStage) {
      setError('A Won pipeline stage is not configured. Refresh the Sales workspace and try again.');
      return;
    }
    await action({
      action: 'move_opportunity',
      opportunityId: opportunity.id,
      stageId: wonStage.id,
      reason: 'Marked won',
    });
    setClosingOpportunityId(null);
    setClosingOpportunityStageId(null);
    setOpportunityLossReason('');
  }

  async function reopenOpportunity(opportunity: SalesOpportunity) {
    const openStage = data.stages.find(stage => stage.stage_type === 'open');
    if (!openStage) {
      setError('An active pipeline stage is not configured. Refresh the Sales workspace and try again.');
      return;
    }
    await action({
      action: 'move_opportunity',
      opportunityId: opportunity.id,
      stageId: openStage.id,
      reason: 'Reopened opportunity',
    });
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
        <>
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
        </>
      ) : (
        <p className="rounded-xl border border-[var(--sami-border)] p-4 text-sm text-slate-500">
          You have read-only access to leads and opportunities. Pipeline changes require management permission.
        </p>
      )}

      <section className="sami-surface rounded-[24px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-black">Follow-up agenda</h3>
            <p className="mt-1 text-sm text-slate-500">Keep calls, emails, meetings and tasks moving before opportunities go cold.</p>
          </div>
          <span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-black text-slate-500">
            {plannedActivities.length} planned
          </span>
        </div>

        <label className="mt-4 block space-y-1 text-xs font-bold text-slate-500">
          <span>Search follow-ups</span>
          <input
            type="search"
            value={agendaSearch}
            onChange={event => setAgendaSearch(event.target.value)}
            placeholder="Activity, lead, company or assignee…"
            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter follow-up agenda">
          {agendaFilterOptions.map(option => (
            <button
              key={option.key}
              type="button"
              aria-pressed={agendaFilter === option.key}
              onClick={() => setAgendaFilter(option.key)}
              className={agendaFilter === option.key
                ? 'rounded-full border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-black text-white'
                : 'rounded-full border border-[var(--sami-border)] bg-transparent px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-500/[0.06] dark:text-slate-300'}
            >
              {option.label} <span className="ml-1 tabular-nums">{option.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {filteredAgendaActivities.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
              {plannedActivities.length === 0
                ? 'No planned follow-ups yet. Add a call, email, meeting or task from a lead or opportunity.'
                : 'No follow-ups match this filter and search.'}
            </p>
          ) : filteredAgendaActivities.map(({ activity, dueBucket, ownerName, recordType, recordNumber, recordName, recordCompanyName, recordContactName }) => (
            <article key={activity.id} className="rounded-xl border border-[var(--sami-border)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-black">{activity.subject}</p>
                    <span className={
                      dueBucket === 'overdue'
                        ? 'rounded-full border border-rose-500/40 px-2 py-0.5 text-[10px] font-black text-rose-600 dark:text-rose-300'
                        : dueBucket === 'today'
                          ? 'rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300'
                          : 'rounded-full border border-[var(--sami-border)] px-2 py-0.5 text-[10px] font-black text-slate-500'
                    }>
                      {dueBucket === 'overdue'
                        ? 'Overdue'
                        : dueBucket === 'today'
                          ? 'Due today'
                          : dueBucket === 'upcoming'
                            ? 'Upcoming'
                            : dueBucket === 'unscheduled'
                              ? 'No due date'
                              : 'Scheduled'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                    {' · '}{recordType === 'lead' ? 'Lead' : 'Opportunity'}
                    {' · '}{recordNumber}
                    {' · '}{recordName}
                  </p>
                  {recordCompanyName || recordContactName ? (
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {[recordCompanyName, recordContactName].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {activity.description ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{activity.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {formatActivityDate(activity.due_date)} · Assigned to {ownerName}
                  </p>
                </div>
                {canManagePipeline ? (
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => beginActivityEdit(activity)}
                      className="h-9 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-black text-slate-600 hover:bg-slate-500/[0.06] disabled:opacity-60 dark:text-slate-300"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void updateActivity(activity, 'completed')}
                      className="h-9 rounded-lg border border-emerald-600/40 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-500/[0.06] disabled:opacity-60 dark:text-emerald-300"
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void updateActivity(activity, 'cancelled')}
                      className="h-9 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-black text-slate-500 hover:bg-slate-500/[0.06] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
              {editingActivityId === activity.id && editingActivityRecordType === recordType ? (
                <form
                  onSubmit={event => void saveActivityEdit(event, activity)}
                  className="mt-4 grid gap-3 rounded-xl bg-slate-500/[0.04] p-3 sm:grid-cols-2"
                >
                  <h4 className="text-sm font-black sm:col-span-2">Edit follow-up</h4>
                  <label className="space-y-1 text-xs font-bold text-slate-500">
                    <span>Activity type</span>
                    <select
                      value={activityEditDraft.activityType}
                      onChange={event => setActivityEditDraft(current => ({ ...current, activityType: event.target.value as ActivityDraft['activityType'] }))}
                      className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                    >
                      <option value="task">Task</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                      <option value="note">Note</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-500">
                    <span>Due date</span>
                    <input
                      type="date"
                      value={activityEditDraft.dueDate}
                      onChange={event => setActivityEditDraft(current => ({ ...current, dueDate: event.target.value }))}
                      className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                    <span>Subject *</span>
                    <input
                      required
                      value={activityEditDraft.subject}
                      onChange={event => setActivityEditDraft(current => ({ ...current, subject: event.target.value }))}
                      className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                    <span>Assigned to</span>
                    <select
                      value={activityEditDraft.assignedUserId}
                      onChange={event => setActivityEditDraft(current => ({ ...current, assignedUserId: event.target.value }))}
                      className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Unassigned</option>
                      {data.salespeople.map(person => (
                        <option key={person.id} value={person.id}>{person.name} · {person.email}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                    <span>Details</span>
                    <textarea
                      rows={2}
                      value={activityEditDraft.description}
                      onChange={event => setActivityEditDraft(current => ({ ...current, description: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={busy || !activityEditDraft.subject.trim()}
                      className="h-10 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60"
                    >
                      {busy ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setEditingActivityId(null); setEditingActivityRecordType(null); }}
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
          <div className="mt-3 rounded-xl border border-[var(--sami-border)] p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="min-w-0 flex-1 space-y-1 text-xs font-bold text-slate-500">
                <span>Save current lead view</span>
                <input
                  type="text"
                  maxLength={80}
                  value={leadSavedViewName}
                  onChange={event => setLeadSavedViewName(event.target.value)}
                  placeholder="e.g. New retail leads"
                  className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                />
              </label>
              <button type="button" disabled={busy || !leadSavedViewName.trim()} onClick={() => void savePipelineView('leads')} className="mt-5 h-10 shrink-0 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-50">
                Save view
              </button>
            </div>
            {pipelineViewsError ? <p role="alert" className="mt-2 text-xs text-rose-600">{pipelineViewsError}</p> : null}
            {pipelineViewsLoading ? (
              <p className="mt-3 text-xs text-slate-500">Loading saved pipeline views…</p>
            ) : savedPipelineViews.filter(view => view.viewType === 'leads').length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Saved lead views">
                {savedPipelineViews.filter(view => view.viewType === 'leads').map(view => (
                  <div key={view.id} className="inline-flex max-w-full items-center rounded-lg border border-[var(--sami-border)]">
                    <button type="button" disabled={busy} aria-label={'Apply saved lead view ' + view.name} onClick={() => applySavedPipelineView(view)} className="max-w-[15rem] truncate px-3 py-2 text-xs font-bold hover:bg-slate-500/[0.05] disabled:opacity-50">
                      {view.name}
                    </button>
                    <button type="button" disabled={busy} aria-label={'Delete saved lead view ' + view.name} onClick={() => void deleteSavedPipelineView(view)} className="border-l border-[var(--sami-border)] px-2 py-2 text-xs text-slate-500 hover:text-rose-600 disabled:opacity-50">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No saved lead views yet.</p>
            )}
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
              {filteredOpportunities.length} / {data.opportunities.length}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <label className="space-y-1 text-xs font-bold text-slate-500">
              <span>Search opportunities</span>
              <input
                type="search"
                value={opportunitySearch}
                onChange={event => setOpportunitySearch(event.target.value)}
                placeholder="Deal, customer, owner or stage…"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-500">
              <span>Opportunity status</span>
              <select
                value={opportunityStatusFilter}
                onChange={event => setOpportunityStatusFilter(event.target.value as typeof opportunityStatusFilter)}
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-[var(--sami-border)] p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="min-w-0 flex-1 space-y-1 text-xs font-bold text-slate-500">
                <span>Save current opportunity view</span>
                <input
                  type="text"
                  maxLength={80}
                  value={opportunitySavedViewName}
                  onChange={event => setOpportunitySavedViewName(event.target.value)}
                  placeholder="e.g. Open deals this month"
                  className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                />
              </label>
              <button type="button" disabled={busy || !opportunitySavedViewName.trim()} onClick={() => void savePipelineView('opportunities')} className="mt-5 h-10 shrink-0 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-50">
                Save view
              </button>
            </div>
            {pipelineViewsError ? <p role="alert" className="mt-2 text-xs text-rose-600">{pipelineViewsError}</p> : null}
            {pipelineViewsLoading ? (
              <p className="mt-3 text-xs text-slate-500">Loading saved pipeline views…</p>
            ) : savedPipelineViews.filter(view => view.viewType === 'opportunities').length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Saved opportunity views">
                {savedPipelineViews.filter(view => view.viewType === 'opportunities').map(view => (
                  <div key={view.id} className="inline-flex max-w-full items-center rounded-lg border border-[var(--sami-border)]">
                    <button type="button" disabled={busy} aria-label={'Apply saved opportunity view ' + view.name} onClick={() => applySavedPipelineView(view)} className="max-w-[15rem] truncate px-3 py-2 text-xs font-bold hover:bg-slate-500/[0.05] disabled:opacity-50">
                      {view.name}
                    </button>
                    <button type="button" disabled={busy} aria-label={'Delete saved opportunity view ' + view.name} onClick={() => void deleteSavedPipelineView(view)} className="border-l border-[var(--sami-border)] px-2 py-2 text-xs text-slate-500 hover:text-rose-600 disabled:opacity-50">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No saved opportunity views yet.</p>
            )}
          </div>
          <div className="mt-3 space-y-3">
            {filteredOpportunities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">
                {data.opportunities.length === 0
                  ? 'No opportunities yet. Qualify a lead to create the first pipeline opportunity.'
                  : 'No opportunities match the current search and status filter.'}
              </p>
            ) : filteredOpportunities.map(opportunity => (
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
                    {opportunity.customer_name || opportunity.contact_name || opportunity.email || opportunity.phone ? (
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {[opportunity.customer_name, opportunity.contact_name, opportunity.email, opportunity.phone].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      Owner: {data.salespeople.find(person => person.id === opportunity.salesperson_user_id)?.name || 'Unassigned'}
                      {opportunity.source ? ' · Source: ' + opportunity.source : ''}
                    </p>
                    {opportunity.stage_type === 'lost' && opportunity.lost_reason ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-rose-600 dark:text-rose-300">
                        Loss reason: {opportunity.lost_reason}
                      </p>
                    ) : null}
                    {opportunity.stage_type === 'won' && opportunity.won_at ? (
                      <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                        Won on {String(opportunity.won_at).slice(0, 10)}
                      </p>
                    ) : null}
                    {opportunity.stage_type === 'lost' && opportunity.lost_at ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Lost on {String(opportunity.lost_at).slice(0, 10)}
                      </p>
                    ) : null}
                  </div>
                  <select
                    aria-label={'Stage for ' + opportunity.name}
                    value={opportunity.stage_id}
                    disabled={busy || !canManagePipeline}
                    onChange={event => changeOpportunityStage(opportunity.id, event.target.value)}
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
                  {canManagePipeline && opportunity.stage_type === 'open' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => beginOpportunityEdit(opportunity)}
                      className="text-slate-600 hover:underline disabled:opacity-60 dark:text-slate-300"
                    >
                      Edit opportunity
                    </button>
                  ) : null}
                  {canManagePipeline && opportunity.stage_type === 'open' && data.stages.some(stage => stage.stage_type === 'won') ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markOpportunityWon(opportunity)}
                      className="text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-300"
                    >
                      Mark won
                    </button>
                  ) : null}
                  {canManagePipeline && opportunity.stage_type === 'open' && data.stages.some(stage => stage.stage_type === 'lost') ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => beginOpportunityLoss(opportunity)}
                      className="text-rose-600 hover:underline disabled:opacity-60 dark:text-rose-300"
                    >
                      Mark lost
                    </button>
                  ) : null}
                  {canManagePipeline && opportunity.stage_type !== 'open' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reopenOpportunity(opportunity)}
                      className="text-blue-600 hover:underline disabled:opacity-60"
                    >
                      Reopen opportunity
                    </button>
                  ) : null}
                </div>

                {editingOpportunityId === opportunity.id ? (
                  <form
                    onSubmit={event => void saveOpportunityEdit(event, opportunity)}
                    className="mt-4 grid gap-3 rounded-xl bg-slate-500/[0.04] p-3 sm:grid-cols-2"
                  >
                    <h4 className="text-sm font-black sm:col-span-2">Edit opportunity</h4>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Opportunity name *</span>
                      <input
                        required
                        value={opportunityDraft.name}
                        onChange={event => setOpportunityDraft(current => ({ ...current, name: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Customer / company</span>
                      <input
                        value={opportunityDraft.customerName}
                        onChange={event => setOpportunityDraft(current => ({ ...current, customerName: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Contact name</span>
                      <input
                        value={opportunityDraft.contactName}
                        onChange={event => setOpportunityDraft(current => ({ ...current, contactName: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Email</span>
                      <input
                        type="email"
                        value={opportunityDraft.email}
                        onChange={event => setOpportunityDraft(current => ({ ...current, email: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Phone</span>
                      <input
                        type="tel"
                        value={opportunityDraft.phone}
                        onChange={event => setOpportunityDraft(current => ({ ...current, phone: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Expected deal value *</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={opportunityDraft.expectedValue}
                        onChange={event => setOpportunityDraft(current => ({ ...current, expectedValue: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Currency *</span>
                      <input
                        required
                        minLength={3}
                        maxLength={3}
                        value={opportunityDraft.currency}
                        onChange={event => setOpportunityDraft(current => ({ ...current, currency: event.target.value.toUpperCase() }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Expected close date</span>
                      <input
                        type="date"
                        value={opportunityDraft.expectedCloseDate}
                        onChange={event => setOpportunityDraft(current => ({ ...current, expectedCloseDate: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Assigned salesperson</span>
                      <select
                        value={opportunityDraft.salespersonUserId}
                        onChange={event => setOpportunityDraft(current => ({ ...current, salespersonUserId: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      >
                        <option value="">Unassigned</option>
                        {data.salespeople.map(person => (
                          <option key={person.id} value={person.id}>{person.name} · {person.email}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500">
                      <span>Source</span>
                      <input
                        value={opportunityDraft.source}
                        onChange={event => setOpportunityDraft(current => ({ ...current, source: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
                      <span>Notes</span>
                      <textarea
                        rows={3}
                        value={opportunityDraft.notes}
                        onChange={event => setOpportunityDraft(current => ({ ...current, notes: event.target.value }))}
                        className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="submit" disabled={busy || !opportunityDraft.name.trim() || !opportunityDraft.expectedValue.trim() || opportunityDraft.currency.trim().length !== 3} className="h-10 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60">
                        {busy ? 'Saving…' : 'Save opportunity'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setEditingOpportunityId(null)} className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                {closingOpportunityId === opportunity.id && closingOpportunityStageId ? (
                  <form
                    onSubmit={event => void confirmOpportunityLost(event, opportunity)}
                    className="mt-4 space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-3"
                  >
                    <h4 className="text-sm font-black">Mark opportunity lost</h4>
                    <label className="block space-y-1 text-xs font-bold text-slate-500">
                      <span>Reason for loss *</span>
                      <textarea
                        required
                        rows={3}
                        value={opportunityLossReason}
                        onChange={event => setOpportunityLossReason(event.target.value)}
                        className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={busy || !opportunityLossReason.trim()} className="h-10 rounded-lg bg-rose-600 px-3.5 text-xs font-black text-white disabled:opacity-60">
                        {busy ? 'Saving…' : 'Confirm loss'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => { setClosingOpportunityId(null); setClosingOpportunityStageId(null); setOpportunityLossReason(''); }} className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

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
                <section className="mt-3 rounded-xl border border-[var(--sami-border)] bg-slate-500/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-black">Opportunity activities · {data.opportunityActivities.filter(activity => activity.opportunity_id === opportunity.id).length}</h4>
                    {canManagePipeline && opportunity.stage_type === 'open' ? <button type="button" disabled={busy} onClick={() => beginOpportunityActivity(opportunity)} className="h-9 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60">Schedule follow-up</button> : null}
                  </div>
                  {data.opportunityActivities.filter(activity => activity.opportunity_id === opportunity.id).length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No opportunity activities recorded yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {data.opportunityActivities.filter(activity => activity.opportunity_id === opportunity.id).slice(0, 5).map(activity => (
                        <article key={activity.id} className="rounded-lg border border-[var(--sami-border)] p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words text-xs font-black">{activity.subject}</p><span className={activity.status === 'planned' ? 'text-xs font-bold text-blue-600' : activity.status === 'completed' ? 'text-xs font-bold text-emerald-700' : 'text-xs font-bold text-slate-400'}>{activity.status}</span></div>
                          <p className="mt-1 text-[11px] text-slate-500">{activity.activity_type} · {formatActivityDate(activity.due_date)} · {data.salespeople.find(person => person.id === activity.assigned_user_id)?.name || 'Unassigned'}</p>
                          {activity.description ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{activity.description}</p> : null}
                          {canManagePipeline && activity.status === 'planned' ? <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-black">
                            <button type="button" disabled={busy} onClick={() => beginActivityEdit(activity)} className="text-slate-600 hover:underline disabled:opacity-60 dark:text-slate-300">Edit / reschedule</button>
                            <button type="button" disabled={busy} onClick={() => void updateActivity(activity, 'completed')} className="text-emerald-700 hover:underline disabled:opacity-60">Complete</button>
                            <button type="button" disabled={busy} onClick={() => void updateActivity(activity, 'cancelled')} className="text-slate-500 hover:underline disabled:opacity-60">Cancel</button>
                          </div> : null}
                        </article>
                      ))}
                    </div>
                  )}
                  {activityOpportunityId === opportunity.id ? <form onSubmit={event => void createOpportunityActivity(event, opportunity)} className="mt-3 grid gap-3 rounded-xl bg-slate-500/[0.04] p-3 sm:grid-cols-2">
                    <h5 className="text-xs font-black sm:col-span-2">Schedule opportunity follow-up</h5>
                    <label className="space-y-1 text-xs font-bold text-slate-500"><span>Activity type</span><select value={activityDraft.activityType} onChange={event => setActivityDraft(current => ({ ...current, activityType: event.target.value as ActivityDraft['activityType'] }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"><option value="task">Task</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option></select></label>
                    <label className="space-y-1 text-xs font-bold text-slate-500"><span>Due date</span><input type="date" value={activityDraft.dueDate} onChange={event => setActivityDraft(current => ({ ...current, dueDate: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2"><span>Subject *</span><input required value={activityDraft.subject} onChange={event => setActivityDraft(current => ({ ...current, subject: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2"><span>Assigned to</span><select value={activityDraft.assignedUserId} onChange={event => setActivityDraft(current => ({ ...current, assignedUserId: event.target.value }))} className="h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal text-slate-900 dark:text-slate-100"><option value="">Unassigned</option>{data.salespeople.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label>
                    <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2"><span>Details</span><textarea rows={2} value={activityDraft.description} onChange={event => setActivityDraft(current => ({ ...current, description: event.target.value }))} className="w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm font-normal text-slate-900 dark:text-slate-100" /></label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={busy || !activityDraft.subject.trim()} className="h-10 rounded-lg bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60">{busy ? 'Saving…' : 'Schedule follow-up'}</button><button type="button" disabled={busy} onClick={() => setActivityOpportunityId(null)} className="h-10 rounded-lg border border-[var(--sami-border)] px-3.5 text-xs font-black disabled:opacity-60">Cancel</button></div>
                  </form> : null}
                </section>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-black">
                  <button
                    type="button"
                    aria-expanded={expandedOpportunityHistoryId === opportunity.id}
                    onClick={() => setExpandedOpportunityHistoryId(current => current === opportunity.id ? null : opportunity.id)}
                    className="text-slate-600 hover:underline dark:text-slate-300"
                  >
                    {expandedOpportunityHistoryId === opportunity.id ? 'Hide stage history' : 'Stage history'}
                    {' · '}
                    {data.opportunityHistory.filter(entry => entry.opportunity_id === opportunity.id).length}
                  </button>
                </div>
                {expandedOpportunityHistoryId === opportunity.id ? (
                  <section className="mt-3 rounded-xl border border-[var(--sami-border)] bg-slate-500/[0.03] p-3">
                    <h4 className="text-xs font-black">Opportunity stage history</h4>
                    {data.opportunityHistory.filter(entry => entry.opportunity_id === opportunity.id).length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">No stage transitions have been recorded yet.</p>
                    ) : (
                      <>
                        <div className="mt-3 space-y-3">
                          {data.opportunityHistory
                            .filter(entry => entry.opportunity_id === opportunity.id)
                            .slice(0, 10)
                            .map(entry => (
                              <article key={entry.id} className="relative border-l-2 border-[var(--sami-border)] pl-3">
                                <p className="text-xs font-black">
                                  {entry.from_stage_name || 'Opportunity created'}
                                  {' → '}
                                  {entry.to_stage_name}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {formatHistoryTimestamp(entry.created_at)}
                                  {' · Probability '}
                                  {Number(entry.probability).toFixed(0)}%
                                  {' · '}
                                  {data.salespeople.find(person => person.id === entry.changed_by)?.name || 'Former or unavailable user'}
                                </p>
                                {entry.reason ? (
                                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
                                    Reason: {entry.reason}
                                  </p>
                                ) : null}
                              </article>
                            ))}
                        </div>
                        {data.opportunityHistory.filter(entry => entry.opportunity_id === opportunity.id).length > 10 ? (
                          <p className="mt-3 text-[10px] text-slate-500">Showing the latest 10 transitions.</p>
                        ) : null}
                      </>
                    )}
                  </section>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
