'use client';

import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  KeyRound,
  Laptop,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

type SecurityView =
  | 'overview'
  | 'sessions'
  | 'activity';

type AdminSession = {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
};

type SecurityActivity = {
  id: string;
  source: 'audit' | 'login';
  eventType: string;
  action: string | null;
  successful: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type SessionsPayload = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  sessions?: AdminSession[];
  revokedCount?: number;
};

type ActivityPayload = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  activity?: SecurityActivity[];
};

type OverlayState = {
  open: boolean;
  type:
    | 'success'
    | 'error'
    | 'warning'
    | 'info';
  title: string;
  message: string;
  primaryAction?: {
    label: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
  };
};

type Props = {
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
  onBack: () => void;
  onPassword: () => void;
  onTwoFactor: () => void;
  onSessionExpired: () => void;
};

async function readJson<T>(
  response: Response
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return 'Unknown';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
}

function eventTitle(
  eventType: string
) {
  const value =
    eventType
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (!value) {
    return 'Security activity';
  }

  return value.replace(
    /\b\w/g,
    character =>
      character.toUpperCase()
  );
}

function deviceName(
  session: AdminSession
) {
  const browser =
    session.browser?.trim();

  const os =
    session.operatingSystem?.trim();

  if (browser && os) {
    return `${browser} on ${os}`;
  }

  return (
    browser ||
    os ||
    session.deviceType ||
    'Unknown device'
  );
}

function DeviceIcon({
  type,
}: {
  type: string | null;
}) {
  const value =
    type?.toLowerCase() || '';

  if (
    value.includes('mobile') ||
    value.includes('phone')
  ) {
    return (
      <Smartphone className="h-5 w-5" />
    );
  }

  if (
    value.includes('desktop') ||
    value.includes('laptop')
  ) {
    return (
      <Laptop className="h-5 w-5" />
    );
  }

  return (
    <Monitor className="h-5 w-5" />
  );
}

