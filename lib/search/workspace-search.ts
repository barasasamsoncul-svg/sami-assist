import 'server-only';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getCompanySelectorState,
} from '@/lib/auth/company-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getSession,
} from '@/lib/auth/session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  requireCompanyAccess,
} from '@/lib/services/company-access';

import {
  searchWorkspaceFiles,
} from '@/lib/services/workspace-files';

import {
  searchWorkspaceMessageRecipients,
} from '@/lib/services/workspace-messages';

import {
  getWorkspaceExternalAppLauncherEntries,
} from '@/lib/services/workspace-integrations';

import {
  getWorkspaceSearchProviders,
} from '@/lib/search/registry';

import type {
  WorkspaceSearchContext,
  WorkspaceSearchResult,
} from '@/lib/search/types';

const MAX_QUERY_LENGTH =
  120;

const DEFAULT_LIMIT =
  30;

const MAX_LIMIT =
  60;

export type WorkspaceSearchErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'INVALID_QUERY';

export class WorkspaceSearchError
  extends Error {
  readonly code:
    WorkspaceSearchErrorCode;

  constructor(
    code:
      WorkspaceSearchErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceSearchError';

    this.code =
      code;
  }
}

type SearchRuntimeContext = {
  search:
    WorkspaceSearchContext;

  accessibleModules:
    Array<{
      key: string;
      name: string;
      href: string;
      description: string;
      iconKey: string;
      categoryLabel: string;
      keywords: string[];
      status: string;
    }>;

  canManageApps:
    boolean;

  canViewBilling:
    boolean;

  aiAvailable:
    boolean;
};

type Candidate =
  WorkspaceSearchResult & {
    haystack:
      string;
  };

function normalize(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .normalize(
      'NFKD',
    )
    .replace(
      /\p{Diacritic}/gu,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9@._+-]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

function clampLimit(
  value:
    unknown,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <
      1
  ) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    Math.floor(
      parsed,
    ),
    MAX_LIMIT,
  );
}

function candidate(
  input:
    Omit<
      Candidate,
      'haystack'
    > & {
      keywords?:
        string[];
    },
): Candidate {
  const haystack =
    normalize(
      [
        input.title,
        input.subtitle ||
          '',
        input.description ||
          '',
        ...(
          input.keywords ||
          []
        ),
      ].join(
        ' ',
      ),
    );

  return {
    ...input,
    haystack,
  };
}

function scoreCandidate(
  query:
    string,
  item:
    Candidate,
) {
  if (!query) {
    return item.score;
  }

  const title =
    normalize(
      item.title,
    );

  const subtitle =
    normalize(
      item.subtitle,
    );

  const description =
    normalize(
      item.description,
    );

  let score =
    item.score;

  if (
    title ===
    query
  ) {
    score +=
      120;
  } else if (
    title.startsWith(
      query,
    )
  ) {
    score +=
      95;
  } else if (
    title.includes(
      query,
    )
  ) {
    score +=
      75;
  }

  if (
    subtitle ===
    query
  ) {
    score +=
      55;
  } else if (
    subtitle.startsWith(
      query,
    )
  ) {
    score +=
      40;
  } else if (
    subtitle.includes(
      query,
    )
  ) {
    score +=
      28;
  }

  if (
    description.includes(
      query,
    )
  ) {
    score +=
      18;
  }

  const tokens =
    query
      .split(
        ' ',
      )
      .filter(Boolean);

  const matched =
    tokens.filter(
      token =>
        item.haystack
          .includes(
            token,
          ),
    );

  score +=
    matched.length *
    10;

  if (
    tokens.length >
      1 &&
    matched.length ===
      tokens.length
  ) {
    score +=
      20;
  }

  return score;
}

function matches(
  query:
    string,
  item:
    Candidate,
) {
  if (!query) {
    return (
      item.kind ===
        'page' ||
      item.kind ===
        'app' ||
      item.kind ===
        'company'
    );
  }

  return item.haystack
    .includes(
      query,
    );
}

