'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Folder,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plug,
  Settings,
  ShieldCheck,
  User,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

type SettingsUser = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type SettingsTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
} | null;

type SettingsOwner = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  roleKey: string | null;
  roleName: string | null;
} | null;

type SettingsMembership = {
  userId: string;
  tenantId: string;
  accessLevel: 'owner' | 'admin' | 'member';
  isOwner: boolean;
  isAdmin: boolean;
  label: string;
} | null;

type SettingsSubscription = {
  id: string;
  status: string;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  planKey: string | null;
  planName: string | null;
} | null;

type SettingsModule = {
  key: string;
  name: string;
  status: string;
};

type SettingsSession = {
  id: string;
  expiresAt: string;
  device: {
    deviceType: string;
    browser: string;
    operatingSystem: string;
    lastActiveAt: string | null;
  };
};

type SettingsClientProps = {
  user: SettingsUser;
  tenant: SettingsTenant;
  owner: SettingsOwner;
  membership: SettingsMembership;
  subscription: SettingsSubscription;
  modules: SettingsModule[];
  session: SettingsSession;
};

type SettingsSectionKey =
  | 'personal'
  | 'security'
  | 'sessions'
  | 'workspace'
  | 'apps'
  | 'notifications'
  | 'ai'
  | 'integrations'
  | 'billing'
  | 'advanced';

type SettingsSection = {
  key: SettingsSectionKey;
  title: string;
  description: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  adminOnly?: boolean;
  status: 'ready' | 'later';
};

type NoticeState = {
  type: 'success' | 'error';
  message: string;
};

const sections: SettingsSection[] = [
  {
    key: 'personal',
    title: 'Personal',
    description: 'Profile, account details, language, and appearance.',
    icon: User,
    status: 'ready',
  },
  {
    key: 'security',
    title: 'Security',
    description: 'Password, account protection, and login safety.',
    icon: ShieldCheck,
    status: 'ready',
  },
  {
    key: 'sessions',
    title: 'Sessions',
    description: 'Current device and active login sessions.',
    icon: LockKeyhole,
    status: 'ready',
  },
  {
    key: 'workspace',
    title: 'Workspace',
    description: 'Business profile, company details, and workspace setup.',
    icon: Building2,
    status: 'later',
    adminOnly: true,
  },
  {
    key: 'apps',
    title: 'Apps',
    description: 'Installed modules, app permissions, and app settings.',
    icon: AppWindow,
    status: 'later',
    adminOnly: true,
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'Email, in-app alerts, reminders, and preferences.',
    icon: Bell,
    status: 'later',
  },
  {
    key: 'ai',
    title: 'SaMi AI',
    description: 'AI preferences, memory, models, tools, and usage.',
    icon: Bot,
    status: 'later',
  },
  {
    key: 'integrations',
    title: 'Integrations',
    description: 'Connected apps, OAuth, webhooks, and API connections.',
    icon: Plug,
    status: 'later',
    adminOnly: true,
  },
  {
    key: 'billing',
    title: 'Billing',
    description: 'Plan, usage, payment methods, and billing history.',
    icon: CreditCard,
    status: 'later',
    ownerOnly: true,
  },
  {
    key: 'advanced',
    title: 'Advanced',
    description: 'API keys, audit logs, export, transfer, and danger zone.',
    icon: KeyRound,
    status: 'later',
    ownerOnly: true,
  },
];

function canSeeSection(
  section: SettingsSection,
  membership: SettingsMembership
): boolean {
  if (section.ownerOnly && !membership?.isOwner) {
    return false;
  }

  if (section.adminOnly && !membership?.isAdmin) {
    return false;
  }

  return true;
}

function getDisplayName(user: SettingsUser): string {
  return user.firstName || user.fullName || user.email;
}

function getOwnerName(owner: SettingsOwner): string {
  if (!owner) {
    return 'Not assigned';
  }

  return owner.firstName || owner.fullName || owner.email;
}

