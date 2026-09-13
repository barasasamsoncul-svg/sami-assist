'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Laptop,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type ActivityFilter =
  | 'all'
  | 'sign_ins'
  | 'security_changes';

type ActivityStatusFilter =
  | 'all'
  | 'success'
  | 'failed'
  | 'blocked';

type ActivityStatus =
  | 'success'
  | 'failed'
  | 'blocked'
  | 'info';

type ActivityCategory =
  | 'login'
  | 'password'
  | 'two_factor'
  | 'session'
  | 'email'
  | 'account'
  | 'security';

type ActivityItem = {
  id: string;

  source:
    | 'audit'
    | 'login';

  eventType:
    string;

  title:
    string;

  description:
    string | null;

  category:
    ActivityCategory;

  status:
    ActivityStatus;

  ipAddress:
    string | null;

  userAgent:
    string | null;

  device: {
    type:
      string | null;

    browser:
      string | null;

    operatingSystem:
      string | null;
  };

  metadata:
    Record<
      string,
      unknown
    > | null;

  createdAt:
    string;
};

type ActivitySummary = {
  totalSignIns:
    number;

  successfulSignIns:
    number;

  unsuccessfulSignIns:
    number;

  securityEvents:
    number;

  lastSuccessfulSignIn:
    string | null;

  lastUnsuccessfulSignIn:
    string | null;
};

type ActivityPayload = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  activity?: {
    items:
      ActivityItem[];

    pagination: {
      limit:
        number;

      hasMore:
        boolean;

      nextCursor:
        string | null;
    };

    filters: {
      selected:
        ActivityFilter;

      status:
        ActivityStatusFilter;

      available:
        ActivityFilter[];

      statuses:
        ActivityStatusFilter[];
    };

    summary:
      ActivitySummary;
  };
};

type OverlayState = {
  type:
    | 'success'
    | 'warning'
    | 'error';

  title:
    string;

  message:
    string;

  primaryAction?: {
    label:
      string;

    onClick:
      () => void;
  };

  secondaryAction?: {
    label:
      string;

    onClick:
      () => void;
  };
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const ACTIVITY_ENDPOINT =
  '/api/account/security/activity';

const PAGE_LIMIT =
  20;

const EMPTY_SUMMARY:
  ActivitySummary = {
    totalSignIns:
      0,

    successfulSignIns:
      0,

    unsuccessfulSignIns:
      0,

    securityEvents:
      0,

    lastSuccessfulSignIn:
      null,

    lastUnsuccessfulSignIn:
      null,
  };

/* ============================================================
   FORMATTERS
   ============================================================ */

function formatDate(
  value:
    string | null
) {
  if (
    !value
  ) {
    return 'No activity recorded';
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Unknown time';
  }

  return new Intl
    .DateTimeFormat(
      undefined,
      {
        dateStyle:
          'medium',

        timeStyle:
          'short',
      }
    )
    .format(
      date
    );
}

function formatRelativeTime(
  value:
    string
) {
  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Unknown time';
  }

  const difference =
    date.getTime() -
    Date.now();

  const absolute =
    Math.abs(
      difference
    );

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  const formatter =
    new Intl.RelativeTimeFormat(
      undefined,
      {
        numeric:
          'auto',
      }
    );

  if (
    absolute <
    minute
  ) {
    return 'Just now';
  }

  if (
    absolute <
    hour
  ) {
    return formatter.format(
      Math.round(
        difference /
          minute
      ),
      'minute'
    );
  }

  if (
    absolute <
    day
  ) {
    return formatter.format(
      Math.round(
        difference /
          hour
      ),
      'hour'
    );
  }

  if (
    absolute <
    day * 7
  ) {
    return formatter.format(
      Math.round(
        difference /
          day
      ),
      'day'
    );
  }

  return formatDate(
    value
  );
}

function getDeviceName(
  item:
    ActivityItem
) {
  const browser =
    item.device
      .browser
      ?.trim();

  const operatingSystem =
    item.device
      .operatingSystem
      ?.trim();

  if (
    browser &&
    operatingSystem
  ) {
    return `${browser} on ${operatingSystem}`;
  }

  if (
    browser
  ) {
    return browser;
  }

  if (
    operatingSystem
  ) {
    return operatingSystem;
  }

  if (
    item.device.type
  ) {
    return item.device.type;
  }

  return 'Unknown device';
}

function getApiMessage(
  payload:
    ActivityPayload | null,
  fallback:
    string
) {
  if (
    typeof payload?.error ===
    'string'
  ) {
    return payload.error;
  }

  if (
    typeof payload?.message ===
    'string'
  ) {
    return payload.message;
  }

  return fallback;
}

/* ============================================================
   STATUS PRESENTATION
   ============================================================ */

