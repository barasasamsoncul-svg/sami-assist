'use client';

import Link from 'next/link';

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  KeyRound,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  UsersRound,
} from 'lucide-react';

import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import SaMiLogo from '@/app/components/SaMiLogo';

const THEME_STORAGE_KEY =
  'sami_theme';

type HelpLink = {
  label: string;
  description: string;
  href: string;
};

type HelpTopic = {
  title: string;
  description: string;
  icon: typeof BookOpen;
  links: HelpLink[];
};

const HELP_TOPICS: HelpTopic[] = [
  {
    title:
      'Getting started',
    description:
      'Create an account, sign in and enter your business workspace.',
    icon:
      BookOpen,
    links: [
      {
        label:
          'Create an account',
        description:
          'Start the SaMi account and workspace onboarding flow.',
        href:
          '/register',
      },
      {
        label:
          'Sign in',
        description:
          'Access an existing SaMi account.',
        href:
          '/login',
      },
      {
        label:
          'Open dashboard',
        description:
          'Return to your current workspace and permitted business context.',
        href:
          '/dashboard',
      },
    ],
  },
  {
    title:
      'Account & security',
    description:
      'Manage your identity, preferences, password, 2FA and active sessions.',
    icon:
      ShieldCheck,
    links: [
      {
        label:
          'My Account',
        description:
          'Profile, email, preferences, security and sessions.',
        href:
          '/settings?tab=account',
      },
      {
        label:
          'Reset password',
        description:
          'Recover access when you cannot remember your password.',
        href:
          '/forgot-password',
      },
    ],
  },
  {
    title:
      'People & Access',
    description:
      'Understand who belongs to the workspace and what each person may access.',
    icon:
      UsersRound,
    links: [
      {
        label:
          'People & Access',
        description:
          'Employees, invitations, roles, app access and company scope.',
        href:
          '/settings/users',
      },
      {
        label:
          'Roles & Permissions',
        description:
          'Define reusable permissions for internal users.',
        href:
          '/settings/roles',
      },
    ],
  },
  {
    title:
      'Workspace & organization',
    description:
      'Manage the business workspace and the companies operating inside it.',
    icon:
      Building2,
    links: [
      {
        label:
          'Workspace settings',
        description:
          'Workspace identity, policies, access and lifecycle controls.',
        href:
          '/settings?tab=workspace',
      },
      {
        label:
          'Organization',
        description:
          'Company profile, branches, companies and organization history.',
        href:
          '/settings?tab=organization',
      },
    ],
  },
];

export default function HelpPage() {
  const router =
    useRouter();

  const [
    darkMode,
    setDarkMode,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      try {
        const stored =
          localStorage.getItem(
            THEME_STORAGE_KEY,
          );

        const systemDark =
          window
            .matchMedia?.(
              '(prefers-color-scheme: dark)',
            )
            .matches ??
          false;

        const dark =
          stored ===
            'dark' ||
          (
            !stored &&
            systemDark
          );

        setDarkMode(
          dark,
        );

        document
          .documentElement
          .classList
          .toggle(
            'dark',
            dark,
          );
      } catch {
        // The page remains usable without theme persistence.
      }
    },
    [],
  );

  function toggleTheme() {
    const next =
      !darkMode;

    setDarkMode(
      next,
    );

    document
      .documentElement
      .classList
      .toggle(
        'dark',
        next,
      );

    try {
      localStorage.setItem(
        THEME_STORAGE_KEY,
        next
          ? 'dark'
          : 'light',
      );
    } catch {
      // Local theme persistence is optional.
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F7F9] px-4 py-5 text-slate-950 transition-colors dark:bg-[#090B10] dark:text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <SaMiLogo
            size="md"
            className="max-w-[150px]"
          />

          <button
            type="button"
            onClick={
              toggleTheme
            }
            aria-label={
              darkMode
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300"
          >
            {darkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </header>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
          <div className="border-b border-slate-200 p-5 dark:border-white/10 sm:p-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
              SaMi Help
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Find the part of SaMi you need.
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Help is organized around the actual platform areas. Open a topic, then go directly to the relevant SaMi screen.
            </p>
          </div>

          <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
            {HELP_TOPICS.map(
              topic => (
                <HelpTopicCard
                  key={
                    topic.title
                  }
                  topic={
                    topic
                  }
                />
              ),
            )}
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            <UserRound className="h-4 w-4" />
            Dashboard
          </Link>

          <Link
            href="/forgot-password"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300"
          >
            <KeyRound className="h-4 w-4" />
            Account recovery
          </Link>
        </div>
      </div>
    </main>
  );
}

function HelpTopicCard({
  topic,
}: {
  topic: HelpTopic;
}) {
  const Icon =
    topic.icon;

  return (
    <details className="group rounded-2xl border border-slate-200 bg-slate-50/70 open:bg-white dark:border-white/10 dark:bg-white/[0.025] dark:open:bg-white/[0.04]">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-300">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {topic.title}
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {topic.description}
          </p>
        </div>

        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
      </summary>

      <div className="border-t border-slate-200 p-2 dark:border-white/10">
        {topic.links.map(
          link => (
            <HelpRoute
              key={
                link.href
              }
              href={
                link.href
              }
              label={
                link.label
              }
              description={
                link.description
              }
            />
          ),
        )}
      </div>
    </details>
  );
}

function HelpRoute({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={
        href
      }
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-100 dark:hover:bg-white/5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">
          {label}
        </p>

        <p className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}
