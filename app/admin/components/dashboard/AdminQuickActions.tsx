import Link from 'next/link';

import {
  Building2,
  CreditCard,
  Megaphone,
  ShieldCheck,
  Users,
} from 'lucide-react';

type QuickAction = {
  title: string;
  description: string;
  href: string;
  icon: typeof Users;
};

const actions: QuickAction[] = [
  {
    title: 'Manage users',
    description:
      'Review customer accounts, status, verification, and access.',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'Manage businesses',
    description:
      'Review tenant workspaces, ownership, status, and activity.',
    href: '/admin/businesses',
    icon: Building2,
  },
  {
    title: 'Subscriptions',
    description:
      'Review plans, trials, renewals, and billing status.',
    href: '/admin/subscriptions',
    icon: CreditCard,
  },
  {
    title: 'Security',
    description:
      'Review authentication activity, sessions, and security events.',
    href: '/admin/security',
    icon: ShieldCheck,
  },
  {
    title: 'Communications',
    description:
      'Send tenant marketing, reminders, and platform announcements.',
    href: '/admin/communications',
    icon: Megaphone,
  },
];

export default function AdminQuickActions() {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-950 dark:text-white">
          Quick actions
        </h2>

        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Jump to common platform administration areas.
        </p>
      </div>

      <div className="grid gap-px bg-zinc-200 dark:bg-zinc-800 sm:grid-cols-2 xl:grid-cols-5">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              href={action.href}
              className="group bg-white p-5 transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition-transform group-hover:scale-105 dark:bg-zinc-900 dark:text-zinc-200">
                <Icon className="h-5 w-5" />
              </div>

              <h3 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
                {action.title}
              </h3>

              <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {action.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}