function getStatusPresentation(
  status:
    ActivityStatus
) {
  switch (
    status
  ) {
    case 'success':
      return {
        label:
          'Successful',

        Icon:
          CheckCircle2,

        iconClass:
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',

        badgeClass:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
      };

    case 'failed':
      return {
        label:
          'Failed',

        Icon:
          XCircle,

        iconClass:
          'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',

        badgeClass:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
      };

    case 'blocked':
      return {
        label:
          'Blocked',

        Icon:
          AlertTriangle,

        iconClass:
          'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',

        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
      };

    default:
      return {
        label:
          'Information',

        Icon:
          ShieldCheck,

        iconClass:
          'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',

        badgeClass:
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
      };
  }
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export default function SecurityActivitySettings() {
  const [
    items,
    setItems,
  ] =
    useState<
      ActivityItem[]
    >([]);

  const [
    summary,
    setSummary,
  ] =
    useState<
      ActivitySummary
    >(
      EMPTY_SUMMARY
    );

  const [
    filter,
    setFilter,
  ] =
    useState<
      ActivityFilter
    >(
      'all'
    );

  const [
    status,
    setStatus,
  ] =
    useState<
      ActivityStatusFilter
    >(
      'all'
    );

  const [
    nextCursor,
    setNextCursor,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    hasMore,
    setHasMore,
  ] =
    useState(
      false
    );

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
    loadingMore,
    setLoadingMore,
  ] =
    useState(
      false
    );

  const [
    expandedItem,
    setExpandedItem,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    overlay,
    setOverlay,
  ] =
    useState<
      OverlayState | null
    >(
      null
    );

  /* ==========================================================
     LOAD ACTIVITY
     ========================================================== */

  const loadActivity =
    useCallback(
      async ({
        cursor =
          null,

        append =
          false,

        refresh =
          false,
      }: {
        cursor?:
          string | null;

        append?:
          boolean;

        refresh?:
          boolean;
      } = {}) => {
        if (
          append
        ) {
          setLoadingMore(
            true
          );
        } else if (
          refresh
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
          const params =
            new URLSearchParams({
              limit:
                String(
                  PAGE_LIMIT
                ),

              filter,

              status,
            });

          if (
            cursor
          ) {
            params.set(
              'cursor',
              cursor
            );
          }

          const response =
            await fetch(
              `${ACTIVITY_ENDPOINT}?${params.toString()}`,
              {
                method:
                  'GET',

                credentials:
                  'include',

                cache:
                  'no-store',

                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          const payload =
            (
              await response
                .json()
                .catch(
                  () =>
                    null
                )
            ) as
              | ActivityPayload
              | null;

          /* --------------------------------------------------
             SESSION EXPIRED
             -------------------------------------------------- */

          if (
            response.status ===
              401
          ) {
            setOverlay({
              type:
                'warning',

              title:
                'Session expired',

              message:
                'Your SaMi session has expired. Sign in again to review your security activity.',

              primaryAction: {
                label:
                  'Sign in',

                onClick: () => {
                  window.location.href =
                    '/login?reason=session_expired';
                },
              },
            });

            return;
          }

          /* --------------------------------------------------
             REQUEST FAILED
             -------------------------------------------------- */

          if (
            !response.ok ||
            !payload?.success ||
            !payload.activity
          ) {
            setOverlay({
              type:
                'error',

              title:
                'Activity not loaded',

              message:
                getApiMessage(
                  payload,
                  'SaMi could not load your security activity. Try again.'
                ),

              primaryAction: {
                label:
                  'Try again',

                onClick: () => {
                  setOverlay(
                    null
                  );

                  void loadActivity({
                    refresh:
                      true,
                  });
                },
              },

              secondaryAction: {
                label:
                  'Close',

                onClick: () =>
                  setOverlay(
                    null
                  ),
              },
            });

            return;
          }

          const activity =
            payload.activity;

          setItems(
            (
              current
            ) =>
              append
                ? [
                    ...current,
                    ...activity.items,
                  ]
                : activity.items
          );

          setSummary(
            activity.summary
          );

          setNextCursor(
            activity
              .pagination
              .nextCursor
          );

          setHasMore(
            activity
              .pagination
              .hasMore
          );
        } catch {
          setOverlay({
            type:
              'error',

            title:
              'Connection problem',

            message:
              'SaMi could not connect to the server. Check your connection and try again.',

            primaryAction: {
              label:
                'Try again',

              onClick: () => {
                setOverlay(
                  null
                );

                void loadActivity({
                  refresh:
                    true,
                });
              },
            },

            secondaryAction: {
              label:
                'Close',

              onClick: () =>
                setOverlay(
                  null
                ),
            },
          });
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );

          setLoadingMore(
            false
          );
        }
      },
      [
        filter,
        status,
      ]
    );

  /* ==========================================================
     FILTER CHANGE
     ========================================================== */

  useEffect(
    () => {
      setItems(
        []
      );

      setNextCursor(
        null
      );

      setHasMore(
        false
      );

      setExpandedItem(
        null
      );

      void loadActivity();
    },
    [
      loadActivity,
    ]
  );

  /* ==========================================================
     EMPTY MESSAGE
     ========================================================== */

  const emptyMessage =
    useMemo(
      () => {
        if (
          filter !==
            'all' ||
          status !==
            'all'
        ) {
          return 'No activity matches the filters you selected.';
        }

        return 'Your sign-ins and account security changes will appear here.';
      },
      [
        filter,
        status,
      ]
    );

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {overlay && (
        <SaMiOverlay
          open
          type={
            overlay.type
          }
          title={
            overlay.title
          }
          message={
            overlay.message
          }
          primaryAction={
            overlay.primaryAction
          }
          secondaryAction={
            overlay.secondaryAction
          }
          onClose={() =>
            setOverlay(
              null
            )
          }
        />
      )}

      <div className="space-y-5">
        {/* ====================================================
            CLIENT SECURITY SUMMARY
           ==================================================== */}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Successful sign-ins"
            value={
              summary
                .successfulSignIns
            }
            description={formatDate(
              summary
                .lastSuccessfulSignIn
            )}
            icon={
              CheckCircle2
            }
            color="emerald"
          />

          <SummaryCard
            title="Unsuccessful sign-ins"
            value={
              summary
                .unsuccessfulSignIns
            }
            description={formatDate(
              summary
                .lastUnsuccessfulSignIn
            )}
            icon={
              ShieldAlert
            }
            color="red"
          />

          <SummaryCard
            title="Total sign-ins"
            value={
              summary
                .totalSignIns
            }
            description="Recorded sign-in attempts"
            icon={
              Laptop
            }
            color="blue"
          />

          <SummaryCard
            title="Security changes"
            value={
              summary
                .securityEvents
            }
            description="Changes to your security"
            icon={
              ShieldCheck
            }
            color="violet"
          />
        </section>

        {/* ====================================================
            ACTIVITY LIST
           ==================================================== */}

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">
                Your recent activity
              </h2>

              <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                Only activity belonging
                to your SaMi account is
                shown here.
              </p>
            </div>

            <button
              type="button"
              disabled={
                loading ||
                refreshing
              }
              onClick={() =>
                void loadActivity({
                  refresh:
                    true,
                })
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
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

          {/* ==================================================
              FILTERS
             ================================================== */}

          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row">
            <SelectField
              label="Activity type"
              value={
                filter
              }
              onChange={(
                value
              ) =>
                setFilter(
                  value as ActivityFilter
                )
              }
              options={[
                {
                  value:
                    'all',

                  label:
                    'All activity',
                },
                {
                  value:
                    'sign_ins',

                  label:
                    'Sign-ins',
                },
                {
                  value:
                    'security_changes',

                  label:
                    'Security changes',
                },
              ]}
            />

            <SelectField
              label="Status"
              value={
                status
              }
              onChange={(
                value
              ) =>
                setStatus(
                  value as ActivityStatusFilter
                )
              }
              options={[
                {
                  value:
                    'all',

                  label:
                    'All statuses',
                },
                {
                  value:
                    'success',

                  label:
                    'Successful',
                },
                {
                  value:
                    'failed',

                  label:
                    'Failed',
                },
                {
                  value:
                    'blocked',

                  label:
                    'Blocked',
                },
              ]}
            />
          </div>

          {/* ==================================================
              LOADING
             ================================================== */}

          {loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />

                <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Loading your security
                  activity…
                </p>
              </div>
            </div>
          ) : items.length ===
            0 ? (
            /* ================================================
               EMPTY
               ================================================ */

            <div className="flex min-h-72 items-center justify-center px-6 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <Clock3 className="h-6 w-6" />
                </div>

                <h3 className="mt-4 text-sm font-black text-slate-950 dark:text-white">
                  No activity found
                </h3>

                <p className="mt-2 max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {emptyMessage}
                </p>
              </div>
            </div>
          ) : (
            /* ================================================
               ITEMS
               ================================================ */

            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {items.map(
                (
                  item
                ) => {
                  const itemKey =
                    `${item.source}-${item.id}`;

                  return (
                    <ActivityRow
                      key={
                        itemKey
                      }
                      item={
                        item
                      }
                      expanded={
                        expandedItem ===
                        itemKey
                      }
                      onToggle={() =>
                        setExpandedItem(
                          (
                            current
                          ) =>
                            current ===
                            itemKey
                              ? null
                              : itemKey
                        )
                      }
                    />
                  );
                }
              )}
            </div>
          )}

          {/* ==================================================
              PAGINATION
             ================================================== */}

          {!loading &&
            items.length >
              0 &&
            hasMore && (
              <div className="border-t border-slate-200 p-4 text-center dark:border-slate-800">
                <button
                  type="button"
                  disabled={
                    loadingMore ||
                    !nextCursor
                  }
                  onClick={() =>
                    void loadActivity({
                      cursor:
                        nextCursor,

                      append:
                        true,
                    })
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  {loadingMore && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  {loadingMore
                    ? 'Loading…'
                    : 'Load more'}
                </button>
              </div>
            )}
        </section>

        {/* ====================================================
            PRIVACY NOTICE
           ==================================================== */}

        <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">
                Private account history
              </h3>

              <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                This page only displays
                your own security records.
                Sensitive verification
                codes, passwords, session
                tokens, and internal SaMi
                security data are never
                displayed.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/* ============================================================
   SUMMARY CARD
   ============================================================ */

function SummaryCard({
  title,
  value,
  description,
  icon:
    Icon,
  color,
}: {
  title:
    string;

  value:
    number;

  description:
    string;

  icon:
    typeof ShieldCheck;

  color:
    | 'emerald'
    | 'red'
    | 'blue'
    | 'violet';
}) {
  const colors = {
    emerald:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',

    red:
      'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',

    blue:
      'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',

    violet:
      'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  };

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-500 dark:text-slate-400">
            {title}
          </p>

          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
            {value}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors[color]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p
        title={
          description
        }
        className="mt-4 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400"
      >
        {description}
      </p>
    </div>
  );
}

/* ============================================================
   SELECT FIELD
   ============================================================ */

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string
    ) => void;

  options: Array<{
    value:
      string;

    label:
      string;
  }>;
}) {
  return (
    <label className="relative block sm:min-w-[190px]">
      <span className="sr-only">
        {label}
      </span>

      <select
        aria-label={
          label
        }
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-10 text-xs font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
      >
        {options.map(
          (
            option
          ) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          )
        )}
      </select>

      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </label>
  );
}

