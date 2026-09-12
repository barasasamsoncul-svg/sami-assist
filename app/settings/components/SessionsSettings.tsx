'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Globe2,
  Laptop,
  Loader2,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  DEFAULT_USER_DISPLAY_PREFERENCES,
  formatUserDateTime,
  getUserTimezoneLabel,
  type UserDisplayPreferences,
} from '@/lib/account/user-formatting';

/* ============================================================
   TYPES
   ============================================================ */

type ActiveSession = {
  sessionId: string;

  ipAddress:
    | string
    | null;

  userAgent:
    | string
    | null;

  deviceType:
    | string
    | null;

  browser:
    | string
    | null;

  operatingSystem:
    | string
    | null;

  isCurrent: boolean;

  lastActiveAt:
    | string
    | null;

  expiresAt:
    | string
    | null;

  createdAt:
    | string
    | null;
};

type SessionsResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;

  currentSessionId?: string;

  total?: number;

  sessions?: ActiveSession[];
};

type PreferencesResponse = {
  success?: boolean;
  code?: string;
  error?: string;

  preferences?:
    UserDisplayPreferences;
};

type ActionState = {
  type:
    | 'success'
    | 'error';

  message:
    string;
};

/* ============================================================
   RESPONSE
   ============================================================ */

async function readJson<
  T,
>(
  response: Response
): Promise<T | null> {
  try {
    return (
      await response.json()
    ) as T;
  } catch {
    return null;
  }
}

/* ============================================================
   DEVICE
   ============================================================ */

function normalizeText(
  value:
    | string
    | null
    | undefined,

  fallback:
    string
) {
  const normalized =
    value?.trim();

  return normalized ||
    fallback;
}

function getDeviceIcon(
  deviceType:
    | string
    | null
    | undefined
): LucideIcon {
  const type =
    String(
      deviceType ||
        ''
    ).toLowerCase();

  if (
    type.includes(
      'mobile'
    ) ||
    type.includes(
      'phone'
    ) ||
    type.includes(
      'android'
    ) ||
    type.includes(
      'ios'
    )
  ) {
    return Smartphone;
  }

  if (
    type.includes(
      'tablet'
    ) ||
    type.includes(
      'ipad'
    )
  ) {
    return Tablet;
  }

  return Laptop;
}

function getDeviceLabel(
  session:
    ActiveSession
) {
  const browser =
    normalizeText(
      session.browser,
      'Unknown browser'
    );

  const os =
    normalizeText(
      session.operatingSystem,
      'Unknown OS'
    );

  return `${browser} on ${os}`;
}

