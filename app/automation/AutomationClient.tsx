'use client';

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  TriangleAlert,
  Workflow,
  X,
  Zap,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type Trigger = {
  key: string;
  name: string;
  description: string;
  type:
    | 'event'
    | 'schedule'
    | 'manual'
    | 'webhook';
  moduleKey:
    string | null;
  requiredPermissions:
    string[];
  companyScoped:
    boolean;
  configSchema?:
    Record<string, unknown>;
};

type ActionDefinition = {
  key: string;
  name: string;
  description: string;
  moduleKey:
    string | null;
  operation:
    'read' |
    'write';
  requiredPermissions:
    string[];
  approvalPolicy:
    'never' |
    'optional' |
    'always';
  inputSchema?:
    {
      properties?:
        Record<
          string,
          {
            type?:
              string;
            maxLength?:
              number;
          }
        >;
      required?:
        string[];
    };
};

type Condition = {
  key: string;
  path: string;
  operator: string;
  value?:
    unknown;
};

type ActionStep = {
  key: string;
  actionKey: string;
  input:
    Record<
      string,
      unknown
    >;
  requireApproval?:
    boolean;
};

type Definition = {
  trigger: {
    key: string;
    config:
      Record<
        string,
        unknown
      >;
  };
  conditions:
    Condition[];
  actions:
    ActionStep[];
  retry: {
    maxAttempts:
      number;
    backoffSeconds:
      number;
  };
};

type WorkflowRow = {
  id: string;
  name: string;
  description:
    string | null;
  status: string;
  latestVersion:
    number;
  activeVersion:
    number | null;
  triggerKey:
    string | null;
  triggerModule:
    string | null;
  definition:
    Definition | null;
  lastActivatedAt:
    string | null;
  createdAt:
    string;
  updatedAt:
    string;
};

type RunRow = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  correlationId: string;
  errorCode:
    string | null;
  errorMessage:
    string | null;
  startedAt:
    string | null;
  completedAt:
    string | null;
  createdAt:
    string;
};

type AutomationState = {
  canManage:
    boolean;
  triggers:
    Trigger[];
  actions:
    ActionDefinition[];
  workflows:
    WorkflowRow[];
  runs:
    RunRow[];
};

type ApiResponse = {
  success?:
    boolean;
  error?:
    string;
  workflow?:
    WorkflowRow;
  result?:
    Record<
      string,
      unknown
    >;
};

type OverlayState = {
  open:
    boolean;
  type:
    'success' |
    'error' |
    'warning' |
    'info';
  title:
    string;
  message:
    string;
};

const EMPTY_OVERLAY:
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

const OPERATORS = [
  {
    value:
      'equals',
    label:
      'Equals',
  },
  {
    value:
      'not_equals',
    label:
      'Does not equal',
  },
  {
    value:
      'contains',
    label:
      'Contains',
  },
  {
    value:
      'greater_than',
    label:
      'Greater than',
  },
  {
    value:
      'less_than',
    label:
      'Less than',
  },
  {
    value:
      'exists',
    label:
      'Exists',
  },
  {
    value:
      'not_exists',
    label:
      'Does not exist',
  },
] as const;

function newKey(
  prefix:
    string,
) {
  return (
    prefix +
    '-' +
    Math.random()
      .toString(
        36,
      )
      .slice(
        2,
        9,
      )
  );
}

function defaultDefinition(
  triggers:
    Trigger[],
  actions:
    ActionDefinition[],
): Definition {
  return {
    trigger: {
      key:
        triggers.find(
          item =>
            item.key ===
            'core.manual',
        )?.key ||
        triggers[0]
          ?.key ||
        '',
      config: {},
    },
    conditions: [],
    actions:
      actions[0]
        ? [
            {
              key:
                newKey(
                  'step',
                ),
              actionKey:
                actions[0]
                  .key,
              input: {},
              requireApproval:
                false,
            },
          ]
        : [],
    retry: {
      maxAttempts:
        1,
      backoffSeconds:
        30,
    },
  };
}

