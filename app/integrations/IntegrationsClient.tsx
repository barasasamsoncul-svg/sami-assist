'use client';

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  Users,
  X,
} from 'lucide-react';

import {
  useDeferredValue,
  useMemo,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type Provider = {
  key: string;
  name: string;
  description: string;
  category: string;
  iconKey: string;
  connectionType:
    'oauth2' |
    'webhook' |
    'external_app';
  websiteUrl:
    string | null;
  docsUrl:
    string | null;
  capabilities:
    string[];
  configured:
    boolean;
};

type Connection = {
  id: string;
  providerKey: string;
  connectionType: string;
  name: string;
  status: string;
  externalAccountId:
    string | null;
  externalAccountName:
    string | null;
  externalAccountEmail:
    string | null;
  scopes:
    string[];
  capabilities:
    string[];
  healthStatus: string;
  lastHealthCheckAt:
    string | null;
  lastSyncAt:
    string | null;
  connectedAt:
    string | null;
  disconnectedAt:
    string | null;
  createdAt: string;
  updatedAt: string;
};

type WebhookEndpoint = {
  id: string;
  connectionId:
    string | null;
  providerKey: string;
  endpointKey: string;
  endpointPath: string;
  name: string;
  status: string;
  eventKeys:
    string[];
  lastReceivedAt:
    string | null;
  createdAt: string;
  updatedAt: string;
};

type ExternalApp = {
  id: string;
  name: string;
  description:
    string | null;
  launchUrl: string;
  iconKey:
    string | null;
  authMode: string;
  status: string;
  assignmentMode: string;
  assignedToCurrentUser:
    boolean;
  lastHealthCheckAt:
    string | null;
  createdAt: string;
  updatedAt: string;
};

type SyncJob = {
  id: string;
  connectionId: string;
  connectionName: string;
  providerKey: string;
  direction: string;
  jobType: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  errorCode:
    string | null;
  errorMessage:
    string | null;
  correlationId: string;
  startedAt:
    string | null;
  completedAt:
    string | null;
  createdAt: string;
};

type IntegrationState = {
  canManage: boolean;
  providers:
    Provider[];
  connections:
    Connection[];
  webhooks:
    WebhookEndpoint[];
  externalApps:
    ExternalApp[];
  syncJobs:
    SyncJob[];
};

type OverlayState = {
  open: boolean;
  type:
    'success' |
    'error' |
    'warning' |
    'info';
  title: string;
  message: string;
};

type AssignmentUser = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
  roleKeys: string[];
  assigned: boolean;
};

type AssignmentRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions:
    Record<string, unknown>;
};

const CLOSED_OVERLAY:
  OverlayState = {
  open:
    false,
  type:
    'info',
  title:
    '',
  message:
    '',
};

function formatDate(
  value:
    string | null,
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return date.toLocaleString(
    undefined,
    {
      dateStyle:
        'medium',
      timeStyle:
        'short',
    },
  );
}

function tone(
  value:
    string,
) {
  if (
    [
      'connected',
      'healthy',
      'active',
      'succeeded',
    ].includes(
      value,
    )
  ) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (
    [
      'error',
      'expired',
      'revoked',
      'failed',
      'unreachable',
    ].includes(
      value,
    )
  ) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300';
  }

  if (
    [
      'degraded',
      'draft',
      'queued',
      'running',
    ].includes(
      value,
    )
  ) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300';
}

function providerLabel(
  providerKey:
    string,
  providers:
    Provider[],
) {
  return (
    providers.find(
      provider =>
        provider.key ===
        providerKey,
    )
      ?.name ||
    providerKey
  );
}

