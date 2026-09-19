import 'server-only';

import type {
  ModuleContext,
} from '@/lib/auth/account-context';

import type {
  PermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getDashboardProviders,
  type DashboardProviderContext,
} from '@/lib/dashboard/providers';

import type {
  DashboardAction,
  DashboardAiContextItem,
  DashboardAttentionItem,
  DashboardBrief,
  DashboardMetric,
  DashboardPriority,
  DashboardRecentItem,
  DashboardScope,
  DashboardViewModel,
  DashboardWorkItem,
} from '@/lib/dashboard/types';


/* ================================================================
   LIMITS
   ================================================================ */

const ATTENTION_LIMIT =
  6;

const WORK_LIMIT =
  8;

const METRIC_LIMIT =
  6;

const RECENT_LIMIT =
  6;

const ACTION_LIMIT =
  8;

const AI_CONTEXT_LIMIT =
  8;


/* ================================================================
   DEFAULTS
   ================================================================ */

/*
 * IMPORTANT:
 *
 * Keep this explicitly typed.
 *
 * Without the DashboardScope[] annotation TypeScript widens:
 *
 *   ['my']
 *
 * into:
 *
 *   string[]
 *
 * which then causes:
 *
 *   string[][] is not assignable to DashboardScope[][]
 */
const DEFAULT_PROVIDER_SCOPES:
  DashboardScope[] = [
    'my',
  ];


/* ================================================================
   PRIORITY
   ================================================================ */

const PRIORITY_WEIGHT:
  Record<
    DashboardPriority,
    number
  > = {
  critical:
    0,

  high:
    1,

  normal:
    2,

  low:
    3,
};


/* ================================================================
   HELPERS
   ================================================================ */

function priorityValue(
  priority:
    DashboardPriority,
): number {
  return PRIORITY_WEIGHT[
    priority
  ];
}


function dateValue(
  value:
    string | null,
): number {
  if (
    !value
  ) {
    return Number.MAX_SAFE_INTEGER;
  }


  const time =
    new Date(
      value,
    )
      .getTime();


  return Number.isFinite(
    time,
  )
    ? time
    : Number.MAX_SAFE_INTEGER;
}


function recentDateValue(
  value:
    string,
): number {
  const time =
    new Date(
      value,
    )
      .getTime();


  return Number.isFinite(
    time,
  )
    ? time
    : 0;
}


/* ================================================================
   SORTING
   ================================================================ */

function sortAttention(
  a:
    DashboardAttentionItem,

  b:
    DashboardAttentionItem,
): number {
  const priorityDifference =
    priorityValue(
      a.priority,
    ) -
    priorityValue(
      b.priority,
    );


  if (
    priorityDifference !==
    0
  ) {
    return priorityDifference;
  }


  return (
    dateValue(
      a.dueAt,
    ) -
    dateValue(
      b.dueAt,
    )
  );
}


function sortWork(
  a:
    DashboardWorkItem,

  b:
    DashboardWorkItem,
): number {
  const priorityDifference =
    priorityValue(
      a.priority,
    ) -
    priorityValue(
      b.priority,
    );


  if (
    priorityDifference !==
    0
  ) {
    return priorityDifference;
  }


  return (
    dateValue(
      a.dueAt,
    ) -
    dateValue(
      b.dueAt,
    )
  );
}


function sortRecent(
  a:
    DashboardRecentItem,

  b:
    DashboardRecentItem,
): number {
  return (
    recentDateValue(
      b.occurredAt,
    ) -
    recentDateValue(
      a.occurredAt,
    )
  );
}


/* ================================================================
   UNIQUE
   ================================================================ */

function uniqueById<
  T extends {
    id:
      string;
  },
>(
  items:
    T[],
): T[] {
  const seen =
    new Set<string>();


  return items.filter(
    item => {
      if (
        seen.has(
          item.id,
        )
      ) {
        return false;
      }


      seen.add(
        item.id,
      );


      return true;
    },
  );
}


/* ================================================================
   AVAILABLE SCOPES
   ================================================================ */