async function resolveSearchContext():
  Promise<SearchRuntimeContext> {
  const [
    permissions,
    session,
  ] =
    await Promise.all([
      getPermissionContext(),
      getSession(),
    ]);

  if (!session) {
    throw new WorkspaceSearchError(
      'UNAUTHENTICATED',
      'Sign in to search this workspace.',
    );
  }

  if (
    session.sessionId !==
      permissions.sessionId ||
    session.user.id !==
      permissions.userId ||
    session.currentTenantId !==
      permissions.tenantId
  ) {
    throw new WorkspaceSearchError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const companyId =
    session
      .currentCompanyId;

  if (!companyId) {
    throw new WorkspaceSearchError(
      'COMPANY_REQUIRED',
      'Select a company before searching the workspace.',
    );
  }

  try {
    await requireCompanyAccess(
      permissions.tenantId,
      permissions.userId,
      companyId,
    );
  } catch {
    if (
      !permissions
        .isOwner
    ) {
      throw new WorkspaceSearchError(
        'COMPANY_ACCESS_DENIED',
        'You do not have access to the selected company.',
      );
    }
  }

  const account =
    await getAccountContextForUser(
      permissions.userId,
      permissions.tenantId,
    );

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    });

  return {
    search: {
      userId:
        permissions.userId,
      tenantId:
        permissions.tenantId,
      companyId,
      isOwner:
        permissions.isOwner,
      permissionSet:
        permissions.permissionSet,
      accessibleModuleKeys:
        shell.accessibleModuleKeys,
    },

    accessibleModules:
      shell.accessibleModules,

    canManageApps:
      shell.canManageApps,

    canViewBilling:
      shell.canViewBilling,

    aiAvailable:
      shell.aiAvailable,
  };
}

