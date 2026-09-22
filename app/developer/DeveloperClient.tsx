'use client';

import {
  Activity,
  Ban,
  Check,
  Clipboard,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type ScopeDefinition = {
  key: string;
  name: string;
  description: string;
  operation:
    'read' |
    'write';
  requiredPermissions:
    string[];
};

type AppBoundary = {
  key: string;
  name: string;
};

type ApiCredential = {
  id: string;
  name: string;
  status: string;
  keyHint: string;
  displayKey: string;
  scopes: string[];
  allowedAppKeys: string[];
  rateLimitPerMinute: number;
  expiresAt:
    string | null;
  lastUsedAt:
    string | null;
  rotatedAt:
    string | null;
  revokedAt:
    string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiRequestRow = {
  id: string;
  requestId: string;
  credentialName: string;
  routeKey: string;
  method: string;
  statusCode: number;
  outcome: string;
  durationMs: number;
  rateLimited: boolean;
  createdAt: string;
};

type MobileSection =
  | 'overview'
  | 'create'
  | 'keys'
  | 'requests';

type DeveloperState = {
  canManage: boolean;
  scopes:
    ScopeDefinition[];
  apps:
    AppBoundary[];
  credentials:
    ApiCredential[];
  requests:
    ApiRequestRow[];
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
  if (
    !value
  ) {
    return 'Never';
  }

  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? '—'
    : date.toLocaleString(
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
  return status ===
    'active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300';
}

export default function DeveloperClient({
  initialState,
}: {
  initialState:
    DeveloperState;
}) {
  const [
    state,
    setState,
  ] =
    useState(
      initialState,
    );

  const [
    name,
    setName,
  ] =
    useState(
      '',
    );

  const [
    selectedScopes,
    setSelectedScopes,
  ] =
    useState<
      Set<string>
    >(
      new Set(
        initialState.scopes
          .filter(
            scope =>
              scope.key ===
              'context.read',
          )
          .map(
            scope =>
              scope.key,
          ),
      ),
    );

  const [
    selectedApps,
    setSelectedApps,
  ] =
    useState<
      Set<string>
    >(
      new Set(),
    );

  const [
    rateLimit,
    setRateLimit,
  ] =
    useState(
      60,
    );

  const [
    expiresInDays,
    setExpiresInDays,
  ] =
    useState(
      90,
    );

  const [
    revealedKey,
    setRevealedKey,
  ] =
    useState<
      string | null
    >(
      null,
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
    mobileSection,
    setMobileSection,
  ] =
    useState<MobileSection>(
      'overview',
    );

  const activeCount =
    useMemo(
      () =>
        state.credentials
          .filter(
            credential =>
              credential.status ===
              'active',
          )
          .length,
      [
        state.credentials,
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
    const response =
      await fetch(
        '/api/workspace/developer',
        {
          credentials:
            'same-origin',
          cache:
            'no-store',
        },
      );

    const data =
      await response.json() as
        DeveloperState & {
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
        'Developer Access could not be refreshed.',
      );
    }

    setState({
      canManage:
        data.canManage,
      scopes:
        data.scopes ||
        [],
      apps:
        data.apps ||
        [],
      credentials:
        data.credentials ||
        [],
      requests:
        data.requests ||
        [],
    });
  }

  function toggleSet(
    current:
      Set<string>,
    value:
      string,
  ) {
    const next =
      new Set(
        current,
      );

    if (
      next.has(
        value,
      )
    ) {
      next.delete(
        value,
      );
    } else {
      next.add(
        value,
      );
    }

    return next;
  }

  async function createCredential() {
    if (
      !name.trim()
    ) {
      show(
        'warning',
        'Name required',
        'Give this API credential a clear name.',
      );
      return;
    }

    if (
      selectedScopes.size ===
        0
    ) {
      show(
        'warning',
        'Scope required',
        'Select at least one API scope.',
      );
      return;
    }

    setBusy(
      'create',
    );

    try {
      const response =
        await fetch(
          '/api/workspace/developer',
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
                name:
                  name.trim(),
                scopes: [
                  ...selectedScopes,
                ],
                allowedAppKeys: [
                  ...selectedApps,
                ],
                rateLimitPerMinute:
                  rateLimit,
                expiresInDays,
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
            apiKey?:
              string;
          };
        };

      if (
        !response.ok ||
        !data.success ||
        !data.result
          ?.apiKey
      ) {
        throw new Error(
          data.error ||
          'API credential could not be created.',
        );
      }

      setRevealedKey(
        data.result
          .apiKey,
      );

      setName(
        '',
      );

      await refresh();

      show(
        'success',
        'API credential created',
        'Copy the key now. SaMi stores only its cryptographic hash and cannot show the secret again.',
      );
    } catch (
      error
    ) {
      show(
        'error',
        'Creation failed',
        error instanceof
          Error
          ? error.message
          : 'API credential could not be created.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function credentialOperation(
    credential:
      ApiCredential,
    operation:
      'rotate' |
      'revoke',
  ) {
    setBusy(
      credential.id +
      ':' +
      operation,
    );

    try {
      const response =
        await fetch(
          `/api/workspace/developer/${credential.id}`,
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
          result?: {
            apiKey?:
              string;
          };
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'API credential operation failed.',
        );
      }

      if (
        operation ===
          'rotate' &&
        data.result
          ?.apiKey
      ) {
        setRevealedKey(
          data.result
            .apiKey,
        );
      }

      await refresh();

      show(
        'success',
        operation ===
          'rotate'
          ? 'Credential rotated'
          : 'Credential revoked',
        operation ===
          'rotate'
          ? 'The previous secret stopped working immediately. Copy the replacement key now.'
          : 'This credential can no longer authenticate API requests.',
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
          : 'API credential operation failed.',
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function copyKey() {
    if (
      !revealedKey
    ) {
      return;
    }

    try {
      await navigator
        .clipboard
        .writeText(
          revealedKey,
        );

      show(
        'success',
        'Copied',
        'The API key was copied to your clipboard.',
      );
    } catch {
      show(
        'warning',
        'Copy unavailable',
        'Select the key text and copy it manually.',
      );
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">

      <div className="sticky top-[68px] z-20 -mx-1 overflow-x-auto bg-[var(--sami-canvas)] px-1 py-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-1 shadow-[var(--sami-shadow-sm)]">
          {([
            ['overview', 'Overview'],
            ['create', 'Create'],
            ['keys', 'Keys'],
            ['requests', 'Requests'],
          ] as const).map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setMobileSection(
                    key,
                  )
                }
                className={[
                  'h-8 rounded-lg px-3 text-[11px] font-black transition',
                  mobileSection ===
                    key
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'text-slate-500',
                ].join(' ')}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      <div className={[
        'grid gap-3 sm:grid-cols-3',
        mobileSection === 'overview'
          ? ''
          : 'hidden lg:grid',
      ].join(' ')}> 

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
            <KeyRound className="h-4 w-4" />
            Active keys
          </div>
          <p className="mt-2 text-2xl font-black">
            {activeCount}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
            <ShieldCheck className="h-4 w-4" />
            Available scopes
          </div>
          <p className="mt-2 text-2xl font-black">
            {state.scopes.length}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
            <Activity className="h-4 w-4" />
            Recent requests
          </div>
          <p className="mt-2 text-2xl font-black">
            {state.requests.length}
          </p>
        </div>

      </div>


      {revealedKey && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
            One-time API key
          </p>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
            Store this securely. SaMi will not display the secret again.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={
                revealedKey
              }
              className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none dark:border-amber-500/20 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={
                copyKey
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-800 dark:border-amber-500/30 dark:text-amber-200"
            >
              <Clipboard className="h-4 w-4" />
              Copy
            </button>
          </div>
        </div>
      )}


      {state.canManage && (
        <section className={[
          'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5',
          mobileSection === 'create'
            ? ''
            : 'hidden lg:block',
        ].join(' ')}> 
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black">
                Create API credential
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                The credential is restricted to the current company. Grant only the scopes and app boundaries it needs.
              </p>
            </div>
            <Plus className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">

            <div className="space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Name
                </span>
                <input
                  value={
                    name
                  }
                  onChange={event =>
                    setName(
                      event.target
                        .value,
                    )
                  }
                  maxLength={200}
                  placeholder="Reporting service"
                  className="mt-1.5 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2.5 text-sm outline-none"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Requests / minute
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={
                      rateLimit
                    }
                    onChange={event =>
                      setRateLimit(
                        Math.max(
                          1,
                          Math.min(
                            600,
                            Number(
                              event.target
                                .value ||
                              60,
                            ),
                          ),
                        ),
                      )
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2.5 text-sm outline-none"
                  />
                </label>

                <label>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Expiry
                  </span>
                  <select
                    value={
                      expiresInDays
                    }
                    onChange={event =>
                      setExpiresInDays(
                        Number(
                          event.target
                            .value,
                        ),
                      )
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2.5 text-sm outline-none"
                  >
                    <option value={30}>
                      30 days
                    </option>
                    <option value={90}>
                      90 days
                    </option>
                    <option value={365}>
                      1 year
                    </option>
                    <option value={0}>
                      No expiry
                    </option>
                  </select>
                </label>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Scopes
              </p>
              <div className="mt-1.5 space-y-2">
                {state.scopes.map(
                  scope => {
                    const checked =
                      selectedScopes.has(
                        scope.key,
                      );

                    return (
                      <button
                        key={
                          scope.key
                        }
                        type="button"
                        onClick={() =>
                          setSelectedScopes(
                            current =>
                              toggleSet(
                                current,
                                scope.key,
                              ),
                          )
                        }
                        className="flex w-full items-start gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-left"
                      >
                        <span className={
                          `mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            checked
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-slate-300 dark:border-slate-700'
                          }`
                        }>
                          {checked && (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span>
                          <span className="block text-xs font-black">
                            {scope.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {scope.description}
                          </span>
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

          </div>

          {state.apps.length >
            0 && (
            <div className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                App boundary
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Optional. Selected apps become the maximum app-specific API boundary for this credential as module APIs are exposed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {state.apps.map(
                  app => {
                    const checked =
                      selectedApps.has(
                        app.key,
                      );

                    return (
                      <button
                        key={
                          app.key
                        }
                        type="button"
                        onClick={() =>
                          setSelectedApps(
                            current =>
                              toggleSet(
                                current,
                                app.key,
                              ),
                          )
                        }
                        className={
                          `rounded-full border px-3 py-1.5 text-xs font-bold ${
                            checked
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'border-[var(--sami-border)] text-slate-500'
                          }`
                        }
                      >
                        {app.name}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={
                createCredential
              }
              disabled={
                busy ===
                'create'
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              {busy ===
                'create'
                ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                )
                : (
                  <KeyRound className="h-4 w-4" />
                )}
              Create key
            </button>
          </div>
        </section>
      )}


      <section className={[
        'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)]',
        mobileSection === 'keys'
          ? ''
          : 'hidden lg:block',
      ].join(' ')}>
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <h2 className="text-base font-black">
            API credentials
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Secrets are never shown here. Rotate a key whenever its secret may have been exposed.
          </p>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {state.credentials.length ===
            0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No API credentials have been created for this company.
            </div>
          )}

          {state.credentials.map(
            credential => (
              <div
                key={
                  credential.id
                }
                className="p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black">
                        {credential.name}
                      </h3>
                      <span className={
                        `rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusTone(
                          credential.status,
                        )}`
                      }>
                        {credential.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                      {credential.displayKey}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {credential.scopes.map(
                        scope => (
                          <span
                            key={
                              scope
                            }
                            className="rounded-full border border-[var(--sami-border)] px-2 py-0.5 text-[10px] font-bold text-slate-500"
                          >
                            {scope}
                          </span>
                        ),
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {credential.rateLimitPerMinute} req/min · Last used {formatDate(
                        credential.lastUsedAt,
                      )} · Expires {formatDate(
                        credential.expiresAt,
                      )}
                    </p>
                  </div>

                  {state.canManage &&
                    credential.status ===
                      'active' && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          credentialOperation(
                            credential,
                            'rotate',
                          )
                        }
                        disabled={
                          busy ===
                          credential.id +
                            ':rotate'
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Rotate
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          credentialOperation(
                            credential,
                            'revoke',
                          )
                        }
                        disabled={
                          busy ===
                          credential.id +
                            ':revoke'
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-600 dark:border-rose-500/20 dark:text-rose-300"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </section>


      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">

        <div className={[
          'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5',
          mobileSection === 'overview'
            ? ''
            : 'hidden lg:block',
        ].join(' ')}> 
          <h2 className="text-base font-black">
            API v1
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Authenticate with the API key as a Bearer token. The first core endpoint verifies the key and returns its company context.
          </p>

          <div className="mt-4 rounded-xl border border-[var(--sami-border)] bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-200">
            <div>GET /api/v1/context</div>
            <div>Authorization: Bearer &lt;API_KEY&gt;</div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--sami-border)] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p className="text-[11px] text-slate-500">
              API keys never bypass company boundaries, scopes or rate limits. SaMi does not expose database names, credentials, raw SQL or internal platform controls through this API.
            </p>
          </div>
        </div>


        <div className={[
          'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)]',
          mobileSection === 'requests'
            ? ''
            : 'hidden lg:block',
        ].join(' ')}>
          <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
            <h2 className="text-base font-black">
              Recent API requests
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Metadata only. Request bodies, authorization headers and API secrets are not stored.
            </p>
          </div>

          <div className="max-h-[420px] divide-y divide-[var(--sami-border)] overflow-y-auto">
            {state.requests.length ===
              0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                No API requests have been recorded yet.
              </div>
            )}

            {state.requests.map(
              request => (
                <div
                  key={
                    request.id
                  }
                  className="p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black">
                        {request.method} {request.routeKey}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {request.credentialName} · {formatDate(
                          request.createdAt,
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--sami-border)] px-2 py-0.5 text-[10px] font-black">
                      {request.statusCode}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {request.durationMs} ms · {request.rateLimited
                      ? 'Rate limited'
                      : request.outcome}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>

      </section>


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

    </div>
  );
}