function resolveAvailableScopes(
  input: {
    isOwner:
      boolean;

    providerScopes:
      DashboardScope[][];
  },
): DashboardScope[] {
  const scopes =
    new Set<DashboardScope>([
      'my',
    ]);


  for (
    const providerScopes
    of input.providerScopes
  ) {
    for (
      const scope
      of providerScopes
    ) {
      scopes.add(
        scope,
      );
    }
  }


  /*
   * Owners are eligible for business-level dashboard composition.
   *
   * Individual providers must still enforce:
   *
   * - company access
   * - record access
   * - module permissions
   * - data scope
   */
  if (
    input.isOwner
  ) {
    scopes.add(
      'business',
    );
  }


  const order:
    DashboardScope[] = [
    'my',
    'team',
    'business',
  ];


  return order.filter(
    scope =>
      scopes.has(
        scope,
      ),
  );
}


/* ================================================================
   DEFAULT SCOPE
   ================================================================ */

function resolveDefaultScope(
  input: {
    requestedScope?:
      DashboardScope;

    availableScopes:
      DashboardScope[];

    isOwner:
      boolean;
  },
): DashboardScope {
  if (
    input.requestedScope &&
    input.availableScopes.includes(
      input.requestedScope,
    )
  ) {
    return input.requestedScope;
  }


  /*
   * Owner starts with the clearest business operating picture.
   *
   * They can still later switch to My Work when the UI scope
   * selector is implemented.
   */
  if (
    input.isOwner &&
    input.availableScopes.includes(
      'business',
    )
  ) {
    return 'business';
  }


  return 'my';
}


/* ================================================================
   BRIEF
   ================================================================ */

function buildBrief(
  input: {
    attention:
      DashboardAttentionItem[];

    work:
      DashboardWorkItem[];

    actions:
      DashboardAction[];

    moduleCount:
      number;

    aiEnabled:
      boolean;
  },
): DashboardBrief {
  const briefActions:
    DashboardAction[] =
    [];


  /*
   * Prefer useful application actions first.
   */
  for (
    const action
    of input.actions
  ) {
    if (
      briefActions.length >=
      2
    ) {
      break;
    }


    briefActions.push(
      action,
    );
  }


  /*
   * SaMi AI is a platform action.
   *
   * It appears only if the effective user permissions include ai.use.
   */
  if (
    input.aiEnabled
  ) {
    briefActions.push({
      id:
        'core:ask-sami',

      moduleKey:
        null,

      label:
        'Ask SaMi',

      description:
        'Ask SaMi about information available to your current workspace access.',

      href:
        '/ai',

      priority:
        'normal',
    });
  }


  /* ==============================================================
     ATTENTION BRIEF
     ============================================================== */

  if (
    input.attention.length >
    0
  ) {
    const top =
      input.attention
        .slice(
          0,
          3,
        )
        .map(
          item =>
            item.title,
        );


    return {
      title:
        input.attention.length ===
        1
          ? '1 item needs your attention'
          : `${input.attention.length} items need your attention`,

      message:
        top.join(
          ' · ',
        ),

      actions:
        briefActions.slice(
          0,
          3,
        ),
    };
  }


  /* ==============================================================
     ACTIVE WORK BRIEF
     ============================================================== */

  if (
    input.work.length >
    0
  ) {
    return {
      title:
        'Your work is ready',

      message:
        input.work.length ===
        1
          ? 'You have 1 active work item in your current workspace.'
          : `You have ${input.work.length} active work items in your current workspace.`,

      actions:
        briefActions.slice(
          0,
          3,
        ),
    };
  }


  /* ==============================================================
     ACCESSIBLE APPLICATIONS BRIEF
     ============================================================== */

  if (
    input.moduleCount >
    0
  ) {
    return {
      title:
        'Your workspace is ready',

      message:
        input.moduleCount ===
        1
          ? 'Your permitted application is ready. SaMi will surface relevant work here as its dashboard provider becomes active.'
          : `Your ${input.moduleCount} permitted applications are ready. SaMi will combine relevant work here as their dashboard providers become active.`,

      actions:
        briefActions.slice(
          0,
          3,
        ),
    };
  }


  /* ==============================================================
     EMPTY ACCESS
     ============================================================== */

  return {
    title:
      'Welcome to SaMi',

    message:
      'No business applications are currently available to your workspace access.',

    actions:
      briefActions.slice(
        0,
        3,
      ),
  };
}