function corePageCandidates(
  context:
    SearchRuntimeContext,
) {
  const can =
    (
      permission:
        string,
    ) =>
      context.search
        .isOwner ||
      context.search
        .permissionSet
        .has(
          permission,
        );

  const pages:
    Candidate[] =
    [
      candidate({
        id:
          'page:dashboard',
        kind:
          'page',
        title:
          'Dashboard',
        subtitle:
          'Workspace home',
        description:
          'Apps, activity and current company overview.',
        href:
          '/dashboard',
        iconKey:
          'home',
        badge:
          null,
        score:
          36,
        action:
          null,
        source:
          'core',
        keywords: [
          'home',
          'overview',
        ],
      }),

      candidate({
        id:
          'page:activity',
        kind:
          'page',
        title:
          'Activity',
        subtitle:
          'Company timeline',
        description:
          'Recent company activity and audit history where permitted.',
        href:
          '/activity',
        iconKey:
          'activity',
        badge:
          null,
        score:
          34,
        action:
          null,
        source:
          'core',
        keywords: [
          'audit',
          'history',
          'timeline',
          'events',
        ],
      }),

      candidate({
        id:
          'page:notifications',
        kind:
          'page',
        title:
          'Notifications & Messages',
        subtitle:
          'Workspace communication',
        description:
          'Alerts, employee messages and company announcements.',
        href:
          '/notifications',
        iconKey:
          'bell',
        badge:
          null,
        score:
          34,
        action:
          null,
        source:
          'core',
        keywords: [
          'messages',
          'chat',
          'alerts',
          'employees',
          'communication',
        ],
      }),

      candidate({
        id:
          'page:search',
        kind:
          'page',
        title:
          'Search',
        subtitle:
          'Global workspace search',
        description:
          'Find apps, companies, coworkers, files and permitted records.',
        href:
          '/search',
        iconKey:
          'search',
        badge:
          null,
        score:
          32,
        action:
          null,
        source:
          'core',
        keywords: [
          'find',
          'lookup',
        ],
      }),

      candidate({
        id:
          'page:help',
        kind:
          'page',
        title:
          'Help',
        subtitle:
          'Workspace help',
        description:
          'Open help and workspace guidance.',
        href:
          '/help',
        iconKey:
          'help',
        badge:
          null,
        score:
          18,
        action:
          null,
        source:
          'core',
        keywords: [
          'support',
          'guide',
        ],
      }),
    ];

  if (
    can(
      SAMI_PERMISSIONS
        .AUTOMATION_VIEW,
    ) ||
    can(
      SAMI_PERMISSIONS
        .AUTOMATION_MANAGE,
    )
  ) {
    pages.push(
      candidate({
        id:
          'page:automation',
        kind:
          'page',
        title:
          'Automation',
        subtitle:
          'Workflows & rules',
        description:
          'Build permission-aware business workflows from registered SaMi triggers and actions.',
        href:
          '/automation',
        iconKey:
          'workflow',
        badge:
          null,
        score:
          34,
        action:
          null,
        source:
          'core',
        keywords: [
          'workflow',
          'rules',
          'triggers',
          'actions',
          'scheduled',
        ],
      }),
    );
  }


  if (
    can(
      SAMI_PERMISSIONS
        .INTEGRATIONS_VIEW,
    ) ||
    can(
      SAMI_PERMISSIONS
        .INTEGRATIONS_MANAGE,
    )
  ) {
    pages.push(
      candidate({
        id:
          'page:integrations',
        kind:
          'page',
        title:
          'Integrations',
        subtitle:
          'Connections, webhooks & external apps',
        description:
          'Connect approved cloud services, manage webhooks and provision external business apps.',
        href:
          '/integrations',
        iconKey:
          'plug',
        badge:
          null,
        score:
          34,
        action:
          null,
        source:
          'core',
        keywords: [
          'connections',
          'oauth',
          'webhooks',
          'external apps',
          'google workspace',
          'microsoft 365',
          'slack',
          'sso',
        ],
      }),
    );
  }


  if (
    can(
      SAMI_PERMISSIONS
        .API_VIEW,
    ) ||
    can(
      SAMI_PERMISSIONS
        .API_MANAGE,
    )
  ) {
    pages.push(
      candidate({
        id:
          'page:developer',
        kind:
          'page',
        title:
          'Developer Access',
        subtitle:
          'API keys, scopes & usage',
        description:
          'Create company-scoped API credentials and review developer API activity.',
        href:
          '/developer',
        iconKey:
          'key',
        badge:
          null,
        score:
          34,
        action:
          null,
        source:
          'core',
        keywords: [
          'api',
          'developer',
          'keys',
          'token',
          'scopes',
          'rate limits',
        ],
      }),
    );
  }


  if (
    context.aiAvailable
  ) {
    pages.push(
      candidate({
        id:
          'page:ai',
        kind:
          'page',
        title:
          'SaMi AI',
        subtitle:
          'Permission-aware business assistant',
        description:
          'Ask SaMi about information available to your current workspace access.',
        href:
          '/ai',
        iconKey:
          'sparkles',
        badge:
          'AI',
        score:
          35,
        action:
          null,
        source:
          'core',
        keywords: [
          'assistant',
          'chat',
          'business ai',
          'sami',
        ],
      }),
    );
  }

  if (
    context
      .accessibleModules
      .length >
      0 ||
    context
      .canManageApps
  ) {
    pages.push(
      candidate({
        id:
          'page:apps',
        kind:
          'page',
        title:
          'Apps',
        subtitle:
          'Business applications',
        description:
          'Open installed SaMi business apps.',
        href:
          '/apps',
        iconKey:
          'layout-grid',
        badge:
          null,
        score:
          30,
        action:
          null,
        source:
          'core',
        keywords: [
          'modules',
          'applications',
        ],
      }),
    );
  }

  const canSettings =
    [
      SAMI_PERMISSIONS
        .SETTINGS_VIEW,
      SAMI_PERMISSIONS
        .SETTINGS_MANAGE,
      SAMI_PERMISSIONS
        .ORGANIZATION_VIEW,
      SAMI_PERMISSIONS
        .ORGANIZATION_MANAGE,
      SAMI_PERMISSIONS
        .USERS_VIEW,
      SAMI_PERMISSIONS
        .USERS_MANAGE,
      SAMI_PERMISSIONS
        .ROLES_VIEW,
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    ].some(
      permission =>
        can(
          permission,
        ),
    );

  if (
    canSettings
  ) {
    pages.push(
      candidate({
        id:
          'page:settings',
        kind:
          'page',
        title:
          'Settings',
        subtitle:
          'Workspace settings',
        description:
          'Manage the settings available to your role.',
        href:
          '/settings',
        iconKey:
          'settings',
        badge:
          null,
        score:
          25,
        action:
          null,
        source:
          'core',
        keywords: [
          'preferences',
          'organization',
          'people',
          'roles',
        ],
      }),
    );
  }

  if (
    context
      .canViewBilling
  ) {
    pages.push(
      candidate({
        id:
          'page:billing',
        kind:
          'page',
        title:
          'Subscription & Billing',
        subtitle:
          'SaMi subscription',
        description:
          'View billing information available to your role.',
        href:
          '/settings?tab=billing',
        iconKey:
          'credit-card',
        badge:
          null,
        score:
          20,
        action:
          null,
        source:
          'core',
        keywords: [
          'plan',
          'payments',
          'subscription',
        ],
      }),
    );
  }

  return pages;
}

