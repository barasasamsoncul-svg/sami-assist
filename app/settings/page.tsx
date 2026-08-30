'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Shield,
  Monitor,
  Globe,
  Bell,
  Lock,
  KeyRound,
  Link2,
  Trash2,
  Download,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

import SaMiLogo from '@/app/components/SaMiLogo';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
}

interface SessionResponse {
  authenticated: boolean;
  user?: UserProfile;
}

const SETTINGS_GROUPS = [
  {
    title: 'Account',
    description: 'Manage your personal information and account preferences.',
    items: [
      {
        href: '/settings/profile',
        icon: User,
        title: 'Profile',
        description: 'Your name, email address and profile photo',
      },
      {
        href: '/settings/notifications',
        icon: Bell,
        title: 'Notifications',
        description: 'Control when and how SaMi contacts you',
      },
      {
        href: '/settings/privacy',
        icon: Lock,
        title: 'Privacy',
        description: 'Manage your privacy and data preferences',
      },
    ],
  },
  {
    title: 'Security',
    description: 'Protect your account and manage how you sign in.',
    items: [
      {
        href: '/settings/security',
        icon: Shield,
        title: 'Password & Security',
        description: 'Password, two-factor authentication and recovery',
      },
      {
        href: '/settings/sessions',
        icon: Monitor,
        title: 'Sessions & Devices',
        description: 'Review and manage devices signed into your account',
      },
      {
        href: '/settings/connected-accounts',
        icon: Link2,
        title: 'Connected Accounts',
        description: 'Manage Google and other connected sign-in methods',
      },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');

  /*
   * ============================================================
   * Theme
   * ============================================================
   */

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    const shouldUseDark =
      savedTheme === 'dark' ||
      (!savedTheme && prefersDark);

    setDarkMode(shouldUseDark);

    document.documentElement.classList.toggle(
      'dark',
      shouldUseDark
    );
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    localStorage.setItem(
      'sami_theme',
      next ? 'dark' : 'light'
    );
  };

  /*
   * ============================================================
   * Load authenticated user
   * ============================================================
   */

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(
          '/api/auth/session',
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }
        );

        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          router.replace('/auth/login');
          return;
        }

        const data: SessionResponse =
          await response.json();

        if (!response.ok || !data.authenticated || !data.user) {
          router.replace('/auth/login');
          return;
        }

        setUser(data.user);
      } catch {
        if (!cancelled) {
          setError(
            'Unable to load your account. Please try again.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  /*
   * ============================================================
   * Sign out
   * ============================================================
   */

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    try {
      setSigningOut(true);

      const response = await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      router.replace('/auth/login');
      router.refresh();
    } catch {
      setSigningOut(false);

      setError(
        'We could not sign you out. Please try again.'
      );
    }
  };

  /*
   * ============================================================
   * Loading
   * ============================================================
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-4">
          <SaMiLogo size="lg" />

          <Loader2
            size={22}
            className="animate-spin text-blue-600"
          />

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading your settings...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * Page
   * ============================================================
   */

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] transition-colors">

      {/* ========================================================
          Header
          ======================================================== */}

      <header className="sticky top-0 z-40 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/90 dark:bg-[#0b0d10]/90 backdrop-blur-xl">

        <div className="max-w-[1180px] mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between">

          <Link
            href="/"
            className="flex items-center"
          >
            <SaMiLogo size="md" />
          </Link>

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                darkMode
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              className="
                h-10 w-10
                rounded-xl
                flex items-center justify-center
                border border-gray-200 dark:border-gray-800
                bg-white dark:bg-[#111418]
                text-gray-600 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-800
                transition
              "
            >
              {darkMode ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>

            <Link
              href="/dashboard"
              className="
                hidden sm:flex
                h-10 px-4
                rounded-xl
                items-center
                gap-2
                border border-gray-200 dark:border-gray-800
                bg-white dark:bg-[#111418]
                text-sm font-medium
                text-gray-700 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-800
                transition
              "
            >
              Back to workspace
            </Link>

          </div>
        </div>
      </header>

      {/* ========================================================
          Content
          ======================================================== */}

      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-12">

        {/* Breadcrumb */}

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 mb-7">
          <Link
            href="/dashboard"
            className="hover:text-gray-900 dark:hover:text-gray-200 transition"
          >
            Workspace
          </Link>

          <ChevronRight size={13} />

          <span className="text-gray-800 dark:text-gray-300">
            Settings
          </span>
        </div>

        {/* Heading */}

        <div className="mb-9">
          <h1 className="text-[30px] sm:text-[34px] leading-tight font-bold tracking-[-0.025em] text-gray-950 dark:text-white">
            Account settings
          </h1>

          <p className="mt-2 max-w-[650px] text-[14px] leading-6 text-gray-500 dark:text-gray-400">
            Manage your SaMi account, security, privacy and
            communication preferences.
          </p>
        </div>

        {/* Error */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="text-red-600 mt-0.5 flex-shrink-0"
            />

            <p className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          </div>
        )}

        {/* ======================================================
            Account identity card
            ====================================================== */}

        {user && (
          <section className="mb-9 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418] shadow-sm overflow-hidden">

            <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">

              <div className="flex items-center gap-4 min-w-0">

                {/* Avatar */}

                <div className="
                  h-14 w-14
                  rounded-2xl
                  flex-shrink-0
                  flex items-center justify-center
                  bg-blue-100 dark:bg-blue-900/30
                  text-blue-700 dark:text-blue-400
                  text-lg font-bold
                  overflow-hidden
                ">
                  {user.firstName?.charAt(0) ||
                    user.fullName?.charAt(0) ||
                    user.email.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">

                  <div className="flex items-center gap-2 flex-wrap">

                    <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white truncate">
                      {user.fullName ||
                        `${user.firstName} ${user.lastName}`.trim() ||
                        'SaMi User'}
                    </h2>

                    <span className="
                      inline-flex items-center gap-1
                      px-2 py-0.5
                      rounded-full
                      bg-green-50 dark:bg-green-950/30
                      text-green-700 dark:text-green-400
                      text-[10px] font-semibold
                    ">
                      <CheckCircle2 size={11} />
                      Active
                    </span>

                  </div>

                  <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400 truncate">
                    {user.email}
                  </p>

                </div>
              </div>

              <Link
                href="/settings/profile"
                className="
                  inline-flex items-center justify-center
                  h-10 px-4
                  rounded-lg
                  border border-gray-200 dark:border-gray-700
                  text-[13px] font-semibold
                  text-gray-700 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-800
                  transition
                "
              >
                Edit profile
              </Link>

            </div>

          </section>
        )}

        {/* ======================================================
            Settings groups
            ====================================================== */}

        <div className="space-y-8">

          {SETTINGS_GROUPS.map((group) => (
            <section key={group.title}>

              <div className="mb-3 px-1">

                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">
                  {group.title}
                </h2>

                <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-500">
                  {group.description}
                </p>

              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418] overflow-hidden shadow-sm">

                {group.items.map((item, index) => {

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        group
                        flex items-center gap-4
                        px-5 sm:px-6
                        py-5
                        transition
                        hover:bg-gray-50 dark:hover:bg-[#171b20]
                        ${
                          index !==
                          group.items.length - 1
                            ? 'border-b border-gray-100 dark:border-gray-800'
                            : ''
                        }
                      `}
                    >

                      <div className="
                        h-10 w-10
                        rounded-xl
                        flex items-center justify-center
                        flex-shrink-0
                        bg-gray-100 dark:bg-gray-800
                        text-gray-600 dark:text-gray-300
                        group-hover:bg-blue-50
                        group-hover:text-blue-600
                        dark:group-hover:bg-blue-950/30
                        dark:group-hover:text-blue-400
                        transition
                      ">
                        <Icon size={18} />
                      </div>

                      <div className="flex-1 min-w-0">

                        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">
                          {item.title}
                        </h3>

                        <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-gray-400">
                          {item.description}
                        </p>

                      </div>

                      <ChevronRight
                        size={17}
                        className="
                          flex-shrink-0
                          text-gray-400
                          group-hover:text-blue-600
                          dark:group-hover:text-blue-400
                          transition
                        "
                      />

                    </Link>
                  );
                })}

              </div>

            </section>
          ))}

        </div>

        {/* ======================================================
            Data & account actions
            ====================================================== */}

        <section className="mt-8">

          <div className="mb-3 px-1">

            <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">
              Your data & account
            </h2>

            <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-500">
              Manage your account data and access.
            </p>

          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418] overflow-hidden shadow-sm">

            {/* Download data */}

            <button
              type="button"
              onClick={() => {
                setError(
                  'Data export will be available soon.'
                );
              }}
              className="
                w-full
                flex items-center gap-4
                px-5 sm:px-6 py-5
                text-left
                hover:bg-gray-50 dark:hover:bg-[#171b20]
                transition
                border-b border-gray-100 dark:border-gray-800
              "
            >

              <div className="
                h-10 w-10
                rounded-xl
                flex items-center justify-center
                flex-shrink-0
                bg-gray-100 dark:bg-gray-800
                text-gray-600 dark:text-gray-300
              ">
                <Download size={18} />
              </div>

              <div className="flex-1">

                <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">
                  Export your data
                </h3>

                <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
                  Request a copy of the information associated
                  with your SaMi account.
                </p>

              </div>

              <ChevronRight
                size={17}
                className="text-gray-400"
              />

            </button>

            {/* Sign out */}

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="
                w-full
                flex items-center gap-4
                px-5 sm:px-6 py-5
                text-left
                hover:bg-gray-50 dark:hover:bg-[#171b20]
                transition
                disabled:opacity-60
              "
            >

              <div className="
                h-10 w-10
                rounded-xl
                flex items-center justify-center
                flex-shrink-0
                bg-gray-100 dark:bg-gray-800
                text-gray-600 dark:text-gray-300
              ">
                {signingOut ? (
                  <Loader2
                    size={18}
                    className="animate-spin"
                  />
                ) : (
                  <LogOut size={18} />
                )}
              </div>

              <div className="flex-1">

                <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">
                  Sign out
                </h3>

                <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
                  Sign out of SaMi on this device.
                </p>

              </div>

            </button>

          </div>

        </section>

        {/* ======================================================
            Danger zone
            ====================================================== */}

        <section className="mt-8">

          <div className="mb-3 px-1">

            <h2 className="text-[16px] font-semibold text-red-600 dark:text-red-400">
              Danger zone
            </h2>

            <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-500">
              These actions can permanently affect your account.
            </p>

          </div>

          <div className="
            rounded-2xl
            border border-red-200 dark:border-red-900/50
            bg-white dark:bg-[#111418]
            overflow-hidden
            shadow-sm
          ">

            <Link
              href="/settings/delete-account"
              className="
                group
                flex items-center gap-4
                px-5 sm:px-6 py-5
                hover:bg-red-50/50 dark:hover:bg-red-950/10
                transition
              "
            >

              <div className="
                h-10 w-10
                rounded-xl
                flex items-center justify-center
                flex-shrink-0
                bg-red-50 dark:bg-red-950/30
                text-red-600 dark:text-red-400
              ">
                <Trash2 size={18} />
              </div>

              <div className="flex-1">

                <h3 className="text-[14px] font-semibold text-red-700 dark:text-red-400">
                  Delete account
                </h3>

                <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-gray-400">
                  Permanently delete your SaMi account and
                  associated personal data.
                </p>

              </div>

              <ChevronRight
                size={17}
                className="text-red-400"
              />

            </Link>

          </div>

        </section>

        {/* ======================================================
            Footer
            ====================================================== */}

        <footer className="mt-12 pb-5">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            <div>
              <SaMiLogo size="sm" />

              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-600">
                AI-powered business workspace
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">

              <Link
                href="/help"
                className="text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 transition"
              >
                Help
              </Link>

              <Link
                href="/auth/terms"
                className="text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 transition"
              >
                Terms
              </Link>

              <Link
                href="/auth/privacy"
                className="text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 transition"
              >
                Privacy
              </Link>

              <span className="text-[11px] text-gray-400 dark:text-gray-600">
                © {new Date().getFullYear()} SaMi
              </span>

            </div>

          </div>

        </footer>

      </div>
    </main>
  );
}