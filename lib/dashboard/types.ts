export type DashboardScope =
  | 'my'
  | 'team'
  | 'business';


export type DashboardPriority =
  | 'critical'
  | 'high'
  | 'normal'
  | 'low';


export type DashboardTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';


/* ================================================================
   ACTION
   ================================================================ */

export interface DashboardAction {
  id:
    string;

  moduleKey:
    string | null;

  label:
    string;

  description:
    string | null;

  href:
    string;

  priority:
    DashboardPriority;
}


/* ================================================================
   ATTENTION
   ================================================================ */

export interface DashboardAttentionItem {
  id:
    string;

  moduleKey:
    string;

  title:
    string;

  description:
    string | null;

  priority:
    DashboardPriority;

  tone:
    DashboardTone;

  dueAt:
    string | null;

  href:
    string | null;
}


/* ================================================================
   WORK
   ================================================================ */

export interface DashboardWorkItem {
  id:
    string;

  moduleKey:
    string;

  title:
    string;

  description:
    string | null;

  status:
    string | null;

  priority:
    DashboardPriority;

  dueAt:
    string | null;

  href:
    string | null;
}


/* ================================================================
   METRIC
   ================================================================ */

export interface DashboardMetric {
  id:
    string;

  moduleKey:
    string;

  label:
    string;

  value:
    string;

  description:
    string | null;

  tone:
    DashboardTone;

  scope:
    DashboardScope;

  weight:
    number;
}


/* ================================================================
   RECENT
   ================================================================ */

export interface DashboardRecentItem {
  id:
    string;

  moduleKey:
    string;

  title:
    string;

  description:
    string | null;

  occurredAt:
    string;

  href:
    string | null;
}


/* ================================================================
   AI CONTEXT
   ================================================================ */

export interface DashboardAiContextItem {
  id:
    string;

  moduleKey:
    string;

  title:
    string;

  detail:
    string;

  priority:
    DashboardPriority;
}


/* ================================================================
   MODULE CONTRIBUTION
   ================================================================ */

export interface DashboardContribution {
  moduleKey:
    string;

  availableScopes?:
    DashboardScope[];

  attention?:
    DashboardAttentionItem[];

  work?:
    DashboardWorkItem[];

  metrics?:
    DashboardMetric[];

  recent?:
    DashboardRecentItem[];

  actions?:
    DashboardAction[];

  aiContext?:
    DashboardAiContextItem[];
}


/* ================================================================
   BRIEF
   ================================================================ */

export interface DashboardBrief {
  title:
    string;

  message:
    string;

  actions:
    DashboardAction[];
}


/* ================================================================
   FINAL CLIENT VIEW MODEL
   ================================================================ */

export interface DashboardViewModel {
  scope:
    DashboardScope;

  availableScopes:
    DashboardScope[];

  brief:
    DashboardBrief;

  attention:
    DashboardAttentionItem[];

  work:
    DashboardWorkItem[];

  metrics:
    DashboardMetric[];

  recent:
    DashboardRecentItem[];

  actions:
    DashboardAction[];

  aiContext:
    DashboardAiContextItem[];

  providerCount:
    number;
}