function appCandidates(
  context:
    SearchRuntimeContext,
) {
  return context
    .accessibleModules
    .map(
      module =>
        candidate({
          id:
            'app:' +
            module.key,
          kind:
            'app',
          title:
            module.name,
          subtitle:
            module.categoryLabel ||
            'Business app',
          description:
            module.description ||
            null,
          href:
            module.href ||
            '/apps',
          iconKey:
            module.iconKey ||
            module.key,
          badge:
            'App',
          score:
            module.status ===
              'active'
              ? 45
              : 38,
          action:
            null,
          source:
            module.key,
          keywords:
            module.keywords ||
            [],
        }),
    );
}

async function externalAppCandidates() {
  try {
    const apps =
      await getWorkspaceExternalAppLauncherEntries();

    return apps.map(
      app =>
        candidate({
          id:
            'external-app:' +
            app.id,
          kind:
            'app',
          title:
            app.name,
          subtitle:
            'External business app',
          description:
            app.description ||
            'Assigned external application.',
          href:
            app.launchUrl,
          iconKey:
            'external-link',
          badge:
            'External',
          score:
            40,
          action:
            null,
          source:
            'integrations',
          keywords: [
            'external',
            'connected',
            'launcher',
            app.authMode,
          ],
        }),
    );
  } catch {
    return [];
  }
}

async function companyCandidates() {
  const state =
    await getCompanySelectorState();

  return state
    .companies
    .map(
      company =>
        candidate({
          id:
            'company:' +
            company.id,
          kind:
            'company',
          title:
            company.name,
          subtitle:
            company.isCurrent
              ? 'Current company'
              : company.isDefault
                ? 'Default company'
                : 'Accessible company',
          description:
            company.isCurrent
              ? 'You are currently working in this company.'
              : 'Switch the current company context.',
          href:
            null,
          iconKey:
            'building',
          badge:
            company.isCurrent
              ? 'Current'
              : null,
          score:
            company.isCurrent
              ? 48
              : 40,
          action:
            company.isCurrent
              ? null
              : {
                  type:
                    'switch_company',
                  companyId:
                    company.id,
                },
          source:
            'companies',
          keywords: [
            company.currency ||
              '',
            company.timezone ||
              '',
            company.country ||
              '',
          ],
        }),
    );
}

async function peopleCandidates(
  query:
    string,
) {
  const recipients =
    await searchWorkspaceMessageRecipients(
      query,
      30,
    );

  return recipients.map(
    recipient =>
      candidate({
        id:
          'person:' +
          recipient.id,
        kind:
          'person',
        title:
          recipient.name,
        subtitle:
          recipient.email,
        description:
          recipient.isOwner
            ? 'Workspace owner'
            : 'Coworker in the current company',
        href:
          null,
        iconKey:
          'user',
        badge:
          recipient.isOwner
            ? 'Owner'
            : null,
        score:
          28,
        action: {
          type:
            'message_user',
          userId:
            recipient.id,
        },
        source:
          'people',
        keywords: [
          recipient.email,
        ],
      }),
  );
}

