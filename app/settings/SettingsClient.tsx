'use client';

import Link from 'next/link';

import {
  AppWindow,
  ArrowLeft,
  Bot,
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sun,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';

import MyAccountSettings from './components/MyAccountSettings';
import SessionsSettings from './components/SessionsSettings';

import {
  getAuthOverlayMessage,
} from '@/lib/auth/auth-ui-messages';

import {
  DEFAULT_USER_DISPLAY_PREFERENCES,
  formatUserDateTime,
  resolveUserTheme,
  type UserDisplayPreferences,
  type UserTheme,
} from '@/lib/account/user-formatting';

/* ============================================================
   TYPES
   ============================================================ */

type UserData = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
};

type TenantData = {
  id: string;
  name: string;
  slug: string;
  status: string;
} | null;

type MembershipData = {
  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';

  isOwner: boolean;
  isAdmin: boolean;
  label: string;
} | null;

type SubscriptionData = {
  status: string;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  planKey: string | null;
  planName: string | null;
} | null;

type ModuleData = {
  key: string;
  name: string;
  status: string;
};

type SessionData = {
  id: string;
  expiresAt: string;

  device: {
    deviceType: string;
    browser: string;
    operatingSystem: string;
    lastActiveAt: string | null;
  };
};

type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];
  session: SessionData;
};

type Section =
  | 'personal'
  | 'security'
  | 'sessions'
  | 'workspace'
  | 'apps'
  | 'ai'
  | 'billing';

type NavItem = {
  key: Section;
  label: string;
  description: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  adminOnly?: boolean;
};

type PreferencesResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  preferences?: UserDisplayPreferences;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY =
  'sami_theme';

const NAV: NavItem[] = [
  {
    key: 'personal',
    label: 'My Account',
    description:
      'Your personal SaMi account',
    icon: User,
  },

  {
    key: 'security',
    label: 'Security',
    description:
      'Password and account protection',
    icon: ShieldCheck,
  },

  {
    key: 'sessions',
    label: 'Sessions & Devices',
    description:
      'Manage signed-in devices',
    icon: LockKeyhole,
  },

  {
    key: 'workspace',
    label: 'Workspace',
    description:
      'Organization and access',
    icon: Building2,
    adminOnly: true,
  },

  {
    key: 'apps',
    label: 'Apps',
    description:
      'Installed business apps',
    icon: AppWindow,
    adminOnly: true,
  },

  {
    key: 'ai',
    label: 'SaMi AI',
    description:
      'AI workspace configuration',
    icon: Bot,
  },

  {
    key: 'billing',
    label: 'Billing',
    description:
      'Plan and subscription',
    icon: CreditCard,
    ownerOnly: true,
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

function formatLabel(
  value?: string | null
) {
  if (!value) {
    return 'Not available';
  }

  return value
    .replace(
      /[_-]+/g,
      ' '
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
    );
}

function normalizeStatus(
  value?: string | null
) {
  return (
    value
      ?.trim()
      .toLowerCase() ||
    'unknown'
  );
}

function getInitials(
  user: UserData
) {
  const first =
    user.firstName
      ?.trim()
      .charAt(0);

  const last =
    user.lastName
      ?.trim()
      .charAt(0);

  const combined =
    `${first || ''}${last || ''}`
      .trim()
      .toUpperCase();

  if (combined) {
    return combined;
  }

  return (
    user.email
      .charAt(0)
      .toUpperCase() ||
    'S'
  );
}

function getFullName(
  user: UserData
) {
  return (
    user.fullName?.trim() ||
    `${user.firstName || ''} ${
      user.lastName || ''
    }`.trim() ||
    user.email
  );
}

function passwordChecks(
  password: string
) {
  return {
    length:
      password.length >=
      8,

    uppercase:
      /[A-Z]/.test(
        password
      ),

    lowercase:
      /[a-z]/.test(
        password
      ),

    number:
      /[0-9]/.test(
        password
      ),
  };
}

function validPassword(
  password: string
) {
  const checks =
    passwordChecks(
      password
    );

  return (
    checks.length &&
    checks.uppercase &&
    checks.lowercase &&
    checks.number
  );
}

function getSectionFromUrl():
  | Section
  | null {
  if (
    typeof window ===
    'undefined'
  ) {
    return null;
  }

  const params =
    new URLSearchParams(
      window.location.search
    );

  const tab =
    params.get(
      'tab'
    );

  const match =
    NAV.find(
      (
        item
      ) =>
        item.key ===
        tab
    );

  return (
    match?.key ??
    null
  );
}

function getSystemPrefersDark():
  boolean {
  if (
    typeof window ===
    'undefined'
  ) {
    return false;
  }

  return (
    window.matchMedia?.(
      '(prefers-color-scheme: dark)'
    ).matches ??
    false
  );
}

function applyThemeToDocument(
  theme:
    UserTheme
): boolean {
  const resolved =
    resolveUserTheme(
      theme,
      getSystemPrefersDark()
    );

  const dark =
    resolved ===
    'dark';

  if (
    typeof document !==
    'undefined'
  ) {
    document
      .documentElement
      .classList
      .toggle(
        'dark',
        dark
      );
  }

  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      theme
    );
  } catch {
    // Local cache is optional.
  }

  return dark;
}

