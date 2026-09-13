import {
  Activity,
  Clock3,
  ShieldAlert,
} from 'lucide-react';

export type AdminPlatformActivityItem = {
  id: string;
  actorType: string | null;
  action: string;
  eventType: string | null;
  resourceType: string | null;
  resourceId: string | null;
  result: string | null;
  tenantId: string | null;
  userId: string | null;
  createdAt: string;
};

export type AdminSecurityEventItem = {
  id: string;
  type:
    | 'login_failure'
    | 'admin_audit';
  adminId: string | null;
  eventType: string | null;
  action: string | null;
  failureReason: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type AdminActivityFeedProps = {
  platformActivity: AdminPlatformActivityItem[];
  securityEvents: AdminSecurityEventItem[];
};

function formatDate(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',
      timeStyle:
        'short',
    }
  ).format(date);
}

function formatLabel(
  value:
    string | null | undefined
) {
  if (!value) {
    return 'Unknown';
  }

  return value
    .replace(
      /[_-]+/g,
      ' '
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}

function EmptyState({
  label,
}: {
  label: string;
}) {
  return (
    <div className="px-5 py-10 text-sm text-zinc-500 dark:text-zinc-400">
      {label}
    </div>
  );
}

function ActivityResult({
  result,
}: {
  result:
    string | null;
}) {
  if (!result) {
    return null;
  }

  return (
    <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      {formatLabel(
        result
      )}
    </span>
  );
}

export default function AdminActivityFeed({
  platformActivity,
  securityEvents,
}: AdminActivityFeedProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {/* ======================================================
          PLATFORM ACTIVITY
          ====================================================== */}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-950 dark:text-white">
              Platform activity
            </h2>

            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Recent events recorded across SaMi.
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        {platformActivity.length ===
        0 ? (
          <EmptyState label="No recent platform activity." />
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {platformActivity.map(
              (
                item
              ) => (
                <div
                  key={
                    item.id
                  }
                  className="px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {formatLabel(
                            item.action
                          )}
                        </p>

                        <ActivityResult
                          result={
                            item.result
                          }
                        />
                      </div>

                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {item.resourceType
                          ? formatLabel(
                              item.resourceType
                            )
                          : item.eventType
                            ? formatLabel(
                                item.eventType
                              )
                            : 'Platform event'}
                      </p>

                      {item.actorType ? (
                        <p className="mt-1 text-xs text-zinc-400">
                          Actor:{' '}
                          {formatLabel(
                            item.actorType
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
                      <Clock3 className="h-3.5 w-3.5" />

                      <span>
                        {formatDate(
                          item.createdAt
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* ======================================================
          SECURITY ACTIVITY
          ====================================================== */}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-950 dark:text-white">
              Security activity
            </h2>

            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Recent administrator authentication and security events.
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>

        {securityEvents.length ===
        0 ? (
          <EmptyState label="No recent security events." />
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {securityEvents.map(
              (
                event
              ) => (
                <div
                  key={`${event.type}-${event.id}`}
                  className="px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {event.type ===
                        'login_failure'
                          ? 'Failed admin login'
                          : formatLabel(
                              event.action
                            )}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {event.failureReason
                          ? formatLabel(
                              event.failureReason
                            )
                          : event.eventType
                            ? formatLabel(
                                event.eventType
                              )
                            : 'Security event'}
                      </p>

                      {event.ipAddress ? (
                        <p className="mt-1 text-xs text-zinc-400">
                          IP{' '}
                          {
                            event.ipAddress
                          }
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
                      <Clock3 className="h-3.5 w-3.5" />

                      <span>
                        {formatDate(
                          event.createdAt
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}