export default function IntegrationsClient({
  initialState,
}: {
  initialState:
    IntegrationState;
}) {
  const [
    state,
    setState,
  ] =
    useState(
      initialState,
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );

  const deferredSearch =
    useDeferredValue(
      search,
    );

  const [
    busy,
    setBusy,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    overlay,
    setOverlay,
  ] =
    useState(
      CLOSED_OVERLAY,
    );

  const [
    webhookOpen,
    setWebhookOpen,
  ] =
    useState(
      false,
    );

  const [
    externalOpen,
    setExternalOpen,
  ] =
    useState(
      false,
    );

  const [
    webhookName,
    setWebhookName,
  ] =
    useState(
      '',
    );

  const [
    webhookEvents,
    setWebhookEvents,
  ] =
    useState(
      '',
    );

  const [
    webhookSecret,
    setWebhookSecret,
  ] =
    useState<
      {
        endpointPath:
          string;
        secret:
          string;
      } | null
    >(
      null,
    );

  const [
    externalName,
    setExternalName,
  ] =
    useState(
      '',
    );

  const [
    externalDescription,
    setExternalDescription,
  ] =
    useState(
      '',
    );

  const [
    externalUrl,
    setExternalUrl,
  ] =
    useState(
      '',
    );

  const [
    externalAssignmentMode,
    setExternalAssignmentMode,
  ] =
    useState<
      'manual' |
      'all_internal'
    >(
      'manual',
    );

  const [
    assignmentApp,
    setAssignmentApp,
  ] =
    useState<
      ExternalApp | null
    >(
      null,
    );

  const [
    assignmentUsers,
    setAssignmentUsers,
  ] =
    useState<
      AssignmentUser[]
    >([]);

  const [
    selectedUsers,
    setSelectedUsers,
  ] =
    useState<
      Set<string>
    >(
      new Set(),
    );

  const [
    assignmentMode,
    setAssignmentMode,
  ] =
    useState<
      'manual' |
      'all_internal' |
      'rule'
    >(
      'manual',
    );

  const [
    ruleRoleKeys,
    setRuleRoleKeys,
  ] =
    useState<
      Set<string>
    >(
      new Set(),
    );

  const [
    ruleDomains,
    setRuleDomains,
  ] =
    useState(
      '',
    );

  const [
    ruleMatch,
    setRuleMatch,
  ] =
    useState<
      'all' |
      'any'
    >(
      'all',
    );

  function show(
    type:
      OverlayState['type'],
    title:
      string,
    message:
      string,
  ) {
    setOverlay({
      open:
        true,
      type,
      title,
      message,
    });
  }

  async function refresh() {
    setBusy(
      'refresh',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/integrations',
          {
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const data =
        await response.json() as
          IntegrationState & {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !response.ok ||
        data.success !==
          true
      ) {
        throw new Error(
          data.error ||
          'Integrations could not be refreshed.',
        );
      }

      setState({
        canManage:
          data.canManage,
        providers:
          data.providers ||
          [],
        connections:
          data.connections ||
          [],
        webhooks:
          data.webhooks ||
          [],
        externalApps:
          data.externalApps ||
          [],
        syncJobs:
          data.syncJobs ||
          [],
      });
    } catch (
      error
    ) {
      show(
        'error',
        'Refresh failed',
        error instanceof
          Error
          ? error.message
          : 'Integrations could not be refreshed.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function connectionOperation(
    connection:
      Connection,
    operation:
      'health_check' |
      'sync' |
      'disconnect',
  ) {
    const key =
      connection.id +
      ':' +
      operation;

    setBusy(
      key,
    );

    try {
      const response =
        await fetch(
          `/api/workspace/integrations/connections/${connection.id}`,
          {
            method:
              'PATCH',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              JSON.stringify({
                operation,
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Integration operation failed.',
        );
      }

      await refresh();

      show(
        'success',
        operation ===
          'disconnect'
          ? 'Disconnected'
          : operation ===
              'sync'
            ? 'Sync completed'
            : 'Health checked',
        operation ===
          'disconnect'
          ? 'The stored credential was removed and the connection was revoked.'
          : operation ===
              'sync'
            ? 'The registered provider sync handler completed successfully.'
            : 'SaMi checked the provider using the encrypted server-side credential.',
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Operation failed',
        error instanceof
          Error
          ? error.message
          : 'Integration operation failed.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function createWebhook() {
    const name =
      webhookName
        .trim();

    if (
      !name
    ) {
      show(
        'warning',
        'Name required',
        'Give the webhook a clear name.',
      );
      return;
    }

    setBusy(
      'create-webhook',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/integrations',
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              JSON.stringify({
                operation:
                  'create_webhook',
                name,
                eventKeys:
                  webhookEvents
                    .split(
                      /[\n,]+/,
                    )
                    .map(
                      value =>
                        value
                          .trim(),
                    )
                    .filter(
                      Boolean,
                    ),
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
          result?: {
            endpointPath?:
              string;
            secret?:
              string;
          };
        };

      if (
        !response.ok ||
        !data.success ||
        !data.result
          ?.endpointPath ||
        !data.result
          ?.secret
      ) {
        throw new Error(
          data.error ||
          'Webhook could not be created.',
        );
      }

      setWebhookSecret({
        endpointPath:
          data.result
            .endpointPath,
        secret:
          data.result
            .secret,
      });

      setWebhookName(
        '',
      );
      setWebhookEvents(
        '',
      );

      await refresh();
    } catch (
      error
    ) {
      show(
        'error',
        'Webhook creation failed',
        error instanceof
          Error
          ? error.message
          : 'Webhook could not be created.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function createExternalApp() {
    if (
      !externalName
        .trim() ||
      !externalUrl
        .trim()
    ) {
      show(
        'warning',
        'Details required',
        'Add an app name and launch URL.',
      );
      return;
    }

    setBusy(
      'create-external',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/integrations',
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              JSON.stringify({
                operation:
                  'create_external_app',
                name:
                  externalName,
                description:
                  externalDescription,
                launchUrl:
                  externalUrl,
                assignmentMode:
                  externalAssignmentMode,
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'External app could not be added.',
        );
      }

      setExternalOpen(
        false,
      );
      setExternalName(
        '',
      );
      setExternalDescription(
        '',
      );
      setExternalUrl(
        '',
      );
      setExternalAssignmentMode(
        'manual',
      );

      await refresh();

      show(
        'success',
        'External app added',
        'The app is now available according to its assignment policy.',
      );
    } catch (
      error
    ) {
      show(
        'error',
        'External app failed',
        error instanceof
          Error
          ? error.message
          : 'External app could not be added.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function openAssignments(
    app:
      ExternalApp,
  ) {
    setBusy(
      'assign:' +
      app.id,
    );

    try {
      const response =
        await fetch(
          `/api/workspace/integrations/external-apps/${app.id}/assignments`,
          {
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
          externalApp?: {
            assignmentMode?:
              string;
          };
          users?:
            AssignmentUser[];
          rules?:
            AssignmentRule[];
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Assignments could not be loaded.',
        );
      }

      const users =
        data.users ||
        [];

      setAssignmentUsers(
        users,
      );

      setSelectedUsers(
        new Set(
          users
            .filter(
              user =>
                user.assigned,
            )
            .map(
              user =>
                user.id,
            ),
        ),
      );

      const mode =
        data.externalApp
          ?.assignmentMode ===
            'all_internal' ||
        data.externalApp
          ?.assignmentMode ===
            'rule'
          ? data.externalApp
              .assignmentMode
          : 'manual';

      setAssignmentMode(
        mode,
      );

      const rule =
        data.rules?.find(
          item =>
            item.enabled,
        );

      const conditions =
        rule?.conditions &&
        typeof rule.conditions ===
          'object'
          ? rule.conditions
          : {};

      const roleKeys =
        Array.isArray(
          conditions.roleKeysAny,
        )
          ? conditions
              .roleKeysAny
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string',
              ) as
              string[]
          : [];

      const domains =
        Array.isArray(
          conditions.emailDomainsAny,
        )
          ? conditions
              .emailDomainsAny
              .filter(
                (
                  value:
                    unknown,
                ) =>
                  typeof value ===
                    'string',
              ) as
              string[]
          : [];

      setRuleRoleKeys(
        new Set(
          roleKeys,
        ),
      );

      setRuleDomains(
        domains.join(
          ', ',
        ),
      );

      setRuleMatch(
        conditions.match ===
          'any'
          ? 'any'
          : 'all',
      );

      setAssignmentApp(
        app,
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Assignments unavailable',
        error instanceof
          Error
          ? error.message
          : 'Assignments could not be loaded.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function saveAssignments() {
    if (
      !assignmentApp
    ) {
      return;
    }

    setBusy(
      'save-assignments',
    );

    try {
      const response =
        await fetch(
          `/api/workspace/integrations/external-apps/${assignmentApp.id}/assignments`,
          {
            method:
              'PUT',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              JSON.stringify({
                mode:
                  assignmentMode,
                userIds:
                  assignmentMode ===
                    'manual'
                    ? Array.from(
                        selectedUsers,
                      )
                    : [],
                rule:
                  assignmentMode ===
                    'rule'
                    ? {
                        match:
                          ruleMatch,
                        roleKeysAny:
                          Array.from(
                            ruleRoleKeys,
                          ),
                        emailDomainsAny:
                          ruleDomains
                            .split(
                              /[\n,]+/,
                            )
                            .map(
                              value =>
                                value
                                  .trim(),
                            )
                            .filter(
                              Boolean,
                            ),
                      }
                    : null,
              }),
          },
        );

      const data =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Assignments could not be saved.',
        );
      }

      setAssignmentApp(
        null,
      );

      await refresh();

      show(
        'success',
        'Access updated',
        'External app assignments now follow the selected users.',
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Access update failed',
        error instanceof
          Error
          ? error.message
          : 'Assignments could not be saved.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  const filteredProviders =
    useMemo(
      () => {
        const query =
          deferredSearch
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return state.providers;
        }

        return state.providers.filter(
          provider =>
            [
              provider.name,
              provider.description,
              provider.category,
              provider.connectionType,
              ...provider.capabilities,
            ]
              .join(
                ' ',
              )
              .toLowerCase()
              .includes(
                query,
              ),
        );
      },
      [
        deferredSearch,
        state.providers,
      ],
    );

  const connectedProviderKeys =
    useMemo(
      () =>
        new Set(
          state.connections
            .filter(
              connection =>
                connection.status !==
                  'revoked',
            )
            .map(
              connection =>
                connection.providerKey,
            ),
        ),
      [
        state.connections,
      ],
    );

  return (
    <>
      <section className="sami-ai-sheen rounded-[28px] border border-[var(--sami-border)] p-4 shadow-[var(--sami-shadow-md)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-blue-700 shadow-sm backdrop-blur dark:border-blue-500/20 dark:bg-white/[0.05] dark:text-blue-300">
              <ShieldCheck className="h-3 w-3" />
              Company-scoped connections
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
              Connect your business stack
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              SaMi keeps external credentials server-side, applies your company permissions, records connection health and lets verified events feed Automation without exposing database access.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={
                refresh
              }
              disabled={
                busy ===
                'refresh'
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-bold shadow-[var(--sami-shadow-sm)] disabled:opacity-50"
            >
              {busy === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>

            {state.canManage && (
              <button
                type="button"
                onClick={() =>
                  setExternalOpen(
                    true,
                  )
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
              >
                <Plus className="h-4 w-4" />
                External app
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label:
                'Connections',
              value:
                state.connections.filter(
                  item =>
                    item.status ===
                    'connected',
                ).length,
              icon:
                Link2,
            },
            {
              label:
                'Healthy',
              value:
                state.connections.filter(
                  item =>
                    item.healthStatus ===
                    'healthy',
                ).length,
              icon:
                CheckCircle2,
            },
            {
              label:
                'Webhooks',
              value:
                state.webhooks.filter(
                  item =>
                    item.status ===
                    'active',
                ).length,
              icon:
                Activity,
            },
            {
              label:
                'External apps',
              value:
                state.externalApps.filter(
                  item =>
                    item.status ===
                    'active',
                ).length,
              icon:
                ExternalLink,
            },
          ].map(
            item => (
              <div
                key={
                  item.label
                }
                className="sami-surface rounded-2xl p-4"
              >
                <item.icon className="h-4 w-4 text-slate-400" />
                <p className="mt-4 text-2xl font-black">
                  {item.value}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {item.label}
                </p>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="mt-5 sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black">
              Integration catalog
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              OAuth providers are available only when their deployment credentials are configured.
            </p>
          </div>

          <label className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={
                search
              }
              onChange={event =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search integrations"
              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] pl-10 pr-3 text-xs outline-none"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredProviders.map(
            provider => {
              const connected =
                connectedProviderKeys.has(
                  provider.key,
                );

              return (
                <div
                  key={
                    provider.key
                  }
                  className="rounded-[22px] border border-[var(--sami-border)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
                      {provider.connectionType === 'oauth2' ? <Cloud className="h-5 w-5" /> : provider.connectionType === 'webhook' ? <Activity className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black">
                          {provider.name}
                        </p>
                        {connected && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            Connected
                          </span>
                        )}
                      </div>

                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {provider.capabilities.slice(0, 4).map(
                      capability => (
                        <span
                          key={
                            capability
                          }
                          className="rounded-lg bg-[var(--sami-surface-soft)] px-2 py-1 text-[9px] font-bold text-slate-500 dark:text-slate-300"
                        >
                          {capability.replace(/_/g, ' ')}
                        </span>
                      ),
                    )}
                  </div>

                  {state.canManage && (
                    <div className="mt-4">
                      {provider.connectionType === 'oauth2' ? (
                        <button
                          type="button"
                          disabled={
                            !provider.configured
                          }
                          onClick={() =>
                            window.location.assign(
                              `/api/workspace/integrations/oauth/${provider.key}/start?return=%2Fintegrations`,
                            )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-3 text-[11px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {connected ? 'Connect another' : provider.configured ? 'Connect' : 'Not configured'}
                        </button>
                      ) : provider.connectionType === 'webhook' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setWebhookOpen(
                              true,
                            )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-bold text-white dark:bg-white dark:text-slate-950"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create webhook
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setExternalOpen(
                              true,
                            )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-bold text-white dark:bg-white dark:text-slate-950"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add app
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="sami-surface overflow-hidden rounded-[24px]">
          <div className="border-b border-[var(--sami-border)] px-4 py-4 sm:px-5">
            <p className="text-sm font-black">
              Connections
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Credentials stay encrypted server-side and are never returned here.
            </p>
          </div>

          {state.connections.length === 0 ? (
            <div className="px-5 py-10 text-center text-[11px] text-slate-400">
              No connections yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--sami-border)]">
              {state.connections.map(
                connection => (
                  <div
                    key={
                      connection.id
                    }
                    className="px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black">
                          {connection.name}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {providerLabel(connection.providerKey, state.providers)}
                          {connection.externalAccountEmail ? ` · ${connection.externalAccountEmail}` : ''}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Health checked {formatDate(connection.lastHealthCheckAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tone(connection.status)}`}>
                          {connection.status}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tone(connection.healthStatus)}`}>
                          {connection.healthStatus}
                        </span>
                      </div>
                    </div>

                    {state.canManage && connection.status !== 'revoked' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            connectionOperation(
                              connection,
                              'health_check',
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            )
                          }
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[10px] font-bold disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Check
                        </button>

                        {connection.capabilities.includes('sync') && (
                          <button
                            type="button"
                            onClick={() =>
                              connectionOperation(
                                connection,
                                'sync',
                              )
                            }
                            disabled={
                              Boolean(
                                busy,
                              )
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[10px] font-bold disabled:opacity-50"
                          >
                            <Activity className="h-3 w-3" />
                            Sync
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            connectionOperation(
                              connection,
                              'disconnect',
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            )
                          }
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 text-[10px] font-bold text-rose-600 disabled:opacity-50 dark:border-rose-500/20 dark:text-rose-300"
                        >
                          <Unplug className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="sami-surface overflow-hidden rounded-[24px]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] px-4 py-4 sm:px-5">
            <div>
              <p className="text-sm font-black">
                Webhooks
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Verified inbound events can trigger Automation without exposing SaMi APIs or databases.
              </p>
            </div>

            {state.canManage && (
              <button
                type="button"
                onClick={() =>
                  setWebhookOpen(
                    true,
                  )
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[10px] font-bold"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            )}
          </div>

          {state.webhooks.length === 0 ? (
            <div className="px-5 py-10 text-center text-[11px] text-slate-400">
              No webhook endpoints yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--sami-border)]">
              {state.webhooks.map(
                webhook => (
                  <div
                    key={
                      webhook.id
                    }
                    className="px-4 py-4 sm:px-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black">
                          {webhook.name}
                        </p>
                        <p className="mt-1 break-all font-mono text-[9px] text-slate-400">
                          {webhook.endpointPath}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Last event {formatDate(webhook.lastReceivedAt)}
                        </p>
                      </div>

                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tone(webhook.status)}`}>
                        {webhook.status}
                      </span>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 sami-surface overflow-hidden rounded-[24px]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] px-4 py-4 sm:px-5">
          <div>
            <p className="text-sm font-black">
              External business apps
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Provision approved cloud or internal tools into the SaMi launcher without turning them into native SaMi modules.
            </p>
          </div>

          {state.canManage && (
            <button
              type="button"
              onClick={() =>
                setExternalOpen(
                  true,
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[10px] font-bold"
            >
              <Plus className="h-3 w-3" />
              Add app
            </button>
          )}
        </div>

        {state.externalApps.length === 0 ? (
          <div className="px-5 py-10 text-center text-[11px] text-slate-400">
            No external apps have been provisioned.
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
            {state.externalApps.map(
              app => (
                <div
                  key={
                    app.id
                  }
                  className="rounded-2xl border border-[var(--sami-border)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
                      <ExternalLink className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black">
                        {app.name}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-slate-400">
                        {app.launchUrl}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tone(app.status)}`}>
                      {app.status}
                    </span>
                    <span className="rounded-full border border-[var(--sami-border)] px-2 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-300">
                      {app.assignmentMode.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={
                        app.launchUrl
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[10px] font-bold"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>

                    {state.canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          openAssignments(
                            app,
                          )
                        }
                        disabled={
                          Boolean(
                            busy,
                          )
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[10px] font-bold disabled:opacity-50"
                      >
                        <Users className="h-3 w-3" />
                        Assign
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section className="mt-5 sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] px-4 py-4 sm:px-5">
          <p className="text-sm font-black">
            Recent sync activity
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            SaMi creates sync jobs only when a provider registers a real code-owned sync handler.
          </p>
        </div>

        {state.syncJobs.length === 0 ? (
          <div className="px-5 py-10 text-center text-[11px] text-slate-400">
            No sync jobs yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--sami-border)]">
            {state.syncJobs.slice(0, 12).map(
              job => (
                <div
                  key={
                    job.id
                  }
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">
                      {job.connectionName}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {job.jobType} · attempt {job.attempt}/{job.maxAttempts} · {formatDate(job.createdAt)}
                    </p>
                    {job.errorMessage && (
                      <p className="mt-1 line-clamp-1 text-[10px] text-rose-500">
                        {job.errorMessage}
                      </p>
                    )}
                  </div>

                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${tone(job.status)}`}>
                    {job.status}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {webhookOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-[26px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[26px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black">
                  New inbound webhook
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  The secret is shown once. SaMi stores only its hash.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setWebhookOpen(false);
                  setWebhookSecret(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-[var(--sami-surface-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {webhookSecret ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Lock className="h-4 w-4" />
                    <p className="text-xs font-black">
                      Save this secret now
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-amber-700/80 dark:text-amber-200/80">
                    SaMi cannot show this secret again. Send it as a Bearer token.
                  </p>
                </div>

                <CopyField
                  label="Endpoint path"
                  value={
                    webhookSecret.endpointPath
                  }
                />

                <CopyField
                  label="Bearer secret"
                  value={
                    webhookSecret.secret
                  }
                />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Name
                  </span>
                  <input
                    value={
                      webhookName
                    }
                    onChange={event =>
                      setWebhookName(
                        event.target.value,
                      )
                    }
                    placeholder="Website lead events"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Allowed event keys
                  </span>
                  <textarea
                    value={
                      webhookEvents
                    }
                    onChange={event =>
                      setWebhookEvents(
                        event.target.value,
                      )
                    }
                    rows={4}
                    placeholder={'lead.created\nlead.updated'}
                    className="mt-1.5 w-full resize-none rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2.5 text-sm outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Leave empty to accept any valid event key.
                  </p>
                </label>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWebhookOpen(false);
                  setWebhookSecret(null);
                }}
                className="h-10 rounded-xl px-4 text-xs font-bold text-slate-500"
              >
                {webhookSecret ? 'Done' : 'Cancel'}
              </button>

              {!webhookSecret && (
                <button
                  type="button"
                  onClick={
                    createWebhook
                  }
                  disabled={
                    busy ===
                    'create-webhook'
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                >
                  {busy === 'create-webhook' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {externalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-[26px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[26px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black">
                  Add external app
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add an approved cloud or internal business URL to the SaMi launcher.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() =>
                  setExternalOpen(
                    false,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-[var(--sami-surface-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <input
                value={
                  externalName
                }
                onChange={event =>
                  setExternalName(
                    event.target.value,
                  )
                }
                placeholder="App name"
                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none"
              />

              <input
                value={
                  externalUrl
                }
                onChange={event =>
                  setExternalUrl(
                    event.target.value,
                  )
                }
                placeholder="https://app.example.com"
                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none"
              />

              <textarea
                value={
                  externalDescription
                }
                onChange={event =>
                  setExternalDescription(
                    event.target.value,
                  )
                }
                rows={3}
                placeholder="What is this app used for?"
                className="w-full resize-none rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2.5 text-sm outline-none"
              />

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Initial access
                </span>
                <select
                  value={
                    externalAssignmentMode
                  }
                  onChange={event =>
                    setExternalAssignmentMode(
                      event.target.value ===
                        'all_internal'
                        ? 'all_internal'
                        : 'manual',
                    )
                  }
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none"
                >
                  <option value="manual">
                    Only me initially
                  </option>
                  <option value="all_internal">
                    Everyone with company access
                  </option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setExternalOpen(
                    false,
                  )
                }
                className="h-10 rounded-xl px-4 text-xs font-bold text-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={
                  createExternalApp
                }
                disabled={
                  busy ===
                  'create-external'
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {busy === 'create-external' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add app
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentApp && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-[26px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[26px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black">
                  Assign {assignmentApp.name}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Only active internal users with current-company access can be assigned.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() =>
                  setAssignmentApp(
                    null,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-[var(--sami-surface-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Access policy
                </span>
                <select
                  value={
                    assignmentMode
                  }
                  onChange={event =>
                    setAssignmentMode(
                      event.target.value ===
                        'all_internal'
                        ? 'all_internal'
                        : event.target.value ===
                            'rule'
                          ? 'rule'
                          : 'manual',
                    )
                  }
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none"
                >
                  <option value="manual">
                    Selected users
                  </option>
                  <option value="all_internal">
                    Everyone with company access
                  </option>
                  <option value="rule">
                    Conditional rule
                  </option>
                </select>
              </label>

              {assignmentMode === 'rule' && (
                <div className="rounded-2xl border border-[var(--sami-border)] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Match
                      </span>
                      <select
                        value={
                          ruleMatch
                        }
                        onChange={event =>
                          setRuleMatch(
                            event.target.value ===
                              'any'
                              ? 'any'
                              : 'all',
                          )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                      >
                        <option value="all">
                          All configured conditions
                        </option>
                        <option value="any">
                          Any configured condition
                        </option>
                      </select>
                    </label>

                    <label>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Email domains
                      </span>
                      <input
                        value={
                          ruleDomains
                        }
                        onChange={event =>
                          setRuleDomains(
                            event.target.value,
                          )
                        }
                        placeholder="company.com, partner.org"
                        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                      />
                    </label>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      SaMi roles
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {Array.from(
                        new Set(
                          assignmentUsers
                            .flatMap(
                              user =>
                                user.roleKeys ||
                                [],
                            ),
                        ),
                      )
                        .sort()
                        .map(
                          role => (
                            <label
                              key={
                                role
                              }
                              className={[
                                'inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold',
                                ruleRoleKeys.has(
                                  role,
                                )
                                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                                  : 'border-[var(--sami-border)] text-slate-500 dark:text-slate-300',
                              ].join(
                                ' ',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={
                                  ruleRoleKeys.has(
                                    role,
                                  )
                                }
                                onChange={event =>
                                  setRuleRoleKeys(
                                    current => {
                                      const next =
                                        new Set(
                                          current,
                                        );

                                      if (
                                        event.target
                                          .checked
                                      ) {
                                        next.add(
                                          role,
                                        );
                                      } else {
                                        next.delete(
                                          role,
                                        );
                                      }

                                      return next;
                                    },
                                  )
                                }
                                className="sr-only"
                              />
                              {role}
                            </label>
                          ),
                        )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {assignmentMode === 'manual' && (
              <div className="mt-5 max-h-[50vh] space-y-2 overflow-y-auto">
              {assignmentUsers.map(
                user => (
                  <label
                    key={
                      user.id
                    }
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--sami-border)] px-3 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedUsers.has(
                          user.id,
                        )
                      }
                      onChange={event =>
                        setSelectedUsers(
                          current => {
                            const next =
                              new Set(
                                current,
                              );

                            if (
                              event.target
                                .checked
                            ) {
                              next.add(
                                user.id,
                              );
                            } else {
                              next.delete(
                                user.id,
                              );
                            }

                            return next;
                          },
                        )
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">
                        {user.name}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">
                        {user.email}
                      </p>
                    </div>

                    {user.isOwner && (
                      <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                        Owner
                      </span>
                    )}
                  </label>
                ),
              )}
              </div>
            )}

            {assignmentMode === 'all_internal' && (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[11px] leading-5 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                Every active internal member with access to the current company will see this app in their SaMi launcher.
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setAssignmentApp(
                    null,
                  )
                }
                className="h-10 rounded-xl px-4 text-xs font-bold text-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={
                  saveAssignments
                }
                disabled={
                  busy ===
                  'save-assignments'
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {busy === 'save-assignments' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save access
              </button>
            </div>
          </div>
        </div>
      )}

      <SaMiOverlay
        open={
          overlay.open
        }
        type={
          overlay.type
        }
        title={
          overlay.title
        }
        message={
          overlay.message
        }
        onClose={() =>
          setOverlay(
            CLOSED_OVERLAY,
          )
        }
      />
    </>
  );
}

function CopyField({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  const [
    copied,
    setCopied,
  ] =
    useState(
      false,
    );

  async function copy() {
    await navigator.clipboard
      .writeText(
        value,
      );

    setCopied(
      true,
    );

    window.setTimeout(
      () =>
        setCopied(
          false,
        ),
      1500,
    );
  }

  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3">
        <code className="min-w-0 flex-1 break-all text-[10px] leading-5 text-slate-600 dark:text-slate-300">
          {value}
        </code>
        <button
          type="button"
          onClick={
            copy
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--sami-surface)]"
          aria-label={
            'Copy ' +
            label
          }
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
        </button>
      </div>
    </div>
  );
}