async function readPreferencesResponse(
  response:
    Response
): Promise<PreferencesResponse> {
  try {
    return (
      await response.json()
    ) as PreferencesResponse;
  } catch {
    return {
      success: false,
      code:
        'INVALID_SERVER_RESPONSE',
      error:
        'SaMi returned an invalid response.',
    };
  }
}

/* ============================================================
   SETTINGS
   ============================================================ */

export default function SettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
}: Props) {
  /* ==========================================================
     ACTIVE SECTION
     ========================================================== */

  const [
    active,
    setActive,
  ] =
    useState<Section>(
      'personal'
    );

  /* ==========================================================
     USER DISPLAY PREFERENCES
     ========================================================== */

  const [
    displayPreferences,
    setDisplayPreferences,
  ] =
    useState<UserDisplayPreferences>({
      ...DEFAULT_USER_DISPLAY_PREFERENCES,
    });

  /* ==========================================================
     THEME
     ========================================================== */

  const [
    darkMode,
    setDarkMode,
  ] =
    useState(false);

  const [
    themeSaving,
    setThemeSaving,
  ] =
    useState(false);

  /* ==========================================================
     PASSWORD
     ========================================================== */

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState('');

  const [
    newPassword,
    setNewPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showPasswords,
    setShowPasswords,
  ] =
    useState(false);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<
      ReturnType<
        typeof getAuthOverlayMessage
      > | null
    >(null);

  /* ==========================================================
     ACCESS
     ========================================================== */

  const canAdminWorkspace =
    Boolean(
      membership?.isAdmin ||
        membership?.isOwner
    );

  const visibleNav =
    useMemo(
      () =>
        NAV.filter(
          (
            item
          ) => {
            if (
              item.ownerOnly &&
              !membership
                ?.isOwner
            ) {
              return false;
            }

            if (
              item.adminOnly &&
              !canAdminWorkspace
            ) {
              return false;
            }

            return true;
          }
        ),
      [
        membership,
        canAdminWorkspace,
      ]
    );

  /* ==========================================================
     INITIAL SECTION
     ========================================================== */

  useEffect(
    () => {
      const requested =
        getSectionFromUrl();

      if (!requested) {
        return;
      }

      const permitted =
        visibleNav.some(
          (
            item
          ) =>
            item.key ===
            requested
        );

      if (
        permitted
      ) {
        setActive(
          requested
        );
      }
    },
    [
      visibleNav,
    ]
  );

  /* ==========================================================
     INITIAL LOCAL THEME

     This gives immediate appearance before the preferences API
     finishes loading.

     The saved server preference becomes authoritative once
     loaded below.
     ========================================================== */

  useEffect(
    () => {
      try {
        const stored =
          localStorage.getItem(
            THEME_STORAGE_KEY
          );

        const theme:
          UserTheme =
          stored ===
            'dark' ||
          stored ===
            'light' ||
          stored ===
            'system'
            ? stored
            : 'system';

        const dark =
          applyThemeToDocument(
            theme
          );

        setDarkMode(
          dark
        );
      } catch {
        const dark =
          getSystemPrefersDark();

        setDarkMode(
          dark
        );

        document.documentElement.classList.toggle(
          'dark',
          dark
        );
      }
    },
    []
  );

  /* ==========================================================
     LOAD SAVED USER PREFERENCES

     This makes the database preference authoritative.

     Therefore:
     - a different browser/device receives the user's theme
     - session timestamps use their timezone
     - billing dates use their date/time format
     ========================================================== */

  useEffect(
    () => {
      let cancelled =
        false;

      async function loadPreferences() {
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
            await readPreferencesResponse(
              response
            );

          if (
            !response.ok ||
            !data.success ||
            !data.preferences
          ) {
            return;
          }

          if (
            cancelled
          ) {
            return;
          }

          setDisplayPreferences(
            data.preferences
          );

          const dark =
            applyThemeToDocument(
              data.preferences
                .theme
            );

          setDarkMode(
            dark
          );
        } catch {
          /*
           * Settings remain usable with the safe defaults.
           *
           * The user can still open My Account, where a proper
           * account-loading error is displayed if needed.
           */
        }
      }

      void loadPreferences();

      return () => {
        cancelled =
          true;
      };
    },
    []
  );

  /* ==========================================================
     SYSTEM THEME CHANGES

     If theme is "system", SaMi follows the operating system
     while the user is signed in.
     ========================================================== */

  useEffect(
    () => {
      if (
        displayPreferences
          .theme !==
        'system'
      ) {
        return;
      }

      const media =
        window.matchMedia(
          '(prefers-color-scheme: dark)'
        );

      const syncTheme =
        () => {
          const dark =
            applyThemeToDocument(
              'system'
            );

          setDarkMode(
            dark
          );
        };

      syncTheme();

      media.addEventListener?.(
        'change',
        syncTheme
      );

      return () => {
        media.removeEventListener?.(
          'change',
          syncTheme
        );
      };
    },
    [
      displayPreferences
        .theme,
    ]
  );

  /* ==========================================================
     TOP BAR THEME TOGGLE

     This is now a REAL account preference.

     Previously the button only changed localStorage.

     It now:
     1. changes the UI immediately
     2. updates local preference state
     3. persists the change to user_preferences
     4. rolls back if persistence fails
     ========================================================== */

  async function toggleTheme() {
    if (
      themeSaving
    ) {
      return;
    }

    const previousPreferences =
      displayPreferences;

    const previousDark =
      darkMode;

    const nextTheme:
      UserTheme =
      darkMode
        ? 'light'
        : 'dark';

    const optimisticPreferences:
      UserDisplayPreferences = {
      ...displayPreferences,
      theme:
        nextTheme,
    };

    setThemeSaving(
      true
    );

    setDisplayPreferences(
      optimisticPreferences
    );

    const nextDark =
      applyThemeToDocument(
        nextTheme
      );

    setDarkMode(
      nextDark
    );

    try {
      const response =
        await fetch(
          '/api/account/preferences',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                theme:
                  nextTheme,
              }),
          }
        );

      const data =
        await readPreferencesResponse(
          response
        );

      if (
        !response.ok ||
        !data.success ||
        !data.preferences
      ) {
        throw new Error(
          data.error ||
            'Theme preference could not be saved.'
        );
      }

      setDisplayPreferences(
        data.preferences
      );

      const savedDark =
        applyThemeToDocument(
          data.preferences
            .theme
        );

      setDarkMode(
        savedDark
      );
    } catch (
      error
    ) {
      setDisplayPreferences(
        previousPreferences
      );

      applyThemeToDocument(
        previousPreferences
          .theme
      );

      setDarkMode(
        previousDark
      );

      console.error(
        '[Settings] Failed to save theme preference:',
        error
      );
    } finally {
      setThemeSaving(
        false
      );
    }
  }

  /* ==========================================================
     SECTION NAVIGATION
     ========================================================== */

  function selectSection(
    section:
      Section
  ) {
    setActive(
      section
    );

    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      'tab',
      section
    );

    window.history.replaceState(
      {},
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  /* ==========================================================
     CHANGE PASSWORD
     ========================================================== */

  async function changePassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting
    ) {
      return;
    }

    /* ========================================================
       CURRENT PASSWORD
       ======================================================== */

    if (
      !currentPassword
    ) {
      setOverlay(
        getAuthOverlayMessage(
          'CURRENT_PASSWORD_REQUIRED'
        )
      );

      return;
    }

    /* ========================================================
       PASSWORD POLICY
       ======================================================== */

    if (
      !validPassword(
        newPassword
      )
    ) {
      setOverlay(
        getAuthOverlayMessage(
          'PASSWORD_WEAK'
        )
      );

      return;
    }

    /* ========================================================
       CONFIRMATION
       ======================================================== */

    if (
      newPassword !==
      confirmPassword
    ) {
      setOverlay(
        getAuthOverlayMessage(
          'PASSWORDS_DO_NOT_MATCH'
        )
      );

      return;
    }

    /* ========================================================
       REQUEST
       ======================================================== */

    setSubmitting(
      true
    );

    setOverlay(
      null
    );

    try {
      const response =
        await fetch(
          '/api/auth/change-password',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'include',

            cache:
              'no-store',

            body:
              JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword,
              }),
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (
        !response.ok ||
        !data.success
      ) {
        setOverlay(
          getAuthOverlayMessage(
            data.code,
            {
              fallback:
                data.error ||
                data.message,
            }
          )
        );

        return;
      }

      setCurrentPassword(
        ''
      );

      setNewPassword(
        ''
      );

      setConfirmPassword(
        ''
      );

      setOverlay(
        getAuthOverlayMessage(
          'PASSWORD_CHANGED'
        )
      );
    } catch {
      setOverlay(
        getAuthOverlayMessage(
          'CHANGE_PASSWORD_ERROR',
          {
            fallback:
              'SaMi could not connect to the server. Check your connection and try again.',
          }
        )
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     DERIVED
     ========================================================== */

  const currentNav =
    visibleNav.find(
      (
        item
      ) =>
        item.key ===
        active
    ) ??
    visibleNav[0];

  const currentPlan =
    subscription?.planName ||
    (
      subscription?.planKey
        ? formatLabel(
            subscription.planKey
          )
        : 'Free'
    );

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      {/* ======================================================
          OVERLAY
          ====================================================== */}

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

      <main className="min-h-screen bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">

        {/* ====================================================
            TOP BAR
            ==================================================== */}

        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-[#090d15]/90">

          <div className="mx-auto flex h-[72px] max-w-[1500px] items-center gap-4 px-4 sm:px-6 lg:px-8">

            {/* BACK */}

            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* LOGO */}

            <Link
              href="/dashboard"
              className="min-w-0 shrink-0"
            >
              <SaMiLogo
                size="sm"
                className="max-w-full"
              />
            </Link>

            <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-800 sm:block" />

            {/* PAGE IDENTITY */}

            <div className="hidden min-w-0 sm:block">

              <p className="truncate text-sm font-black">
                Settings
              </p>

              <p className="truncate text-[10px] text-slate-400">
                {tenant?.name ||
                  'SaMi workspace'}
              </p>
            </div>

            {/* RIGHT */}

            <div className="ml-auto flex items-center gap-2">

              {/* THEME */}

              <button
                type="button"
                onClick={() =>
                  void toggleTheme()
                }
                disabled={
                  themeSaving
                }
                aria-label={
                  darkMode
                    ? 'Switch to light theme'
                    : 'Switch to dark theme'
                }
                title={
                  displayPreferences
                    .theme ===
                  'system'
                    ? 'Theme currently follows your system'
                    : `Theme: ${displayPreferences.theme}`
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {themeSaving ? (
                  <Loader2 className="h-[17px] w-[17px] animate-spin" />
                ) : darkMode ? (
                  <Sun className="h-[17px] w-[17px]" />
                ) : (
                  <Moon className="h-[17px] w-[17px]" />
                )}
              </button>

              {/* USER */}

              <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white py-1.5 pl-2 pr-3 dark:border-slate-800 dark:bg-slate-900 md:flex">

                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-[10px] font-black text-white">
                  {getInitials(
                    user
                  )}
                </div>

                <div className="min-w-0">

                  <p className="max-w-[160px] truncate text-[11px] font-black">
                    {getFullName(
                      user
                    )}
                  </p>

                  <p className="text-[9px] capitalize text-slate-400">
                    {membership?.label ||
                      membership
                        ?.accessLevel ||
                      'Member'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ====================================================
            BODY
            ==================================================== */}

        <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">

          {/* ==================================================
              MOBILE NAV
              ================================================== */}

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {visibleNav.map(
              (
                item
              ) => {
                const Icon =
                  item.icon;

                const selected =
                  active ===
                  item.key;

                return (
                  <button
                    key={
                      item.key
                    }
                    type="button"
                    onClick={() =>
                      selectSection(
                        item.key
                      )
                    }
                    className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />

                    {item.label}
                  </button>
                );
              }
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">

            {/* =================================================
                SIDEBAR
                ================================================= */}

            <aside className="hidden h-fit rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] lg:block">

              <div className="px-3 pb-3 pt-2">

                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Settings
                </p>
              </div>

              <div className="space-y-1">

                {visibleNav.map(
                  (
                    item
                  ) => {
                    const Icon =
                      item.icon;

                    const selected =
                      active ===
                      item.key;

                    return (
                      <button
                        key={
                          item.key
                        }
                        type="button"
                        onClick={() =>
                          selectSection(
                            item.key
                          )
                        }
                        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                          selected
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                        }`}
                      >

                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            selected
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">

                          <p className="text-[12px] font-black">
                            {item.label}
                          </p>

                          <p className="mt-0.5 truncate text-[9px] font-medium opacity-60">
                            {item.description}
                          </p>
                        </div>

                        <ChevronRight
                          className={`h-3.5 w-3.5 transition ${
                            selected
                              ? 'opacity-100'
                              : 'opacity-0 group-hover:opacity-50'
                          }`}
                        />
                      </button>
                    );
                  }
                )}
              </div>
            </aside>

            {/* =================================================
                CONTENT
                ================================================= */}

            <section className="min-w-0 rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d121b]">

              {/* SECTION HEADER */}

              <div className="border-b border-slate-100 px-5 py-5 sm:px-7 dark:border-slate-800">

                <div className="flex items-center gap-3">

                  {currentNav && (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <currentNav.icon className="h-[18px] w-[18px]" />
                    </div>
                  )}

                  <div>

                    <h1 className="text-lg font-black">
                      {currentNav
                        ?.label ||
                        'Settings'}
                    </h1>

                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {currentNav
                        ?.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-7">

                {/* =============================================
                    MY ACCOUNT
                    ============================================= */}

                {active ===
                  'personal' && (
                  <MyAccountSettings />
                )}

                {/* =============================================
                    SECURITY
                    ============================================= */}

                {active ===
                  'security' && (
                  <SecuritySection
                    currentPassword={
                      currentPassword
                    }
                    newPassword={
                      newPassword
                    }
                    confirmPassword={
                      confirmPassword
                    }
                    showPasswords={
                      showPasswords
                    }
                    submitting={
                      submitting
                    }
                    setCurrentPassword={
                      setCurrentPassword
                    }
                    setNewPassword={
                      setNewPassword
                    }
                    setConfirmPassword={
                      setConfirmPassword
                    }
                    setShowPasswords={
                      setShowPasswords
                    }
                    onSubmit={
                      changePassword
                    }
                  />
                )}

                {/* =============================================
                    SESSIONS
                    ============================================= */}

                {active ===
                  'sessions' && (
                  <SessionsSettings />
                )}

                {/* =============================================
                    WORKSPACE
                    ============================================= */}

                {active ===
                  'workspace' &&
                  canAdminWorkspace && (
                    <WorkspaceSection
                      tenant={
                        tenant
                      }
                      membership={
                        membership
                      }
                    />
                  )}

                {/* =============================================
                    APPS
                    ============================================= */}

                {active ===
                  'apps' &&
                  canAdminWorkspace && (
                    <AppsSection
                      modules={
                        modules
                      }
                    />
                  )}

                {/* =============================================
                    SAMI AI
                    ============================================= */}

                {active ===
                  'ai' && (
                  <AiSection
                    planName={
                      currentPlan
                    }
                  />
                )}

                {/* =============================================
                    BILLING
                    ============================================= */}

                {active ===
                  'billing' &&
                  membership
                    ?.isOwner && (
                    <BillingSection
                      subscription={
                        subscription
                      }
                      currentPlan={
                        currentPlan
                      }
                      preferences={
                        displayPreferences
                      }
                    />
                  )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   SECURITY
   ============================================================ */

function SecuritySection({
  currentPassword,
  newPassword,
  confirmPassword,
  showPasswords,
  submitting,
  setCurrentPassword,
  setNewPassword,
  setConfirmPassword,
  setShowPasswords,
  onSubmit,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  showPasswords: boolean;
  submitting: boolean;

  setCurrentPassword:
    (
      value: string
    ) => void;

  setNewPassword:
    (
      value: string
    ) => void;

  setConfirmPassword:
    (
      value: string
    ) => void;

  setShowPasswords:
    (
      value:
        | boolean
        | (
            (
              current:
                boolean
            ) =>
              boolean
          )
    ) => void;

  onSubmit:
    (
      event:
        FormEvent<HTMLFormElement>
    ) => void;
}) {
  const checks =
    passwordChecks(
      newPassword
    );

  const passwordsMatch =
    Boolean(
      confirmPassword &&
      newPassword ===
        confirmPassword
    );

  return (
    <div className="grid max-w-5xl gap-6 xl:grid-cols-[minmax(0,560px)_1fr]">

      {/* PASSWORD FORM */}

      <form
        onSubmit={
          onSubmit
        }
        className="min-w-0"
      >
        <div className="space-y-4">

          <PasswordField
            label="Current password"
            value={
              currentPassword
            }
            onChange={
              setCurrentPassword
            }
            show={
              showPasswords
            }
            autoComplete="current-password"
          />

          <PasswordField
            label="New password"
            value={
              newPassword
            }
            onChange={
              setNewPassword
            }
            show={
              showPasswords
            }
            autoComplete="new-password"
          />

          <PasswordField
            label="Confirm new password"
            value={
              confirmPassword
            }
            onChange={
              setConfirmPassword
            }
            show={
              showPasswords
            }
            autoComplete="new-password"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            setShowPasswords(
              (
                current
              ) =>
                !current
            )
          }
          className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          {showPasswords ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}

          {showPasswords
            ? 'Hide passwords'
            : 'Show passwords'}
        </button>

        <button
          type="submit"
          disabled={
            submitting
          }
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />

              Changing password...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />

              Change password
            </>
          )}
        </button>
      </form>

      {/* PASSWORD RULES */}

      <div className="space-y-4">

        <div className="rounded-[20px] border border-slate-200 p-4 dark:border-slate-800">

          <p className="text-xs font-black">
            Password requirements
          </p>

          <div className="mt-4 grid gap-2">

            <PasswordRule
              valid={
                checks.length
              }
              label="At least 8 characters"
            />

            <PasswordRule
              valid={
                checks.uppercase
              }
              label="Uppercase letter"
            />

            <PasswordRule
              valid={
                checks.lowercase
              }
              label="Lowercase letter"
            />

            <PasswordRule
              valid={
                checks.number
              }
              label="Number"
            />

            <PasswordRule
              valid={
                passwordsMatch
              }
              label="Passwords match"
            />
          </div>
        </div>

        <div className="rounded-[20px] border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/25">

          <div className="flex items-start gap-3">

            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />

            <div>

              <p className="text-xs font-black text-blue-900 dark:text-blue-200">
                Two-factor authentication
              </p>

              <p className="mt-1 text-[10px] leading-4 text-blue-700 dark:text-blue-300">
                SaMi supports two-factor
                verification during sign-in,
                including authenticator codes
                and recovery codes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   WORKSPACE
   ============================================================ */

function WorkspaceSection({
  tenant,
  membership,
}: {
  tenant:
    TenantData;

  membership:
    MembershipData;
}) {
  if (
    !tenant
  ) {
    return (
      <EmptyState
        icon={
          Building2
        }
        title="No workspace available"
        description="SaMi could not find an active workspace for this account."
      />
    );
  }

  return (
    <div className="max-w-4xl">

      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/50">

        <div className="flex items-center gap-4">

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Building2 className="h-5 w-5" />
          </div>

          <div className="min-w-0">

            <h2 className="truncate text-lg font-black">
              {tenant.name}
            </h2>

            <p className="mt-1 text-[10px] capitalize text-slate-500 dark:text-slate-400">
              {formatLabel(
                membership
                  ?.accessLevel
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">

        <InfoCard
          label="Workspace name"
          value={
            tenant.name
          }
        />

        <InfoCard
          label="Workspace identifier"
          value={
            tenant.slug
          }
        />

        <InfoCard
          label="Workspace status"
          value={
            formatLabel(
              tenant.status
            )
          }
        />

        <InfoCard
          label="Your access"
          value={
            membership?.label ||
            formatLabel(
              membership
                ?.accessLevel
            )
          }
        />
      </div>
    </div>
  );
}

/* ============================================================
   APPS
   ============================================================ */

function AppsSection({
  modules,
}: {
  modules:
    ModuleData[];
}) {
  if (
    modules.length ===
    0
  ) {
    return (
      <EmptyState
        icon={
          AppWindow
        }
        title="No business apps installed"
        description="There are currently no installed business apps available to this workspace."
      />
    );
  }

  return (
    <div>

      <div className="mb-4 flex items-center justify-between gap-3">

        <div>

          <h2 className="text-sm font-black">
            Installed apps
          </h2>

          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            {modules.length}{' '}
            {modules.length ===
            1
              ? 'business app'
              : 'business apps'}{' '}
            registered for this workspace.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

        {modules.map(
          (
            module
          ) => {
            const active =
              normalizeStatus(
                module.status
              ) ===
              'active';

            return (
              <div
                key={
                  module.key
                }
                className="rounded-[18px] border border-slate-200 p-4 transition dark:border-slate-800"
              >

                <div className="flex items-start gap-3">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
                    <AppWindow className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0 flex-1">

                    <p className="truncate text-xs font-black">
                      {module.name}
                    </p>

                    <div className="mt-2">

                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${
                          active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {formatLabel(
                          module.status
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SAMI AI
   ============================================================ */

function AiSection({
  planName,
}: {
  planName:
    string;
}) {
  return (
    <div className="max-w-4xl">

      <div className="relative overflow-hidden rounded-[24px] border border-violet-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-6 dark:border-violet-900/60 dark:from-blue-950/25 dark:via-indigo-950/20 dark:to-violet-950/25">

        <div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl"
        />

        <div className="relative flex items-start gap-4">

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20">
            <Bot className="h-5 w-5" />
          </div>

          <div>

            <div className="flex flex-wrap items-center gap-2">

              <h2 className="text-base font-black">
                SaMi AI
              </h2>

              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-violet-700 dark:bg-white/10 dark:text-violet-300">
                Core platform
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              SaMi AI is part of the core
              workspace rather than an
              installed business app.
              Installed apps can provide
              additional tools and context to
              AI when permitted.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">

        <InfoCard
          label="Current plan"
          value={
            planName
          }
        />

        <InfoCard
          label="AI allowance"
          value="Applied per user"
        />
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">

        <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

        <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
          SaMi AI query allowances are
          assigned per user according to the
          active subscription plan. This page
          does not invent usage totals that
          have not been supplied by the
          platform usage service.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   BILLING
   ============================================================ */

function BillingSection({
  subscription,
  currentPlan,
  preferences,
}: {
  subscription:
    SubscriptionData;

  currentPlan:
    string;

  preferences:
    UserDisplayPreferences;
}) {
  return (
    <div className="max-w-4xl">

      <div className="rounded-[24px] border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">

        <div className="flex items-start gap-4">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <CreditCard className="h-5 w-5" />
          </div>

          <div>

            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
              Current subscription
            </p>

            <h2 className="mt-1 text-xl font-black">
              {currentPlan}
            </h2>

            <p className="mt-1 text-[10px] text-blue-700 dark:text-blue-300">
              Subscription pricing is
              calculated per billable
              workspace user.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">

        <InfoCard
          label="Plan"
          value={
            currentPlan
          }
        />

        <InfoCard
          label="Subscription status"
          value={
            formatLabel(
              subscription
                ?.status
            )
          }
        />

        <InfoCard
          label="Billing cycle"
          value={
            formatLabel(
              subscription
                ?.billingCycle
            )
          }
        />

        <InfoCard
          label="Current period ends"
          value={
            subscription
              ?.currentPeriodEnd
              ? formatUserDateTime(
                  subscription
                    .currentPeriodEnd,
                  preferences
                )
              : 'Not available'
          }
        />
      </div>

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">

        <p className="text-[10px] leading-5 text-blue-700 dark:text-blue-300">
          Subscription dates are displayed using your personal
          timezone and date/time format. The billing period
          itself remains an authoritative server-side
          subscription value.
        </p>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">

        <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

        <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
          SaMi subscriptions are charged per
          user, and AI allowances are also
          assigned per user. Final billable
          user counts, entitlement limits and
          payment totals remain server-side
          subscription data.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   PASSWORD FIELD
   ============================================================ */

function PasswordField({
  label,
  value,
  onChange,
  show,
  autoComplete,
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

  show:
    boolean;

  autoComplete:
    | 'current-password'
    | 'new-password';
}) {
  return (
    <div>

      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
        {label}
      </label>

      <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-blue-500">

        <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />

        <input
          type={
            show
              ? 'text'
              : 'password'
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
          maxLength={
            128
          }
          autoComplete={
            autoComplete
          }
          className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
      </div>
    </div>
  );
}

/* ============================================================
   PASSWORD RULE
   ============================================================ */

function PasswordRule({
  valid,
  label,
}: {
  valid:
    boolean;

  label:
    string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[9px] font-bold ${
        valid
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'bg-slate-50 text-slate-400 dark:bg-slate-950 dark:text-slate-500'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          valid
            ? 'bg-emerald-500 text-white'
            : 'border border-slate-300 dark:border-slate-700'
        }`}
      >
        {valid && (
          <Check className="h-2.5 w-2.5" />
        )}
      </span>

      {label}
    </div>
  );
}

/* ============================================================
   INFO CARD
   ============================================================ */

function InfoCard({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 p-4 dark:border-slate-800">

      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-words text-xs font-black text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */

function EmptyState({
  icon:
    Icon,
  title,
  description,
}: {
  icon:
    LucideIcon;

  title:
    string;

  description:
    string;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center">

      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Icon className="h-6 w-6" />
      </div>

      <h2 className="mt-4 text-sm font-black">
        {title}
      </h2>

      <p className="mt-1 max-w-md text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}