/* ================================================================
   METRIC SCOPE
   ================================================================ */

function metricAllowedForScope(
  metric:
    DashboardMetric,

  scope:
    DashboardScope,
): boolean {
  /*
   * "my" dashboard:
   *
   * only personal metrics.
   */
  if (
    scope ===
    'my'
  ) {
    return (
      metric.scope ===
      'my'
    );
  }


  /*
   * "team":
   *
   * may combine personal + team metrics.
   */
  if (
    scope ===
    'team'
  ) {
    return (
      metric.scope ===
        'my' ||
      metric.scope ===
        'team'
    );
  }


  /*
   * "business":
   *
   * may combine:
   *
   * - personal
   * - team
   * - business
   *
   * Providers remain responsible for returning only data the
   * current permission context may actually access.
   */
  return (
    metric.scope ===
      'my' ||
    metric.scope ===
      'team' ||
    metric.scope ===
      'business'
  );
}


/* ================================================================
   COMPOSER
   ================================================================ */

export async function composeDashboard(
  input: {
    userId:
      string;

    permissions:
      PermissionContext;

    modules:
      ModuleContext[];

    currentCompanyId:
      string | null;

    selectedCompanyIds:
      string[];

    allowedCompanyIds:
      string[];

    requestedScope?:
      DashboardScope;
  },
): Promise<DashboardViewModel> {
  /*
   * getDashboardProviders() only returns providers corresponding
   * to modules already resolved as accessible for this user.
   */
  const providers =
    getDashboardProviders(
      input.modules,
    );


  /*
   * IMPORTANT TYPE FIX:
   *
   * DEFAULT_PROVIDER_SCOPES is explicitly DashboardScope[].
   *
   * Therefore this expression remains:
   *
   * DashboardScope[][]
   *
   * rather than becoming:
   *
   * string[][]
   */
  const providerScopes:
    DashboardScope[][] =
    providers.map(
      provider =>
        provider
          .supportedScopes ??
        DEFAULT_PROVIDER_SCOPES,
    );


  const availableScopes =
    resolveAvailableScopes({
      isOwner:
        input.permissions
          .isOwner,

      providerScopes,
    });


  const scope =
    resolveDefaultScope({
      requestedScope:
        input.requestedScope,

      availableScopes,

      isOwner:
        input.permissions
          .isOwner,
    });


  /* ==============================================================
     PROVIDER CONTEXT
     ============================================================== */

  const context:
    DashboardProviderContext = {
    userId:
      input.userId,

    tenantId:
      input.permissions
        .tenantId,

    membershipId:
      input.permissions
        .membershipId,

    isOwner:
      input.permissions
        .isOwner,

    scope,

    currentCompanyId:
      input.currentCompanyId,

    selectedCompanyIds: [
      ...input.selectedCompanyIds,
    ],

    allowedCompanyIds: [
      ...input.allowedCompanyIds,
    ],

    permissions:
      input.permissions,
  };


  /* ==============================================================
     LOAD PROVIDERS

     One broken module must not crash the whole SaMi dashboard.
     ============================================================== */

  const results =
    await Promise.allSettled(
      providers.map(
        provider =>
          provider.load(
            context,
          ),
      ),
    );


  const attention:
    DashboardAttentionItem[] =
    [];


  const work:
    DashboardWorkItem[] =
    [];


  const metrics:
    DashboardMetric[] =
    [];


  const recent:
    DashboardRecentItem[] =
    [];


  const actions:
    DashboardAction[] =
    [];


  const aiContext:
    DashboardAiContextItem[] =
    [];


  /* ==============================================================
     MERGE CONTRIBUTIONS
     ============================================================== */

  for (
    let index =
      0;

    index <
    results.length;

    index +=
      1
  ) {
    const result =
      results[
        index
      ];


    const provider =
      providers[
        index
      ];


    if (
      !provider
    ) {
      continue;
    }


    if (
      result.status ===
      'rejected'
    ) {
      console.error(
        `[SaMi Dashboard] Provider "${provider.moduleKey}" failed:`,
        result.reason,
      );


      continue;
    }


    const contribution =
      result.value;


    /*
     * Security consistency:
     *
     * Ignore a malformed provider response claiming to belong
     * to another module.
     */
    if (
      contribution.moduleKey
        .trim()
        .toLowerCase() !==
      provider.moduleKey
        .trim()
        .toLowerCase()
    ) {
      console.error(
        `[SaMi Dashboard] Provider "${provider.moduleKey}" returned contribution for "${contribution.moduleKey}".`,
      );


      continue;
    }


    attention.push(
      ...(
        contribution.attention ||
        []
      ),
    );


    work.push(
      ...(
        contribution.work ||
        []
      ),
    );


    metrics.push(
      ...(
        contribution.metrics ||
        []
      ),
    );


    recent.push(
      ...(
        contribution.recent ||
        []
      ),
    );


    actions.push(
      ...(
        contribution.actions ||
        []
      ),
    );


    aiContext.push(
      ...(
        contribution.aiContext ||
        []
      ),
    );
  }


  /* ==============================================================
     ATTENTION
     ============================================================== */

  const finalAttention =
    uniqueById(
      attention,
    )
      .sort(
        sortAttention,
      )
      .slice(
        0,
        ATTENTION_LIMIT,
      );


  /* ==============================================================
     WORK
     ============================================================== */

  const finalWork =
    uniqueById(
      work,
    )
      .sort(
        sortWork,
      )
      .slice(
        0,
        WORK_LIMIT,
      );


  /* ==============================================================
     METRICS
     ============================================================== */

  const finalMetrics =
    uniqueById(
      metrics,
    )
      .filter(
        metric =>
          metricAllowedForScope(
            metric,
            scope,
          ),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.weight -
          a.weight,
      )
      .slice(
        0,
        METRIC_LIMIT,
      );


  /* ==============================================================
     RECENT
     ============================================================== */

  const finalRecent =
    uniqueById(
      recent,
    )
      .sort(
        sortRecent,
      )
      .slice(
        0,
        RECENT_LIMIT,
      );


  /* ==============================================================
     ACTIONS
     ============================================================== */

  const finalActions =
    uniqueById(
      actions,
    )
      .sort(
        (
          a,
          b,
        ) =>
          priorityValue(
            a.priority,
          ) -
          priorityValue(
            b.priority,
          ),
      )
      .slice(
        0,
        ACTION_LIMIT,
      );


  /* ==============================================================
     AI CONTEXT
     ============================================================== */

  const finalAiContext =
    uniqueById(
      aiContext,
    )
      .sort(
        (
          a,
          b,
        ) =>
          priorityValue(
            a.priority,
          ) -
          priorityValue(
            b.priority,
          ),
      )
      .slice(
        0,
        AI_CONTEXT_LIMIT,
      );


  const aiEnabled =
    input.permissions
      .permissionSet
      .has(
        SAMI_PERMISSIONS
          .AI_USE,
      );


  /* ==============================================================
     FINAL VIEW MODEL
     ============================================================== */

  return {
    scope,

    availableScopes,

    brief:
      buildBrief({
        attention:
          finalAttention,

        work:
          finalWork,

        actions:
          finalActions,

        moduleCount:
          input.modules
            .length,

        aiEnabled,
      }),

    attention:
      finalAttention,

    work:
      finalWork,

    metrics:
      finalMetrics,

    recent:
      finalRecent,

    actions:
      finalActions,

    aiContext:
      finalAiContext,

    providerCount:
      providers.length,
  };
}