import {
  AlertTriangle,
  LockKeyhole,
  MailWarning,
  ReceiptText,
  ShieldAlert,
  TimerReset,
} from 'lucide-react';

export type AdminAttentionData = {
  unverifiedUsers: number;
  lockedUsers: number;
  trialsEndingNext7Days: number;
  pastDueSubscriptions: number;
  failedAdminLoginsLast24Hours: number;
};

type AdminAttentionPanelProps = {
  attention: AdminAttentionData;
};

type AttentionItem = {
  key: string;
  title: string;
  description: string;
  value: number;
  icon: typeof AlertTriangle;
};

function numberFormat(value: number) {
  return new Intl.NumberFormat().format(value);
}

export default function AdminAttentionPanel({
  attention,
}: AdminAttentionPanelProps) {
  const items: AttentionItem[] = [
    {
      key: 'unverified-users',
      title: 'Unverified users',
      description:
        'Customer accounts that have not completed email verification.',
      value: attention.unverifiedUsers,
      icon: MailWarning,
    },
    {
      key: 'locked-users',
      title: 'Locked user accounts',
      description:
        'Customer accounts currently blocked by authentication lockout.',
      value: attention.lockedUsers,
      icon: LockKeyhole,
    },
    {
      key: 'trials-ending',
      title: 'Trials ending soon',
      description:
        'Subscriptions with trial periods ending within the next 7 days.',
      value: attention.trialsEndingNext7Days,
      icon: TimerReset,
    },
    {
      key: 'past-due-subscriptions',
      title: 'Past due subscriptions',
      description:
        'Subscriptions that may require billing follow-up or reminders.',
      value: attention.pastDueSubscriptions,
      icon: ReceiptText,
    },
    {
      key: 'admin-login-failures',
      title: 'Admin login failures',
      description:
        'Failed administrator login attempts recorded during the last 24 hours.',
      value: attention.failedAdminLoginsLast24Hours,
      icon: ShieldAlert,
    },
  ];

  const activeItems = items.filter((item) => item.value > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div>
          <h2 className="font-semibold text-zinc-950 dark:text-white">
            Attention required
          </h2>

          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Conditions that may need administrator review or follow-up.
          </p>
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
      </div>

      {activeItems.length === 0 ? (
        <div className="px-5 py-10">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
              <AlertTriangle className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            </div>

            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Nothing needs immediate attention
              </p>

              <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                No current dashboard conditions are requiring administrator
                action.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {activeItems.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.key}
                className="flex items-start justify-between gap-5 px-5 py-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.title}
                    </p>

                    <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  {numberFormat(item.value)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}