function formatDate(
  value:
    string | null,
) {
  if (
    !value
  ) {
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

  return date
    .toLocaleString(
      undefined,
      {
        dateStyle:
          'medium',
        timeStyle:
          'short',
      },
    );
}

function statusTone(
  status:
    string,
) {
  if (
    status ===
      'active' ||
    status ===
      'succeeded'
  ) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (
    status ===
      'failed'
  ) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300';
  }

  if (
    status ===
      'waiting_approval'
  ) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300';
}

async function readResponse(
  response:
    Response,
): Promise<ApiResponse> {
  try {
    return (
      await response.json()
    ) as ApiResponse;
  } catch {
    return {
      success:
        false,
      error:
        'SaMi returned an invalid automation response.',
    };
  }
}

function inputProperties(
  action:
    ActionDefinition | null,
) {
  const properties =
    action
      ?.inputSchema
      ?.properties;

  return properties &&
    typeof properties ===
      'object'
    ? Object.entries(
        properties,
      )
    : [];
}

export default function AutomationClient({
  initialState,
}: {
  initialState:
    AutomationState;
}) {
  const [
    state,
    setState,
  ] =
    useState(
      initialState,
    );

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<
      string | null
    >(
      initialState
        .workflows[0]
        ?.id ||
      null,
    );

  const [
    draft,
    setDraft,
  ] =
    useState<
      Definition
    >(
      initialState
        .workflows[0]
        ?.definition ||
      defaultDefinition(
        initialState
          .triggers,
        initialState
          .actions,
      ),
    );

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(
      false,
    );

  const [
    newName,
    setNewName,
  ] =
    useState(
      '',
    );

  const [
    newDescription,
    setNewDescription,
  ] =
    useState(
      '',
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
      EMPTY_OVERLAY,
    );

  const selected =
    useMemo(
      () =>
        state.workflows
          .find(
            item =>
              item.id ===
              selectedId,
          ) ||
        null,
      [
        state.workflows,
        selectedId,
      ],
    );

  useEffect(
    () => {
      setDraft(
        selected
          ?.definition ||
        defaultDefinition(
          state.triggers,
          state.actions,
        ),
      );
    },
    [
      selected?.id,
      selected
        ?.latestVersion,
      state.actions,
      state.triggers,
    ],
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
          '/api/workspace/automation',
          {
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const data =
        await response.json() as
          AutomationState & {
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
          'Automation could not be refreshed.',
        );
      }

      setState({
        canManage:
          data.canManage,
        triggers:
          data.triggers ||
          [],
        actions:
          data.actions ||
          [],
        workflows:
          data.workflows ||
          [],
        runs:
          data.runs ||
          [],
      });

      if (
        selectedId &&
        !data.workflows
          ?.some(
            item =>
              item.id ===
              selectedId,
          )
      ) {
        setSelectedId(
          data.workflows
            ?.[0]?.id ||
          null,
        );
      }
    } catch (
      error
    ) {
      show(
        'error',
        'Refresh failed',
        error instanceof
          Error
          ? error.message
          : 'Automation could not be refreshed.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function createWorkflow() {
    const name =
      newName
        .trim();

    if (
      !name
    ) {
      show(
        'warning',
        'Name required',
        'Give this automation a clear name before creating it.',
      );
      return;
    }

    setBusy(
      'create',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/automation',
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
                name,
                description:
                  newDescription,
              }),
          },
        );

      const data =
        await readResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success ||
        !data.workflow
      ) {
        throw new Error(
          data.error ||
          'Automation could not be created.',
        );
      }

      setCreateOpen(
        false,
      );
      setNewName(
        '',
      );
      setNewDescription(
        '',
      );

      await refresh();

      setSelectedId(
        data.workflow.id,
      );

      show(
        'success',
        'Draft created',
        'The automation is ready for a trigger and actions.',
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Create failed',
        error instanceof
          Error
          ? error.message
          : 'Automation could not be created.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function workflowOperation(
    operation:
      'save_version' |
      'activate' |
      'pause' |
      'run_manual',
  ) {
    if (
      !selected
    ) {
      return;
    }

    setBusy(
      operation,
    );

    try {
      const response =
        await fetch(
          `/api/workspace/automation/${selected.id}`,
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
                ...(
                  operation ===
                    'save_version'
                    ? {
                        definition:
                          draft,
                      }
                    : {}
                ),
                ...(
                  operation ===
                    'run_manual'
                    ? {
                        payload:
                          {},
                      }
                    : {}
                ),
              }),
          },
        );

      const data =
        await readResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Automation operation failed.',
        );
      }

      await refresh();

      const messages = {
        save_version:
          'A new immutable workflow version was saved.',
        activate:
          'The latest saved version is now active.',
        pause:
          'The automation is paused. Its active version remains preserved.',
        run_manual:
          'The manual run was accepted. Check Recent runs for the result.',
      };

      show(
        'success',
        operation ===
          'run_manual'
          ? 'Run completed'
          : 'Automation updated',
        messages[
          operation
        ],
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
          : 'Automation operation failed.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  function addCondition() {
    setDraft(
      current => ({
        ...current,
        conditions: [
          ...current
            .conditions,
          {
            key:
              newKey(
                'condition',
              ),
            path:
              '',
            operator:
              'equals',
            value:
              '',
          },
        ],
      }),
    );
  }

  function addAction() {
    const first =
      state.actions[0];

    if (
      !first
    ) {
      show(
        'info',
        'No actions available',
        'Installed business apps have not registered automation actions for your current access yet.',
      );
      return;
    }

    setDraft(
      current => ({
        ...current,
        actions: [
          ...current
            .actions,
          {
            key:
              newKey(
                'step',
              ),
            actionKey:
              first.key,
            input: {},
            requireApproval:
              first
                .approvalPolicy ===
                'always',
          },
        ],
      }),
    );
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="sami-surface overflow-hidden rounded-[24px] xl:sticky xl:top-5 xl:self-start">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] px-4 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Workflows
              </p>
              <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
                {state.workflows.length} automation{state.workflows.length === 1 ? '' : 's'}
              </p>
            </div>

            {state.canManage && (
              <button
                type="button"
                onClick={() =>
                  setCreateOpen(
                    true,
                  )
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[11px] font-bold text-white transition hover:opacity-90 dark:bg-white dark:text-slate-950"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            )}
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-2">
            {state.workflows.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Workflow className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="mt-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                  No automations yet
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  Create a workflow when you are ready to automate repeatable work.
                </p>
              </div>
            ) : (
              state.workflows.map(
                workflow => (
                  <button
                    key={
                      workflow.id
                    }
                    type="button"
                    onClick={() =>
                      setSelectedId(
                        workflow.id,
                      )
                    }
                    className={[
                      'mb-1 w-full rounded-2xl border px-3 py-3 text-left transition',
                      selectedId ===
                        workflow.id
                        ? 'border-blue-200 bg-blue-50/80 dark:border-blue-500/20 dark:bg-blue-500/10'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/[0.04]',
                    ].join(
                      ' ',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-800 dark:text-slate-100">
                        {workflow.name}
                      </span>
                      <span
                        className={[
                          'rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
                          statusTone(
                            workflow.status,
                          ),
                        ].join(
                          ' ',
                        )}
                      >
                        {workflow.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">
                      {workflow.description || 'No description'}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[9px] font-bold text-slate-400">
                      <span>v{workflow.latestVersion}</span>
                      <span>•</span>
                      <span>
                        Active {workflow.activeVersion ? `v${workflow.activeVersion}` : '—'}
                      </span>
                    </div>
                  </button>
                ),
              )
            )}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {!selected ? (
            <section className="sami-surface flex min-h-[440px] flex-col items-center justify-center rounded-[24px] px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/10">
                <Workflow className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-base font-black text-slate-950 dark:text-white">
                Build your first automation
              </h2>
              <p className="mt-2 max-w-lg text-xs leading-5 text-slate-500 dark:text-slate-400">
                SaMi only exposes triggers and actions registered by the platform and business apps you are allowed to use.
              </p>
            </section>
          ) : (
            <>
              <section className="sami-surface rounded-[24px] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">
                        {selected.name}
                      </h2>
                      <span
                        className={[
                          'rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide',
                          statusTone(
                            selected.status,
                          ),
                        ].join(
                          ' ',
                        )}
                      >
                        {selected.status}
                      </span>
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {selected.description || 'No description'}
                    </p>
                    <p className="mt-2 text-[10px] font-bold text-slate-400">
                      Latest v{selected.latestVersion} · Active {selected.activeVersion ? `v${selected.activeVersion}` : 'none'}
                    </p>
                  </div>

                  {state.canManage && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          workflowOperation(
                            'save_version',
                          )
                        }
                        disabled={
                          Boolean(
                            busy,
                          )
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-[11px] font-bold text-slate-700 transition hover:bg-[var(--sami-surface-soft)] disabled:opacity-50 dark:text-slate-200"
                      >
                        {busy === 'save_version' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save version
                      </button>

                      {selected.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() =>
                            workflowOperation(
                              'pause',
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500 px-3 text-[11px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                        >
                          <CirclePause className="h-3.5 w-3.5" />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            workflowOperation(
                              'activate',
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            ) ||
                            selected
                              .latestVersion <
                              1
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CirclePlay className="h-3.5 w-3.5" />
                          Activate
                        </button>
                      )}

                      {selected.status === 'active' && selected.triggerKey === 'core.manual' && (
                        <button
                          type="button"
                          onClick={() =>
                            workflowOperation(
                              'run_manual',
                            )
                          }
                          disabled={
                            Boolean(
                              busy,
                            )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3 text-[11px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Run now
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="sami-surface rounded-[24px] p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">
                        When this happens
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Only triggers available to your current access are listed.
                      </p>
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Trigger
                    </span>
                    <div className="relative mt-1.5">
                      <select
                        value={
                          draft.trigger.key
                        }
                        onChange={event =>
                          setDraft(
                            current => ({
                              ...current,
                              trigger: {
                                key:
                                  event.target.value,
                                config: {},
                              },
                            }),
                          )
                        }
                        disabled={
                          !state.canManage
                        }
                        className="h-11 w-full appearance-none rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 pr-9 text-xs font-bold outline-none disabled:opacity-60"
                      >
                        {state.triggers.map(
                          trigger => (
                            <option
                              key={
                                trigger.key
                              }
                              value={
                                trigger.key
                              }
                            >
                              {trigger.name}
                            </option>
                          ),
                        )}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  </label>

                  <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    {state.triggers.find(item => item.key === draft.trigger.key)?.description || 'Choose a trigger.'}
                  </p>

                  {draft.trigger.key === 'core.schedule' && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Repeat every (minutes)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={43200}
                          value={Number(draft.trigger.config.intervalMinutes || 60)}
                          onChange={event =>
                            setDraft(
                              current => ({
                                ...current,
                                trigger: {
                                  ...current.trigger,
                                  config: {
                                    ...current.trigger.config,
                                    intervalMinutes:
                                      Number(event.target.value),
                                  },
                                },
                              }),
                            )
                          }
                          className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs outline-none"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Timezone
                        </span>
                        <input
                          value={String(draft.trigger.config.timezone || 'Africa/Nairobi')}
                          onChange={event =>
                            setDraft(
                              current => ({
                                ...current,
                                trigger: {
                                  ...current.trigger,
                                  config: {
                                    ...current.trigger.config,
                                    timezone:
                                      event.target.value,
                                  },
                                },
                              }),
                            )
                          }
                          placeholder="Africa/Nairobi"
                          className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs outline-none"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="sami-surface rounded-[24px] p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                      <RefreshCw className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">
                        Reliability
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Failed runs are persisted with retry timing.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Max attempts
                      </span>
                      <select
                        value={
                          draft.retry.maxAttempts
                        }
                        onChange={event =>
                          setDraft(
                            current => ({
                              ...current,
                              retry: {
                                ...current.retry,
                                maxAttempts:
                                  Number(
                                    event.target.value,
                                  ),
                              },
                            }),
                          )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-bold"
                      >
                        {[1, 2, 3, 4, 5].map(
                          value => (
                            <option
                              key={value}
                              value={value}
                            >
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Backoff seconds
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={86400}
                        value={
                          draft.retry.backoffSeconds
                        }
                        onChange={event =>
                          setDraft(
                            current => ({
                              ...current,
                              retry: {
                                ...current.retry,
                                backoffSeconds:
                                  Number(
                                    event.target.value,
                                  ),
                              },
                            }),
                          )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="sami-surface rounded-[24px] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      Conditions
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Structured comparisons only. SaMi does not execute custom expressions here.
                    </p>
                  </div>

                  {state.canManage && (
                    <button
                      type="button"
                      onClick={
                        addCondition
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-bold"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add condition
                    </button>
                  )}
                </div>

                {draft.conditions.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-6 text-center text-[11px] text-slate-400">
                    No conditions. Every matching trigger can continue to the actions.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {draft.conditions.map(
                      (
                        condition,
                        index,
                      ) => (
                        <div
                          key={
                            condition.key
                          }
                          className="grid gap-2 rounded-2xl border border-[var(--sami-border)] p-3 md:grid-cols-[1.1fr_180px_1fr_40px]"
                        >
                          <input
                            value={
                              condition.path
                            }
                            onChange={event =>
                              setDraft(
                                current => ({
                                  ...current,
                                  conditions:
                                    current.conditions.map(
                                      item =>
                                        item.key ===
                                          condition.key
                                          ? {
                                              ...item,
                                              path:
                                                event.target.value,
                                            }
                                          : item,
                                    ),
                                }),
                              )
                            }
                            placeholder="e.g. amount"
                            className="h-10 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          />

                          <select
                            value={
                              condition.operator
                            }
                            onChange={event =>
                              setDraft(
                                current => ({
                                  ...current,
                                  conditions:
                                    current.conditions.map(
                                      item =>
                                        item.key ===
                                          condition.key
                                          ? {
                                              ...item,
                                              operator:
                                                event.target.value,
                                            }
                                          : item,
                                    ),
                                }),
                              )
                            }
                            className="h-10 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          >
                            {OPERATORS.map(
                              operator => (
                                <option
                                  key={
                                    operator.value
                                  }
                                  value={
                                    operator.value
                                  }
                                >
                                  {operator.label}
                                </option>
                              ),
                            )}
                          </select>

                          {!['exists', 'not_exists'].includes(condition.operator) ? (
                            <input
                              value={String(condition.value ?? '')}
                              onChange={event =>
                                setDraft(
                                  current => ({
                                    ...current,
                                    conditions:
                                      current.conditions.map(
                                        item =>
                                          item.key ===
                                            condition.key
                                            ? {
                                                ...item,
                                                value:
                                                  event.target.value,
                                              }
                                            : item,
                                      ),
                                  }),
                                )
                              }
                              placeholder="Value"
                              className="h-10 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                            />
                          ) : (
                            <div className="hidden md:block" />
                          )}

                          <button
                            type="button"
                            aria-label={`Remove condition ${index + 1}`}
                            onClick={() =>
                              setDraft(
                                current => ({
                                  ...current,
                                  conditions:
                                    current.conditions.filter(
                                      item =>
                                        item.key !==
                                        condition.key,
                                    ),
                                }),
                              )
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>

              <section className="sami-surface rounded-[24px] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      Then do this
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Actions come from SaMi core or accessible installed modules, never database-supplied executable code.
                    </p>
                  </div>

                  {state.canManage && (
                    <button
                      type="button"
                      onClick={
                        addAction
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-bold"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add action
                    </button>
                  )}
                </div>

                {draft.actions.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-6 text-center">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      No actions available
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Install or gain access to an app that contributes automation actions, or use a SaMi core action.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {draft.actions.map(
                      (
                        step,
                        index,
                      ) => {
                        const action =
                          state.actions.find(
                            item =>
                              item.key ===
                              step.actionKey,
                          ) ||
                          null;

                        return (
                          <div
                            key={
                              step.key
                            }
                            className="rounded-2xl border border-[var(--sami-border)] p-4"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <span className="text-xs font-black">
                                  {index + 1}
                                </span>
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                                  <div className="relative">
                                    <select
                                      value={
                                        step.actionKey
                                      }
                                      onChange={event =>
                                        setDraft(
                                          current => ({
                                            ...current,
                                            actions:
                                              current.actions.map(
                                                item =>
                                                  item.key ===
                                                    step.key
                                                    ? {
                                                        ...item,
                                                        actionKey:
                                                          event.target.value,
                                                        input: {},
                                                        requireApproval:
                                                          state.actions.find(candidate => candidate.key === event.target.value)?.approvalPolicy === 'always',
                                                      }
                                                    : item,
                                              ),
                                          }),
                                        )
                                      }
                                      className="h-10 w-full appearance-none rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 pr-9 text-xs font-bold"
                                    >
                                      {state.actions.map(
                                        item => (
                                          <option
                                            key={
                                              item.key
                                            }
                                            value={
                                              item.key
                                            }
                                          >
                                            {item.name}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  </div>

                                  <button
                                    type="button"
                                    aria-label={`Remove action ${index + 1}`}
                                    onClick={() =>
                                      setDraft(
                                        current => ({
                                          ...current,
                                          actions:
                                            current.actions.filter(
                                              item =>
                                                item.key !==
                                                step.key,
                                            ),
                                        }),
                                      )
                                    }
                                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>

                                <p className="mt-2 text-[10px] leading-4 text-slate-400">
                                  {action?.description || 'Registered automation action'}
                                </p>

                                {inputProperties(action).length > 0 && (
                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {inputProperties(action).map(
                                      ([
                                        key,
                                        property,
                                      ]) => (
                                        <label
                                          key={
                                            key
                                          }
                                        >
                                          <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                                            {key.replace(/[_-]+/g, ' ')}
                                          </span>
                                          <input
                                            value={String(step.input[key] ?? '')}
                                            maxLength={
                                              property.maxLength
                                            }
                                            onChange={event =>
                                              setDraft(
                                                current => ({
                                                  ...current,
                                                  actions:
                                                    current.actions.map(
                                                      item =>
                                                        item.key ===
                                                          step.key
                                                          ? {
                                                              ...item,
                                                              input: {
                                                                ...item.input,
                                                                [key]:
                                                                  event.target.value,
                                                              },
                                                            }
                                                          : item,
                                                    ),
                                                }),
                                              )
                                            }
                                            className="mt-1.5 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                                          />
                                        </label>
                                      ),
                                    )}
                                  </div>
                                )}

                                {action?.approvalPolicy !== 'never' && (
                                  <label className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={
                                        action?.approvalPolicy === 'always' ||
                                        step.requireApproval === true
                                      }
                                      disabled={
                                        action?.approvalPolicy === 'always'
                                      }
                                      onChange={event =>
                                        setDraft(
                                          current => ({
                                            ...current,
                                            actions:
                                              current.actions.map(
                                                item =>
                                                  item.key ===
                                                    step.key
                                                    ? {
                                                        ...item,
                                                        requireApproval:
                                                          event.target.checked,
                                                      }
                                                    : item,
                                              ),
                                          }),
                                        )
                                      }
                                    />
                                    Require human approval before this action
                                  </label>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          <section className="sami-surface overflow-hidden rounded-[24px]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] px-4 py-4 sm:px-5">
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Recent runs
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Durable execution history for the current company.
                </p>
              </div>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>

            {state.runs.length === 0 ? (
              <div className="px-5 py-10 text-center text-[11px] text-slate-400">
                No automation runs yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--sami-border)]">
                {state.runs.slice(0, 12).map(
                  run => (
                    <div
                      key={
                        run.id
                      }
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                          {run.workflowName}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatDate(run.createdAt)} · attempt {run.attempt}/{run.maxAttempts}
                        </p>
                        {run.errorMessage && (
                          <p className="mt-1 line-clamp-1 text-[10px] text-rose-500">
                            {run.errorMessage}
                          </p>
                        )}
                      </div>

                      <span
                        className={[
                          'w-fit rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide',
                          statusTone(
                            run.status,
                          ),
                        ].join(
                          ' ',
                        )}
                      >
                        {run.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[24px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950 dark:text-white">
                  New automation
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Start with a draft. Nothing runs until a saved version is activated.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() =>
                  setCreateOpen(
                    false,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Name
                </span>
                <input
                  value={
                    newName
                  }
                  onChange={event =>
                    setNewName(
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Monday follow-up"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm outline-none"
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Description
                </span>
                <textarea
                  value={
                    newDescription
                  }
                  onChange={event =>
                    setNewDescription(
                      event.target.value,
                    )
                  }
                  rows={3}
                  placeholder="What should this automation accomplish?"
                  className="mt-1.5 w-full resize-none rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2.5 text-sm outline-none"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCreateOpen(
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
                  createWorkflow
                }
                disabled={
                  busy ===
                  'create'
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create draft
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
            EMPTY_OVERLAY,
          )
        }
      />
    </>
  );
}