export default function AdminSecurityCenter({
  twoFactorEnabled,
  twoFactorRequired,
  onBack,
  onPassword,
  onTwoFactor,
  onSessionExpired,
}: Props) {
  const [
    view,
    setView,
  ] =
    useState<SecurityView>(
      'overview'
    );

  const [
    sessions,
    setSessions,
  ] =
    useState<AdminSession[]>(
      []
    );

  const [
    sessionsLoading,
    setSessionsLoading,
  ] =
    useState(false);

  const [
    activity,
    setActivity,
  ] =
    useState<SecurityActivity[]>(
      []
    );

  const [
    activityLoading,
    setActivityLoading,
  ] =
    useState(false);

  const [
    revoking,
    setRevoking,
  ] =
    useState(false);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open: false,
      type: 'info',
      title: '',
      message: '',
    });

  const closeOverlay =
    useCallback(() => {
      setOverlay(
        current => ({
          ...current,
          open: false,
        })
      );
    }, []);

  const showError =
    useCallback(
      (
        title: string,
        message: string
      ) => {
        setOverlay({
          open: true,
          type: 'error',
          title,
          message,
        });
      },
      []
    );

  const handleUnauthorized =
    useCallback(() => {
      setOverlay({
        open: true,
        type: 'warning',
        title:
          'Administrator session expired',
        message:
          'Your administrator session is no longer active. Sign in again to continue.',
        primaryAction: {
          label: 'Sign in again',
          onClick:
            onSessionExpired,
        },
      });
    }, [
      onSessionExpired,
    ]);

  const loadSessions =
    useCallback(
      async (
        showLoader = true
      ) => {
        if (showLoader) {
          setSessionsLoading(
            true
          );
        }

        try {
          const response =
            await fetch(
              '/api/admin/account/sessions',
              {
                method: 'GET',
                credentials:
                  'same-origin',
                cache:
                  'no-store',
                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          const payload =
            await readJson<SessionsPayload>(
              response
            );

          if (
            response.status ===
            401
          ) {
            handleUnauthorized();
            return;
          }

          if (
            !response.ok ||
            !payload?.success ||
            !Array.isArray(
              payload.sessions
            )
          ) {
            throw new Error(
              payload?.error ||
                'SaMi could not load your active sessions.'
            );
          }

          setSessions(
            payload.sessions
          );
        } catch (error) {
          showError(
            'Sessions not loaded',
            error instanceof Error
              ? error.message
              : 'SaMi could not load your active sessions.'
          );
        } finally {
          if (showLoader) {
            setSessionsLoading(
              false
            );
          }
        }
      },
      [
        handleUnauthorized,
        showError,
      ]
    );

  const loadActivity =
    useCallback(
      async (
        showLoader = true
      ) => {
        if (showLoader) {
          setActivityLoading(
            true
          );
        }

        try {
          const response =
            await fetch(
              '/api/admin/account/security-activity',
              {
                method: 'GET',
                credentials:
                  'same-origin',
                cache:
                  'no-store',
                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          const payload =
            await readJson<ActivityPayload>(
              response
            );

          if (
            response.status ===
            401
          ) {
            handleUnauthorized();
            return;
          }

          if (
            !response.ok ||
            !payload?.success ||
            !Array.isArray(
              payload.activity
            )
          ) {
            throw new Error(
              payload?.error ||
                'SaMi could not load your security activity.'
            );
          }

          setActivity(
            payload.activity
          );
        } catch (error) {
          showError(
            'Activity not loaded',
            error instanceof Error
              ? error.message
              : 'SaMi could not load your security activity.'
          );
        } finally {
          if (showLoader) {
            setActivityLoading(
              false
            );
          }
        }
      },
      [
        handleUnauthorized,
        showError,
      ]
    );

  useEffect(() => {
    if (
      view === 'sessions'
    ) {
      void loadSessions();
    }

    if (
      view === 'activity'
    ) {
      void loadActivity();
    }
  }, [
    view,
    loadSessions,
    loadActivity,
  ]);

  function confirmRevokeOthers() {
    const otherSessions =
      sessions.filter(
        session =>
          !session.current
      ).length;

    if (
      otherSessions === 0
    ) {
      setOverlay({
        open: true,
        type: 'info',
        title:
          'No other sessions',
        message:
          'There are no other active administrator sessions to sign out.',
      });

      return;
    }

    setOverlay({
      open: true,
      type: 'warning',
      title:
        'Sign out other sessions?',
      message:
        `This will sign out ${otherSessions} other active administrator ${
          otherSessions === 1
            ? 'session'
            : 'sessions'
        }. Your current session will remain signed in.`,
      primaryAction: {
        label:
          'Sign out others',
        onClick: () => {
          closeOverlay();

          void revokeOtherSessions();
        },
      },
      secondaryAction: {
        label: 'Cancel',
        onClick:
          closeOverlay,
      },
    });
  }

  async function revokeOtherSessions() {
    if (revoking) {
      return;
    }

    setRevoking(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/sessions',
          {
            method: 'DELETE',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      const payload =
        await readJson<SessionsPayload>(
          response
        );

      if (
        response.status === 401
      ) {
        handleUnauthorized();
        return;
      }

      if (
        !response.ok ||
        !payload?.success
      ) {
        throw new Error(
          payload?.error ||
            'SaMi could not sign out your other sessions.'
        );
      }

      const revoked =
        payload.revokedCount ??
        0;

      await loadSessions(
        false
      );

      setOverlay({
        open: true,
        type: 'success',
        title:
          'Other sessions signed out',
        message:
          revoked > 0
            ? `${revoked} other administrator ${
                revoked === 1
                  ? 'session has'
                  : 'sessions have'
              } been signed out.`
            : 'There were no other active administrator sessions to sign out.',
      });
    } catch (error) {
      showError(
        'Sign out failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not sign out your other sessions.'
      );
    } finally {
      setRevoking(false);
    }
  }

  const overlayElement = (
    <SaMiOverlay
      open={overlay.open}
      type={overlay.type}
      title={overlay.title}
      message={overlay.message}
      primaryAction={
        overlay.primaryAction
      }
      secondaryAction={
        overlay.secondaryAction
      }
      onClose={
        closeOverlay
      }
    />
  );

  if (
    view === 'sessions'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            label="Password & security"
            onClick={() =>
              setView(
                'overview'
              )
            }
            disabled={
              revoking
            }
          />

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader
              icon={
                <Monitor className="h-5 w-5" />
              }
              title="Sessions & devices"
              description="Review devices currently signed in to your administrator account."
              action={
                <button
                  type="button"
                  disabled={
                    sessionsLoading ||
                    revoking
                  }
                  onClick={() =>
                    void loadSessions()
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      sessionsLoading
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Refresh
                </button>
              }
            />

            {sessionsLoading ? (
              <LoadingState
                message="Loading your active sessions"
              />
            ) : sessions.length ===
              0 ? (
              <EmptyState
                icon={
                  <Monitor className="h-6 w-6" />
                }
                title="No active sessions"
                description="No active administrator sessions were found."
              />
            ) : (
              <>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {sessions.map(
                    session => (
                      <div
                        key={
                          session.id
                        }
                        className="px-6 py-5"
                      >
                        <div className="flex items-start gap-4">
                          <IconBox>
                            <DeviceIcon
                              type={
                                session.deviceType
                              }
                            />
                          </IconBox>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-zinc-950 dark:text-white">
                                {deviceName(
                                  session
                                )}
                              </p>

                              {session.current && (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  Current session
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                              <span>
                                {session.ipAddress ||
                                  'IP unavailable'}
                              </span>

                              <span>
                                Last active{' '}
                                {formatDate(
                                  session.lastActivityAt
                                )}
                              </span>

                              <span>
                                Signed in{' '}
                                {formatDate(
                                  session.createdAt
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                        Secure your account
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Sign out every other active administrator session while keeping this device signed in.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        revoking ||
                        !sessions.some(
                          session =>
                            !session.current
                        )
                      }
                      onClick={
                        confirmRevokeOthers
                      }
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      {revoking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}

                      {revoking
                        ? 'Signing out'
                        : 'Sign out other sessions'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {overlayElement}
      </>
    );
  }

  if (
    view === 'activity'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            label="Password & security"
            onClick={() =>
              setView(
                'overview'
              )
            }
          />

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader
              icon={
                <Clock3 className="h-5 w-5" />
              }
              title="Security activity"
              description="Review recent sign-ins and security changes on your administrator account."
              action={
                <button
                  type="button"
                  disabled={
                    activityLoading
                  }
                  onClick={() =>
                    void loadActivity()
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      activityLoading
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Refresh
                </button>
              }
            />

            {activityLoading ? (
              <LoadingState
                message="Loading your security activity"
              />
            ) : activity.length ===
              0 ? (
              <EmptyState
                icon={
                  <Clock3 className="h-6 w-6" />
                }
                title="No security activity"
                description="No recent security events were found for this administrator account."
              />
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activity.map(
                  item => (
                    <div
                      key={`${item.source}-${item.id}`}
                      className="px-6 py-5"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            item.successful
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          <ShieldCheck className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-zinc-950 dark:text-white">
                              {eventTitle(
                                item.eventType
                              )}
                            </p>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                item.successful
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                              }`}
                            >
                              {item.successful
                                ? 'Successful'
                                : 'Failed'}
                            </span>
                          </div>

                          {item.failureReason && (
                            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                              {item.failureReason}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                            <span>
                              {formatDate(
                                item.createdAt
                              )}
                            </span>

                            {item.ipAddress && (
                              <span>
                                {item.ipAddress}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </div>

        {overlayElement}
      </>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-4xl">
        <BackButton
          label="My Account"
          onClick={
            onBack
          }
        />

        <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SectionHeader
            icon={
              <ShieldCheck className="h-5 w-5" />
            }
            title="Password & security"
            description="Manage your sign-in credentials and administrator account protection."
          />

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            <SecurityRow
              icon={
                <KeyRound className="h-5 w-5" />
              }
              title="Password"
              description="Change your sign-in password."
              onClick={
                onPassword
              }
            />

            <SecurityRow
              icon={
                <ShieldCheck className="h-5 w-5" />
              }
              title="Two-factor authentication"
              description={
                twoFactorEnabled
                  ? 'Two-factor authentication is enabled.'
                  : twoFactorRequired
                    ? 'Two-factor authentication is required.'
                    : 'Add an extra layer of protection to your account.'
              }
              badge={
                twoFactorEnabled
                  ? 'Enabled'
                  : twoFactorRequired
                    ? 'Required'
                    : undefined
              }
              onClick={
                onTwoFactor
              }
            />

            <SecurityRow
              icon={
                <Monitor className="h-5 w-5" />
              }
              title="Sessions & devices"
              description="Review devices currently signed in to your account."
              onClick={() =>
                setView(
                  'sessions'
                )
              }
            />

            <SecurityRow
              icon={
                <Clock3 className="h-5 w-5" />
              }
              title="Security activity"
              description="Review recent sign-ins and security changes."
              onClick={() =>
                setView(
                  'activity'
                )
              }
            />
          </div>
        </section>
      </div>

      {overlayElement}
    </>
  );
}

function SecurityRow({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="group flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-950"
    >
      <IconBox>
        {icon}
      </IconBox>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-950 dark:text-white">
          {title}
        </p>

        <p className="mt-1 text-sm text-zinc-500">
          {description}
        </p>
      </div>

      {badge && (
        <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 sm:inline-flex">
          {badge}
        </span>
      )}

      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" />
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <IconBox>
            {icon}
          </IconBox>

          <div>
            <p className="font-bold text-zinc-950 dark:text-white">
              {title}
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              {description}
            </p>
          </div>
        </div>

        {action}
      </div>
    </div>
  );
}

function BackButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={
        disabled
      }
      onClick={
        onClick
      }
      className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function IconBox({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </div>
  );
}

function LoadingState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex min-h-56 items-center justify-center px-6 py-12">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-500" />

        <p className="mt-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          {message}
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
        {icon}
      </div>

      <p className="mt-4 font-semibold text-zinc-950 dark:text-white">
        {title}
      </p>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </div>
  );
}