import Link from 'next/link';

import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  MessageSquareText,
  Search,
} from 'lucide-react';

import {
  AdminDate,
  AdminStatusPill,
} from '@/app/admin/components/AdminResourcePage';

import {
  listAdminAlertDeliveries,
} from '@/lib/admin/notification-oversight';

import {
  listAdminNotificationEvents,
} from '@/lib/admin/oversight';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type SearchParams = {
  q?:
    string;
  page?:
    string;
  eventsPage?:
    string;
};


function pageHref(
  input: {
    q:
      string;
    page?:
      number;
    eventsPage?:
      number;
  },
) {
  const params =
    new URLSearchParams();

  if (
    input.q
  ) {
    params.set(
      'q',
      input.q,
    );
  }

  if (
    input.page &&
    input.page >
      1
  ) {
    params.set(
      'page',
      String(
        input.page,
      ),
    );
  }

  if (
    input.eventsPage &&
    input.eventsPage >
      1
  ) {
    params.set(
      'eventsPage',
      String(
        input.eventsPage,
      ),
    );
  }

  const query =
    params.toString();

  return query
    ? `/admin/notifications?${query}`
    : '/admin/notifications';
}


function PageButtons({
  page,
  totalPages,
  previousHref,
  nextHref,
}: {
  page:
    number;
  totalPages:
    number;
  previousHref:
    string;
  nextHref:
    string;
}) {
  return (
    <div className="flex items-center gap-2">
      {page >
        1 ? (
        <Link
          href={
            previousHref
          }
          className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Previous
        </Link>
      ) : (
        <span className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
          Previous
        </span>
      )}

      {page <
        totalPages ? (
        <Link
          href={
            nextHref
          }
          className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Next
        </Link>
      ) : (
        <span className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
          Next
        </span>
      )}
    </div>
  );
}