function normalizeStatus(value?: string | null): string {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .trim();
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  try {
    return new Intl.DateTimeFormat('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'Not available';
  }
}

export default function SettingsClient({
  user,
  tenant,
  owner,
  membership,
  subscription,
  modules,
  session,
}: SettingsClientProps) {
  const visibleSections = useMemo(
    () =>
      sections.filter((section) =>
        canSeeSection(section, membership)
      ),
    [membership]
  );

  const [activeSection, setActiveSection] =
    useState<SettingsSectionKey>('security');

  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showPasswords, setShowPasswords] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [notice, setNotice] =
    useState<NoticeState | null>(null);

  async function handleChangePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not change password.'
        );
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setNotice({
        type: 'success',
        message:
          data.message || 'Password changed successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not change password.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function renderSectionContent() {
    if (activeSection === 'personal') {
      return (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-black">Personal</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your SaMi account identity.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InfoCard label="First name" value={user.firstName || 'Not set'} />
            <InfoCard label="Last name" value={user.lastName || 'Not set'} />
            <InfoCard label="Full name" value={user.fullName || getDisplayName(user)} />
            <InfoCard label="Email" value={user.email} />
          </div>

          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
            <p className="text-sm font-black">Profile editing</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              We will connect profile update API when we reach Category 02: User Account.
            </p>
          </div>
        </section>
      );
    }

    if (activeSection === 'security') {
      return (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-black">Security</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your password and account protection.
          </p>

          {notice && (
            <div
              className={[
                'mt-6 flex gap-3 rounded-2xl border p-4 text-sm',
                notice.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
              ].join(' ')}
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              )}

              <p className="leading-6">{notice.message}</p>
            </div>
          )}

          <form
            onSubmit={handleChangePassword}
            className="mt-6 max-w-xl space-y-4"
          >
            <PasswordInput
              label="Current password"
              value={currentPassword}
              show={showPasswords}
              onChange={setCurrentPassword}
            />

            <PasswordInput
              label="New password"
              value={newPassword}
              show={showPasswords}
              onChange={setNewPassword}
            />

            <PasswordInput
              label="Confirm new password"
              value={confirmPassword}
              show={showPasswords}
              onChange={setConfirmPassword}
            />

            <button
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-bold text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            >
              {showPasswords ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
              Change password
            </button>
          </form>

          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
            <p className="text-sm font-black">Coming later</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Two-factor authentication, recovery codes, login challenges, and security policies.
            </p>
          </div>
        </section>
      );
    }

    if (activeSection === 'sessions') {
      return (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-black">Sessions</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Current login session.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InfoCard label="Device" value={session.device.deviceType} />
            <InfoCard label="Browser" value={session.device.browser} />
            <InfoCard label="Operating system" value={session.device.operatingSystem} />
            <InfoCard label="Last active" value={formatDate(session.device.lastActiveAt)} />
            <InfoCard label="Session expires" value={formatDate(session.expiresAt)} />
          </div>

          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
            <p className="text-sm font-black">Active sessions list</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              We will connect full session management when we complete Category 03: Sessions & Devices.
            </p>
          </div>
        </section>
      );
    }

    if (activeSection === 'workspace') {
      return (
        <PlaceholderSection
          title="Workspace"
          description="Workspace profile and company settings will be added in Category 05 and Category 10."
          cards={[
            ['Workspace', tenant?.name || 'Not available'],
            ['Owner', getOwnerName(owner)],
            ['Status', normalizeStatus(tenant?.status)],
            ['Your access', membership?.label || 'Member'],
          ]}
        />
      );
    }

    if (activeSection === 'apps') {
      return (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-black">Apps</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Modules installed for this workspace.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modules.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700 sm:col-span-2 xl:col-span-3">
                <AppWindow className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-black">No apps installed</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Installed apps will appear here.
                </p>
              </div>
            ) : (
              modules.map((module) => (
                <div
                  key={module.key}
                  className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <AppWindow className="h-5 w-5 text-slate-400" />
                  <p className="mt-4 text-sm font-black">{module.name}</p>
                  <p className="mt-1 text-xs capitalize text-slate-500 dark:text-slate-400">
                    {normalizeStatus(module.status)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      );
    }

    if (activeSection === 'billing') {
      return (
        <PlaceholderSection
          title="Billing"
          description="SaMi subscription billing will be connected in Category 22."
          cards={[
            ['Plan', subscription?.planName || subscription?.planKey || 'Free'],
            ['Status', normalizeStatus(subscription?.status)],
            ['Billing cycle', subscription?.billingCycle || 'Not available'],
            ['Period end', formatDate(subscription?.currentPeriodEnd || null)],
          ]}
        />
      );
    }

    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-black">
          {sections.find((item) => item.key === activeSection)?.title}
        </h2>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This settings area is reserved and will be connected when we reach its category.
        </p>

        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 p-6 dark:border-slate-700">
          <WandSparkles className="h-6 w-6 text-slate-400" />
          <p className="mt-4 text-sm font-black">Coming in the platform build</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            We keep the Settings shell stable and add real controls category by category.
          </p>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <SaMiLogo />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                  SaMi Settings
                </p>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  Settings
                </h1>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="font-black">{tenant?.name || 'Workspace'}</p>
            <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
              {membership?.accessLevel || 'member'}
            </p>
          </div>
        </div>

        <div className="grid flex-1 gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-6">
            <div className="space-y-1">
              {visibleSections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.key;

                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    className={[
                      'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition',
                      active
                        ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5 shrink-0" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">
                        {section.title}
                      </span>
                      <span
                        className={[
                          'mt-0.5 block truncate text-xs',
                          active
                            ? 'text-white/70 dark:text-slate-600'
                            : 'text-slate-400',
                        ].join(' ')}
                      >
                        {section.description}
                      </span>
                    </span>

                    {section.status === 'later' && (
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-[10px] font-black',
                          active
                            ? 'bg-white/10 text-white dark:bg-slate-100 dark:text-slate-600'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                        ].join(' ')}
                      >
                        Later
                      </span>
                    )}

                    <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                  </button>
                );
              })}
            </div>
          </aside>

          <div>{renderSectionContent()}</div>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black">
        {value}
      </p>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  show,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
      </label>

      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-slate-800"
      />
    </div>
  );
}

function PlaceholderSection({
  title,
  description,
  cards,
}: {
  title: string;
  description: string;
  cards: [string, string][];
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {cards.map(([label, value]) => (
          <InfoCard key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}