async function fileCandidates(
  query:
    string,
) {
  try {
    const files =
      await searchWorkspaceFiles(
        query,
        30,
      );

    return files.map(
      file =>
        candidate({
          id:
            'file:' +
            file.id,
          kind:
            'file',
          title:
            file.name,
          subtitle:
            file.extension
              ? file.extension
                  .toUpperCase() +
                ' file'
              : file.mimeType,
          description:
            file.purpose !==
              'attachment'
              ? file.purpose
              : null,
          href:
            null,
          iconKey:
            'file',
          badge:
            null,
          score:
            26,
          action: {
            type:
              'download_file',
            fileId:
              file.id,
          },
          source:
            'files',
          keywords: [
            file.mimeType,
            file.extension ||
              '',
            file.purpose,
          ],
        }),
    );
  } catch {
    return [];
  }
}

export async function searchWorkspace(
  input: {
    query?: unknown;
    limit?: unknown;
  } = {},
) {
  const raw =
    typeof input.query ===
      'string'
      ? input.query
          .trim()
      : '';

  if (
    raw.length >
    MAX_QUERY_LENGTH
  ) {
    throw new WorkspaceSearchError(
      'INVALID_QUERY',
      'Search query is too long.',
    );
  }

  const query =
    normalize(
      raw,
    );

  const limit =
    clampLimit(
      input.limit,
    );

  const context =
    await resolveSearchContext();

  const core =
    corePageCandidates(
      context,
    );

  const apps =
    appCandidates(
      context,
    );

  const [
    companiesResult,
    externalAppsResult,
    peopleResult,
    filesResult,
  ] =
    await Promise.allSettled([
      companyCandidates(),
      externalAppCandidates(),
      query
        ? peopleCandidates(
            raw,
          )
        : Promise.resolve(
            [],
          ),
      query
        ? fileCandidates(
            raw,
          )
        : Promise.resolve(
            [],
          ),
    ]);

  const candidates:
    Candidate[] = [
    ...core,
    ...apps,
    ...(
      companiesResult.status ===
        'fulfilled'
        ? companiesResult.value
        : []
    ),
    ...(
      externalAppsResult.status ===
        'fulfilled'
        ? externalAppsResult.value
        : []
    ),
    ...(
      peopleResult.status ===
        'fulfilled'
        ? peopleResult.value
        : []
    ),
    ...(
      filesResult.status ===
        'fulfilled'
        ? filesResult.value
        : []
    ),
  ];

  if (query) {
    const providers =
      getWorkspaceSearchProviders(
        context.search
          .accessibleModuleKeys,
      );

    const providerResults =
      await Promise.allSettled(
        providers.map(
          provider =>
            provider.search(
              context.search,
              raw,
            ),
        ),
      );

    for (
      const result
      of providerResults
    ) {
      if (
        result.status !==
        'fulfilled'
      ) {
        continue;
      }

      for (
        const item
        of result.value
      ) {
        candidates.push(
          candidate({
            ...item,
            keywords: [],
          }),
        );
      }
    }
  }

  const deduped =
    new Map<
      string,
      Candidate
    >();

  for (
    const item
    of candidates
  ) {
    if (
      !matches(
        query,
        item,
      )
    ) {
      continue;
    }

    const score =
      scoreCandidate(
        query,
        item,
      );

    const key =
      item.kind +
      ':' +
      item.id;

    const existing =
      deduped.get(
        key,
      );

    if (
      !existing ||
      score >
        existing.score
    ) {
      deduped.set(
        key,
        {
          ...item,
          score,
        },
      );
    }
  }

  const results =
    [...deduped.values()]
      .sort(
        (
          a,
          b,
        ) =>
          b.score -
            a.score ||
          a.title.localeCompare(
            b.title,
          ),
      )
      .slice(
        0,
        limit,
      )
      .map(
        ({
          haystack:
            _haystack,
          ...item
        }) =>
          item,
      );

  const groups =
    results.reduce<
      Record<
        string,
        number
      >
    >(
      (
        output,
        item,
      ) => {
        output[
          item.kind
        ] =
          (
            output[
              item.kind
            ] ||
            0
          ) +
          1;

        return output;
      },
      {},
    );

  return {
    query:
      raw,
    results,
    groups,
    total:
      results.length,
  };
}