export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams:
    Promise<SearchParams>;
}) {
  await requireAdminCapability(
    'notifications.read',
  );

  const params =
    await searchParams;

  const q =
    (
      params.q ||
      ''
    )
      .trim()
      .slice(
        0,
        120,
      );

  const [
    deliveries,
    events,
  ] =
    await Promise.all([
      listAdminAlertDeliveries({
        page:
          params.page,
        search:
          q,
      }),

      listAdminNotificationEvents({
        page:
          params.eventsPage,
        limit:
          20,
        search:
          q,
      }),
    ]);

  const cards = [
    {
      label:
        'Sent · 24h',
      value:
        deliveries.summary.sent,
      detail:
        `${deliveries.summary.email} email · ${deliveries.summary.sms} SMS attempts`,
      icon:
        CheckCircle2,
    },
    {
      label:
        'Failed · 24h',
      value:
        deliveries.summary.failed,
      detail:
        'Needs provider/config review',
      icon:
        AlertTriangle,
    },
    {
      label:
        'Pending · 24h',
      value:
        deliveries.summary.pending,
      detail:
        'Claimed but not finalized',
      icon:
        Mail,
    },
    {
      label:
        'Skipped · 24h',
      value:
        deliveries.summary.skipped,
      detail:
        'Suppressed by delivery policy',
      icon:
        MessageSquareText,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Platform Administration
        </p>

        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
              Notifications & Delivery
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Inspect SaMi operational alert delivery without exposing SMS phone numbers, message bodies, provider credentials or tenant notification content.
            </p>
          </div>

          <Link
            href="/admin/settings/notifications"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 px-4 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Alert settings
          </Link>
        </div>

        <form
          action="/admin/notifications"
          method="get"
          className="mt-6 flex flex-col gap-2 sm:flex-row"
        >
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />

            <input
              name="q"
              defaultValue={
                q
              }
              placeholder="Search admin, provider, channel, error, service or incident"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-white"
            />
          </div>

          <button
            type="submit"
            className="h-11 rounded-xl bg-zinc-950 px-5 text-xs font-black text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            Search
          </button>

          {q && (
            <Link
              href="/admin/notifications"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 px-4 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Clear
            </Link>
          )}
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(
            card => {
              const Icon =
                card.icon;

              return (
                <div
                  key={
                    card.label
                  }
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      {card.label}
                    </p>

                    <Icon className="h-4 w-4 text-zinc-400" />
                  </div>

                  <p className="mt-3 text-2xl font-black text-zinc-950 dark:text-white">
                    {card.value.toLocaleString(
                      'en-KE',
                    )}
                  </p>

                  <p className="mt-1 text-[10px] text-zinc-500">
                    {card.detail}
                  </p>
                </div>
              );
            },
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-black text-zinc-950 dark:text-white">
              Platform alert deliveries
            </h2>

            <p className="mt-1 text-[11px] text-zinc-500">
              Email/SMS delivery ledger for operator alerts.
            </p>
          </div>

          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
            {deliveries.total.toLocaleString(
              'en-KE',
            )} records
          </p>
        </div>

        {!deliveries.available ? (
          <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-500/10 dark:text-amber-200">
            Alert delivery tracking is waiting for Control DB migration <strong>006-category-24-platform-admin-alert-preferences.sql</strong>. Existing notification audit activity remains available below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                  {[
                    'Channel',
                    'Status',
                    'Recipient',
                    'Context',
                    'Provider',
                    'Attempts',
                    'Error',
                    'Last attempt',
                  ].map(
                    label => (
                      <th
                        key={
                          label
                        }
                        className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {deliveries.items.map(
                  delivery => (
                    <tr
                      key={
                        delivery.id
                      }
                      className="align-top transition hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase">
                          {delivery.channel ===
                            'sms' ? (
                            <MessageSquareText className="h-3.5 w-3.5 text-zinc-400" />
                          ) : (
                            <Mail className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                          {delivery.channel}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <AdminStatusPill
                          value={
                            delivery.status
                          }
                        />
                      </td>

                      <td className="min-w-[190px] px-4 py-3">
                        <p className="text-xs font-black text-zinc-950 dark:text-white">
                          {delivery.admin.name}
                        </p>

                        <p className="mt-1 text-[10px] text-zinc-500">
                          {delivery.admin.email}
                        </p>
                      </td>

                      <td className="min-w-[220px] px-4 py-3">
                        {delivery.context.kind ===
                          'incident' ? (
                          <Link
                            href={`/admin/operations/incidents/${delivery.context.key}`}
                            className="text-xs font-black text-zinc-950 underline-offset-4 hover:underline dark:text-white"
                          >
                            {delivery.context.label}
                          </Link>
                        ) : delivery.context.kind ===
                            'service' ? (
                          <Link
                            href="/admin/operations/services"
                            className="text-xs font-black text-zinc-950 underline-offset-4 hover:underline dark:text-white"
                          >
                            {delivery.context.label}
                          </Link>
                        ) : (
                          <span className="text-xs font-black">
                            {delivery.context.label}
                          </span>
                        )}

                        {delivery.context.severity && (
                          <div className="mt-1">
                            <AdminStatusPill
                              value={
                                delivery.context.severity
                              }
                            />
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="min-w-[130px]">
                          <p className="text-xs font-bold capitalize">
                            {delivery.provider || '—'}
                          </p>

                          {delivery.providerMessageId && (
                            <p className="mt-1 max-w-[180px] truncate font-mono text-[9px] text-zinc-400">
                              {delivery.providerMessageId}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs font-black">
                        {delivery.attemptCount}
                      </td>

                      <td className="px-4 py-3">
                        {delivery.errorCode ? (
                          <span className="font-mono text-[10px] font-bold text-red-600 dark:text-red-400">
                            {delivery.errorCode}
                          </span>
                        ) : (
                          <span className="text-zinc-400">
                            —
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs">
                        <AdminDate
                          value={
                            delivery.lastAttemptAt
                          }
                        />
                      </td>
                    </tr>
                  ),
                )}

                {deliveries.items.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={
                        8
                      }
                      className="px-4 py-10 text-center text-sm text-zinc-500"
                    >
                      No Platform Admin alert deliveries match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <p className="text-[11px] font-semibold text-zinc-500">
            Page {deliveries.page} of {deliveries.totalPages}
          </p>

          <PageButtons
            page={
              deliveries.page
            }
            totalPages={
              deliveries.totalPages
            }
            previousHref={
              pageHref({
                q,
                page:
                  Math.max(
                    1,
                    deliveries.page -
                    1,
                  ),
                eventsPage:
                  events.page,
              })
            }
            nextHref={
              pageHref({
                q,
                page:
                  deliveries.page +
                  1,
                eventsPage:
                  events.page,
              })
            }
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-black text-zinc-950 dark:text-white">
              Notification & billing audit activity
            </h2>

            <p className="mt-1 text-[11px] text-zinc-500">
              Control-plane event history. Tenant message bodies remain inside their isolated workspace databases.
            </p>
          </div>

          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
            {events.total.toLocaleString(
              'en-KE',
            )} events
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                {[
                  'Event',
                  'Result',
                  'Workspace',
                  'User',
                  'Time',
                ].map(
                  label => (
                    <th
                      key={
                        label
                      }
                      className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {events.items.map(
                event => (
                  <tr
                    key={
                      event.id
                    }
                    className="align-top transition hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                  >
                    <td className="min-w-[230px] px-4 py-3">
                      <p className="text-xs font-black text-zinc-950 dark:text-white">
                        {event.eventType || event.action || 'Notification event'}
                      </p>

                      <p className="mt-1 text-[10px] text-zinc-500">
                        {event.action || '—'}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <AdminStatusPill
                        value={
                          event.result
                        }
                      />
                    </td>

                    <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">
                      {event.tenantId || '—'}
                    </td>

                    <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">
                      {event.userId || 'system'}
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <AdminDate
                        value={
                          event.createdAt
                        }
                      />
                    </td>
                  </tr>
                ),
              )}

              {events.items.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      5
                    }
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No notification audit activity matches this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <p className="text-[11px] font-semibold text-zinc-500">
            Page {events.page} of {events.totalPages}
          </p>

          <PageButtons
            page={
              events.page
            }
            totalPages={
              events.totalPages
            }
            previousHref={
              pageHref({
                q,
                page:
                  deliveries.page,
                eventsPage:
                  Math.max(
                    1,
                    events.page -
                    1,
                  ),
              })
            }
            nextHref={
              pageHref({
                q,
                page:
                  deliveries.page,
                eventsPage:
                  events.page +
                  1,
              })
            }
          />
        </div>
      </section>
    </div>
  );
}