/* ============================================================
   ACTIVITY ROW
   ============================================================ */

function ActivityRow({
  item,
  expanded,
  onToggle,
}: {
  item:
    ActivityItem;

  expanded:
    boolean;

  onToggle:
    () => void;
}) {
  const presentation =
    getStatusPresentation(
      item.status
    );

  const StatusIcon =
    presentation.Icon;

  const DeviceIcon =
    item.device.type
      ?.toLowerCase()
      .includes(
        'mobile'
      )
      ? Smartphone
      : Laptop;

  return (
    <article>
      <button
        type="button"
        onClick={
          onToggle
        }
        aria-expanded={
          expanded
        }
        className="flex w-full items-start gap-4 p-5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/50 sm:p-6"
      >
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${presentation.iconClass}`}
        >
          <StatusIcon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h3 className="text-sm font-black text-slate-950 dark:text-white">
              {item.title}
            </h3>

            <span
              className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${presentation.badgeClass}`}
            >
              <StatusIcon className="h-3 w-3" />

              {presentation.label}
            </span>
          </div>

          {item.description && (
            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />

              {formatRelativeTime(
                item.createdAt
              )}
            </span>

            <span className="inline-flex items-center gap-1.5">
              <DeviceIcon className="h-3.5 w-3.5" />

              {getDeviceName(
                item
              )}
            </span>

            {item.ipAddress && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />

                {item.ipAddress}
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition ${
            expanded
              ? 'rotate-180'
              : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-5 dark:border-slate-900 dark:bg-slate-900/40 sm:px-6 sm:pl-[82px]">
          <dl className="grid gap-5 text-xs sm:grid-cols-2">
            <ActivityDetail
              label="Date and time"
              value={formatDate(
                item.createdAt
              )}
            />

            <ActivityDetail
              label="IP address"
              value={
                item.ipAddress ||
                'Not available'
              }
            />

            <ActivityDetail
              label="Device"
              value={getDeviceName(
                item
              )}
            />

            <ActivityDetail
              label="Security event"
              value={
                item.eventType
              }
            />

            {item.userAgent && (
              <div className="sm:col-span-2">
                <dt className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Browser information
                </dt>

                <dd className="mt-1 break-words leading-6 text-slate-700 dark:text-slate-300">
                  {item.userAgent}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </article>
  );
}

/* ============================================================
   ACTIVITY DETAIL
   ============================================================ */

function ActivityDetail({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div>
      <dt className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>

      <dd className="mt-1 break-words leading-6 text-slate-700 dark:text-slate-300">
        {value}
      </dd>
    </div>
  );
}