function formatDeviceType(
  value:
    | string
    | null
    | undefined
) {
  const normalized =
    String(
      value ||
        'device'
    )
      .trim()
      .replace(
        /[_-]+/g,
        ' '
      );

  return normalized.replace(
    /\b\w/g,
    (
      letter
    ) =>
      letter.toUpperCase()
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function SessionsSettings() {
  const router =
    useRouter();

  const [
    sessions,
    setSessions,
  ] =
    useState<
      ActiveSession[]
    >([]);

  const [
    preferences,
    setPreferences,
  ] =
    useState<UserDisplayPreferences>({
      ...DEFAULT_USER_DISPLAY_PREFERENCES,
    });

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false
    );

  const [
    revokeSessionId,
    setRevokeSessionId,
  ] =
    useState<
      string | null
    >(null);

  const [
    revokingOthers,
    setRevokingOthers,
  ] =
    useState(
      false
    );

  const [
    signingOut,
    setSigningOut,
  ] =
    useState(
      false
    );

  const [
    actionState,
    setActionState,
  ] =
    useState<
      ActionState | null
    >(null);

  /* ==========================================================
     DERIVED
     ========================================================== */

  const currentSession =
    useMemo(
      () =>
        sessions.find(
          (
            session
          ) =>
            session.isCurrent
        ) ||
        null,
      [
        sessions,
      ]
    );

  const otherSessions =
    useMemo(
      () =>
        sessions.filter(
          (
            session
          ) =>
            !session.isCurrent
        ),
      [
        sessions,
      ]
    );

  const timezoneLabel =
    useMemo(
      () =>
        getUserTimezoneLabel(
          preferences,
          new Date()
        ),
      [
        preferences,
      ]
    );

  /* ==========================================================
     LOAD PREFERENCES
     ========================================================== */

  const loadPreferences =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/account/preferences',
              {
                method:
                  'GET',

                headers: {
                  Accept:
                    'application/json',
                },

                credentials:
                  'same-origin',

                cache:
                  'no-store',
              }
            );

          const data =
            await readJson<PreferencesResponse>(
              response
            );

          if (
            response.ok &&
            data?.success &&
            data.preferences
          ) {
            setPreferences(
              data.preferences
            );
          }
        } catch {
          /*
           * Formatting defaults are safe.
           * Sessions remain usable even if preferences fail.
           */
        }
      },
      []
    );

  /* ==========================================================
     LOAD SESSIONS
     ========================================================== */

  const loadSessions =
    useCallback(
      async (
        manualRefresh =
          false
      ) => {
        if (
          manualRefresh
        ) {
          setRefreshing(
            true
          );
        } else {
          setLoading(
            true
          );
        }

        try {
          const response =
            await fetch(
              '/api/account/sessions',
              {
                method:
                  'GET',

                headers: {
                  Accept:
                    'application/json',
                },

                credentials:
                  'same-origin',

                cache:
                  'no-store',
              }
            );

          const data =
            await readJson<SessionsResponse>(
              response
            );

          if (
            response.status ===
            401
          ) {
            router.replace(
              '/login?reason=session_expired'
            );

            router.refresh();

            return;
          }

          if (
            !response.ok ||
            !data?.success
          ) {
            throw new Error(
              data?.error ||
                'SaMi could not load your active sessions.'
            );
          }

          setSessions(
            Array.isArray(
              data.sessions
            )
              ? data.sessions
              : []
          );

          if (
            manualRefresh
          ) {
            setActionState({
              type:
                'success',

              message:
                'Sessions refreshed.',
            });
          }
        } catch (
          error
        ) {
          setActionState({
            type:
              'error',

            message:
              error instanceof
              Error
                ? error.message
                : 'SaMi could not load your active sessions.',
          });
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        router,
      ]
    );

  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(
    () => {
      void Promise.all([
        loadPreferences(),
        loadSessions(),
      ]);
    },
    [
      loadPreferences,
      loadSessions,
    ]
  );

  /* ==========================================================
     REVOKE ONE OTHER SESSION
     ========================================================== */

  async function revokeOneSession(
    session:
      ActiveSession
  ) {
    if (
      session.isCurrent ||
      revokeSessionId ||
      revokingOthers
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Sign out ${getDeviceLabel(
          session
        )}?`
      );

    if (
      !confirmed
    ) {
      return;
    }

    setActionState(
      null
    );

    setRevokeSessionId(
      session.sessionId
    );

    try {
      const response =
        await fetch(
          `/api/account/sessions/${encodeURIComponent(
            session.sessionId
          )}`,
          {
            method:
              'DELETE',

            headers: {
              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',
          }
        );

      const data =
        await readJson<SessionsResponse>(
          response
        );

      if (
        response.status ===
        401
      ) {
        router.replace(
          '/login?reason=session_expired'
        );

        router.refresh();

        return;
      }

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
            'SaMi could not sign out this session.'
        );
      }

      setSessions(
        (
          current
        ) =>
          current.filter(
            (
              item
            ) =>
              item.sessionId !==
              session.sessionId
          )
      );

      setActionState({
        type:
          'success',

        message:
          data.message ||
          'The device has been signed out.',
      });
    } catch (
      error
    ) {
      setActionState({
        type:
          'error',

        message:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not sign out this session.',
      });
    } finally {
      setRevokeSessionId(
        null
      );
    }
  }

  /* ==========================================================
     REVOKE ALL OTHER SESSIONS
     ========================================================== */

  async function revokeOtherSessions() {
    if (
      otherSessions.length ===
        0 ||
      revokingOthers ||
      revokeSessionId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        otherSessions.length ===
          1
          ? 'Sign out the other active device?'
          : `Sign out all ${otherSessions.length} other active devices?`
      );

    if (
      !confirmed
    ) {
      return;
    }

    setActionState(
      null
    );

    setRevokingOthers(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/sessions',
          {
            method:
              'DELETE',

            headers: {
              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',
          }
        );

      const data =
        await readJson<SessionsResponse>(
          response
        );

      if (
        response.status ===
        401
      ) {
        router.replace(
          '/login?reason=session_expired'
        );

        router.refresh();

        return;
      }

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
            'SaMi could not sign out your other devices.'
        );
      }

      setSessions(
        (
          current
        ) =>
          current.filter(
            (
              session
            ) =>
              session.isCurrent
          )
      );

      setActionState({
        type:
          'success',

        message:
          data.message ||
          'Your other devices have been signed out.',
      });
    } catch (
      error
    ) {
      setActionState({
        type:
          'error',

        message:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not sign out your other devices.',
      });
    } finally {
      setRevokingOthers(
        false
      );
    }
  }

  /* ==========================================================
     LOGOUT CURRENT DEVICE
     ========================================================== */

  async function logoutCurrentDevice() {
    if (
      signingOut
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        'Sign out this device?'
      );

    if (
      !confirmed
    ) {
      return;
    }

    setActionState(
      null
    );

    setSigningOut(
      true
    );

    try {
      const response =
        await fetch(
          '/api/auth/logout',
          {
            method:
              'POST',

            headers: {
              Accept:
                'application/json',
            },

            credentials:
              'include',

            cache:
              'no-store',
          }
        );

      if (
        !response.ok
      ) {
        const data =
          await readJson<{
            error?: string;
          }>(
            response
          );

        throw new Error(
          data?.error ||
            'SaMi could not sign you out.'
        );
      }

      router.replace(
        '/login?reason=logged_out'
      );

      router.refresh();
    } catch (
      error
    ) {
      setActionState({
        type:
          'error',

        message:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not sign you out.',
      });

      setSigningOut(
        false
      );
    }
  }

  /* ==========================================================
     LOADING
     ========================================================== */

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center">

          <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />

          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            Loading your sessions
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Checking where your SaMi account is signed in.
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <div className="max-w-5xl">

      {/* ========================================================
          HEADER
          ======================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

        <div>

          <div className="flex items-center gap-2">

            <MonitorSmartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />

            <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
              Sessions & Devices
            </h2>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Review devices currently signed in to your SaMi account and end sessions you no longer recognize or use.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadSessions(
              true
            )
          }
          disabled={
            refreshing
          }
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing
                ? 'animate-spin'
                : ''
            }`}
          />

          Refresh
        </button>
      </div>

      {/* ========================================================
          STATUS
          ======================================================== */}

      {actionState && (
        <div
          role={
            actionState.type ===
            'error'
              ? 'alert'
              : 'status'
          }
          className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
            actionState.type ===
            'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-300'
          }`}
        >
          {actionState.type ===
          'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}

          <p className="flex-1 text-xs font-semibold leading-5">
            {actionState.message}
          </p>

          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() =>
              setActionState(
                null
              )
            }
            className="text-lg leading-none opacity-60 transition hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* ========================================================
          OVERVIEW
          ======================================================== */}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">

        <SummaryCard
          icon={
            MonitorSmartphone
          }
          label="Active sessions"
          value={
            String(
              sessions.length
            )
          }
        />

        <SummaryCard
          icon={
            ShieldCheck
          }
          label="Other devices"
          value={
            String(
              otherSessions.length
            )
          }
        />

        <SummaryCard
          icon={
            Globe2
          }
          label="Display timezone"
          value={
            timezoneLabel
          }
        />
      </div>

      {/* ========================================================
          CURRENT DEVICE
          ======================================================== */}

      <div className="mt-7">

        <div className="flex items-center justify-between gap-3">

          <div>

            <h3 className="text-sm font-black text-slate-950 dark:text-white">
              This device
            </h3>

            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The browser currently viewing this page.
            </p>
          </div>
        </div>

        {currentSession ? (
          <div className="mt-4">

            <SessionCard
              session={
                currentSession
              }
              preferences={
                preferences
              }
              current
              signingOut={
                signingOut
              }
              onSignOutCurrent={
                logoutCurrentDevice
              }
            />
          </div>
        ) : (
          <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">

            <div className="flex items-start gap-3">

              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />

              <div>

                <p className="text-sm font-black text-amber-900 dark:text-amber-200">
                  Current session could not be identified
                </p>

                <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  Refresh the page. If the session has expired, SaMi will ask you to sign in again.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          OTHER DEVICES
          ======================================================== */}

      <div className="mt-8">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

          <div>

            <h3 className="text-sm font-black text-slate-950 dark:text-white">
              Other devices
            </h3>

            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Other active sessions connected to your account.
            </p>
          </div>

          {otherSessions.length >
            0 && (
            <button
              type="button"
              onClick={() =>
                void revokeOtherSessions()
              }
              disabled={
                revokingOthers ||
                Boolean(
                  revokeSessionId
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/70 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/20"
            >
              {revokingOthers ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}

              Sign out all other devices
            </button>
          )}
        </div>

        {otherSessions.length >
        0 ? (
          <div className="mt-4 space-y-3">

            {otherSessions.map(
              (
                session
              ) => (
                <SessionCard
                  key={
                    session.sessionId
                  }
                  session={
                    session
                  }
                  preferences={
                    preferences
                  }
                  revoking={
                    revokeSessionId ===
                    session.sessionId
                  }
                  actionsDisabled={
                    revokingOthers ||
                    Boolean(
                      revokeSessionId
                    )
                  }
                  onRevoke={() =>
                    void revokeOneSession(
                      session
                    )
                  }
                />
              )
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-9 text-center dark:border-slate-700 dark:bg-slate-950/40">

            <MonitorSmartphone className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-700" />

            <p className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">
              No other active devices
            </p>

            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500 dark:text-slate-400">
              When you sign in to SaMi from another browser or device, that session will appear here.
            </p>
          </div>
        )}
      </div>

      {/* ========================================================
          SECURITY NOTE
          ======================================================== */}

      <div className="mt-7 rounded-[22px] border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">

        <div className="flex items-start gap-3">

          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

          <div>

            <p className="text-sm font-black text-blue-950 dark:text-blue-200">
              Don&apos;t recognize a device?
            </p>

            <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">
              Sign that session out immediately. If you believe someone knows your password, change your password from Security settings as well.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SESSION CARD
   ============================================================ */

function SessionCard({
  session,
  preferences,
  current = false,
  revoking = false,
  signingOut = false,
  actionsDisabled = false,
  onRevoke,
  onSignOutCurrent,
}: {
  session:
    ActiveSession;

  preferences:
    UserDisplayPreferences;

  current?:
    boolean;

  revoking?:
    boolean;

  signingOut?:
    boolean;

  actionsDisabled?:
    boolean;

  onRevoke?:
    () => void;

  onSignOutCurrent?:
    () => void;
}) {
  const DeviceIcon =
    getDeviceIcon(
      session.deviceType
    );

  const lastActive =
    session.lastActiveAt
      ? formatUserDateTime(
          session.lastActiveAt,
          preferences
        )
      : 'Not available';

  const created =
    session.createdAt
      ? formatUserDateTime(
          session.createdAt,
          preferences
        )
      : 'Not available';

  const expires =
    session.expiresAt
      ? formatUserDateTime(
          session.expiresAt,
          preferences
        )
      : 'Not available';

  const browser =
    normalizeText(
      session.browser,
      'Unknown browser'
    );

  const os =
    normalizeText(
      session.operatingSystem,
      'Unknown operating system'
    );

  const ip =
    normalizeText(
      session.ipAddress,
      'Not available'
    );

  return (
    <article
      className={`rounded-[24px] border bg-white p-5 shadow-sm dark:bg-slate-900 ${
        current
          ? 'border-emerald-200 dark:border-emerald-900/70'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            current
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <DeviceIcon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center gap-2">

            <h4 className="text-sm font-black text-slate-950 dark:text-white">
              {browser}
              {' '}
              on
              {' '}
              {os}
            </h4>

            {current && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Current device
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatDeviceType(
              session.deviceType
            )}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

            <SessionInfo
              icon={
                Wifi
              }
              label="IP address"
              value={
                ip
              }
            />

            <SessionInfo
              icon={
                Clock3
              }
              label="Last active"
              value={
                lastActive
              }
            />

            <SessionInfo
              icon={
                MonitorSmartphone
              }
              label="Signed in"
              value={
                created
              }
            />

            <SessionInfo
              icon={
                ShieldCheck
              }
              label="Session expires"
              value={
                expires
              }
            />
          </div>
        </div>

        <div className="shrink-0">

          {current ? (
            <button
              type="button"
              onClick={
                onSignOutCurrent
              }
              disabled={
                signingOut
              }
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/20 lg:w-auto"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}

              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={
                onRevoke
              }
              disabled={
                revoking ||
                actionsDisabled
              }
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/20 lg:w-auto"
            >
              {revoking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}

              Sign out
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ============================================================
   SESSION INFO
   ============================================================ */

function SessionInfo({
  icon:
    Icon,
  label,
  value,
}: {
  icon:
    LucideIcon;

  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-950/60">

      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
        <Icon className="h-3.5 w-3.5" />

        {label}
      </div>

      <p className="mt-2 break-words text-xs font-bold leading-5 text-slate-800 dark:text-slate-200">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   SUMMARY
   ============================================================ */

function SummaryCard({
  icon:
    Icon,
  label,
  value,
}: {
  icon:
    LucideIcon;

  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">

      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />

        <p className="text-[10px] font-black uppercase tracking-[0.08em]">
          {label}
        </p>
      </div>

      <p className="mt-2 truncate text-sm font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}