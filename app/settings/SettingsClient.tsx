'use client';

import {
  AppWindow,
  Bot,
  CreditCard,
  Loader2,
  Menu,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useSearchParams,
} from 'next/navigation';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';

import MyAccountSettings from './components/MyAccountSettings';
import WorkspaceSettings from './components/WorkspaceSettings';

import {
  DEFAULT_USER_DISPLAY_PREFERENCES,
  formatUserDateTime,
  resolveUserTheme,
  type UserDisplayPreferences,
  type UserTheme,
} from '@/lib/account/user-formatting';


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
  href?: string | null;
  description?: string | null;
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
  | 'account'
  | 'workspace'
  | 'apps'
  | 'ai'
  | 'billing';


type PreferencesResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  preferences?: UserDisplayPreferences;
};


const THEME_STORAGE_KEY =
  'sami_theme';


const VALID_SECTIONS =
  new Set<Section>([
    'account',
    'workspace',
    'apps',
    'ai',
    'billing',
  ]);


/* ============================================================
   HELPERS
   ============================================================ */

function formatLabel(
  value?: string | null,
) {
  if (!value) {
    return 'Not available';
  }

  return value
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase(),
    );
}


function normalizeStatus(
  value?: string | null,
) {
  return (
    value
      ?.trim()
      .toLowerCase() ||
    'unknown'
  );
}


function getSystemPrefersDark() {
  if (
    typeof window ===
    'undefined'
  ) {
    return false;
  }

  return (
    window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches ??
    false
  );
}


function applyThemeToDocument(
  theme: UserTheme,
) {
  const resolved =
    resolveUserTheme(
      theme,
      getSystemPrefersDark(),
    );

  const dark =
    resolved ===
    'dark';

  if (
    typeof document !==
    'undefined'
  ) {
    document.documentElement
      .classList.toggle(
        'dark',
        dark,
      );
  }

  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      theme,
    );
  } catch {
    // Optional local cache.
  }

  return dark;
}


async function readPreferencesResponse(
  response: Response,
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


function normalizeSection(
  value:
    string | null,
): Section {
  if (
    value ===
      'personal' ||
    value ===
      'security' ||
    value ===
      'sessions' ||
    value ===
      'account'
  ) {
    return 'account';
  }

  if (
    value &&
    VALID_SECTIONS.has(
      value as Section,
    )
  ) {
    return value as Section;
  }

  return 'account';
}


function getSectionLabel(
  section:
    Section,
) {
  switch (
    section
  ) {
    case 'account':
      return 'My Account';

    case 'workspace':
      return 'Workspace';

    case 'apps':
      return 'Apps';

    case 'ai':
      return 'SaMi AI';

    case 'billing':
      return 'Billing';

    default:
      return 'Settings';
  }
}


/* ============================================================
   CLIENT
   ============================================================ */

export default function SettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
}: Props) {
  const searchParams =
    useSearchParams();


  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );


  const [
    active,
    setActive,
  ] =
    useState<Section>(
      'account',
    );


  const [
    displayPreferences,
    setDisplayPreferences,
  ] =
    useState<UserDisplayPreferences>({
      ...DEFAULT_USER_DISPLAY_PREFERENCES,
    });


  const [
    darkMode,
    setDarkMode,
  ] =
    useState(
      false,
    );


  const [
    themeSaving,
    setThemeSaving,
  ] =
    useState(
      false,
    );


  const canAdminWorkspace =
    Boolean(
      membership?.isAdmin ||
      membership?.isOwner,
    );


  const hasWorkspaceAccess =
    Boolean(
      tenant &&
      membership,
    );


  const allowedSections =
    useMemo(
      () => {
        const sections =
          new Set<Section>([
            'account',
            'ai',
          ]);

        if (
          hasWorkspaceAccess
        ) {
          sections.add(
            'workspace',
          );
        }

        if (
          canAdminWorkspace
        ) {
          sections.add(
            'apps',
          );
        }

        if (
          membership?.isOwner
        ) {
          sections.add(
            'billing',
          );
        }

        return sections;
      },
      [
        canAdminWorkspace,
        hasWorkspaceAccess,
        membership?.isOwner,
      ],
    );


  /* ==========================================================
     ACTIVE SETTINGS SECTION
     ========================================================== */

  useEffect(
    () => {
      const requested =
        normalizeSection(
          searchParams.get(
            'tab',
          ),
        );

      if (
        allowedSections.has(
          requested,
        )
      ) {
        setActive(
          requested,
        );

        return;
      }

      setActive(
        'account',
      );
    },
    [
      searchParams,
      allowedSections,
    ],
  );


  /* ==========================================================
     INITIAL THEME
     ========================================================== */

  useEffect(
    () => {
      try {
        const stored =
          localStorage.getItem(
            THEME_STORAGE_KEY,
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

        setDarkMode(
          applyThemeToDocument(
            theme,
          ),
        );
      } catch {
        const dark =
          getSystemPrefersDark();

        setDarkMode(
          dark,
        );

        document.documentElement
          .classList.toggle(
            'dark',
            dark,
          );
      }
    },
    [],
  );


  /* ==========================================================
     LOAD PREFERENCES
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
              },
            );

          const data =
            await readPreferencesResponse(
              response,
            );

          if (
            cancelled ||
            !response.ok ||
            !data.success ||
            !data.preferences
          ) {
            return;
          }

          setDisplayPreferences(
            data.preferences,
          );

          setDarkMode(
            applyThemeToDocument(
              data.preferences
                .theme,
            ),
          );
        } catch {
          // Defaults remain usable.
        }
      }

      void loadPreferences();

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );


  /* ==========================================================
     SYSTEM THEME
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
          '(prefers-color-scheme: dark)',
        );

      const syncTheme =
        () => {
          setDarkMode(
            applyThemeToDocument(
              'system',
            ),
          );
        };

      media.addEventListener?.(
        'change',
        syncTheme,
      );

      return () => {
        media.removeEventListener?.(
          'change',
          syncTheme,
        );
      };
    },
    [
      displayPreferences.theme,
    ],
  );


  /* ==========================================================
     THEME TOGGLE
     ========================================================== */

  async function toggleTheme() {
    if (
      themeSaving
    ) {
      return;
    }

    const previous =
      displayPreferences;

    const nextTheme:
      UserTheme =
      darkMode
        ? 'light'
        : 'dark';

    const optimistic = {
      ...displayPreferences,
      theme:
        nextTheme,
    };

    setThemeSaving(
      true,
    );

    setDisplayPreferences(
      optimistic,
    );

    setDarkMode(
      applyThemeToDocument(
        nextTheme,
      ),
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
          },
        );

      const data =
        await readPreferencesResponse(
          response,
        );

      if (
        !response.ok ||
        !data.success ||
        !data.preferences
      ) {
        throw new Error(
          data.error ||
          'Theme could not be saved.',
        );
      }

      setDisplayPreferences(
        data.preferences,
      );

      setDarkMode(
        applyThemeToDocument(
          data.preferences
            .theme,
        ),
      );
    } catch {
      setDisplayPreferences(
        previous,
      );

      setDarkMode(
        applyThemeToDocument(
          previous.theme,
        ),
      );
    } finally {
      setThemeSaving(
        false,
      );
    }
  }


  const currentPlan =
    subscription?.planName ||
    (
      subscription?.planKey
        ? formatLabel(
            subscription.planKey,
          )
        : 'Free'
    );


  const pageLabel =
    getSectionLabel(
      active,
    );


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950 transition-colors dark:bg-[#070a10] dark:text-white">
      <div className="flex min-h-screen">
        <WorkspaceSidebar
          user={
            user
          }
          tenant={
            tenant
          }
          membership={
            membership
          }
          subscription={
            subscription
          }
          modules={
            modules
          }
          capabilities={{
            aiEnabled:
              true,

            filesEnabled:
              false,

            notificationsEnabled:
              false,
          }}
          unreadNotifications={
            0
          }
          open={
            sidebarOpen
          }
          onClose={
            () =>
              setSidebarOpen(
                false,
              )
          }
        />


        <div className="min-w-0 flex-1 lg:pl-[286px]">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/90 dark:bg-[#080b12]/88">
            <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button
                type="button"
                aria-label="Open navigation"
                onClick={
                  () =>
                    setSidebarOpen(
                      true,
                    )
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                  {pageLabel}
                </p>
              </div>


              <div className="ml-2 hidden min-w-0 border-l border-slate-200 pl-4 sm:block dark:border-slate-800">
                <p className="max-w-[260px] truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {tenant?.name ||
                    'SaMi Workspace'}
                </p>
              </div>


              <div className="ml-auto">
                <button
                  type="button"
                  onClick={
                    () =>
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
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  {themeSaving ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : darkMode ? (
                    <Sun className="h-[18px] w-[18px]" />
                  ) : (
                    <Moon className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </header>


          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {active ===
              'account' && (
              <MyAccountSettings />
            )}


            {active ===
              'workspace' &&
              hasWorkspaceAccess && (
                <WorkspaceSettings />
              )}


            {active ===
              'apps' &&
              canAdminWorkspace && (
                <SettingsSurface>
                  <AppsSection
                    modules={
                      modules
                    }
                  />
                </SettingsSurface>
              )}


            {active ===
              'ai' && (
              <SettingsSurface>
                <AiSection
                  planName={
                    currentPlan
                  }
                />
              </SettingsSurface>
            )}


            {active ===
              'billing' &&
              membership
                ?.isOwner && (
                <SettingsSurface>
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
                </SettingsSurface>
              )}
          </div>
        </div>
      </div>
    </main>
  );
}


/* ============================================================
   SURFACE
   ============================================================ */

function SettingsSurface({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-[#0d121b]">
      {children}
    </section>
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
      <div className="mb-4">
        <h2 className="text-sm font-black">
          Installed apps
        </h2>

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {modules.length}{' '}
          {modules.length ===
          1
            ? 'business app'
            : 'business apps'}
        </p>
      </div>


      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map(
          module => {
            const activeModule =
              normalizeStatus(
                module.status,
              ) ===
              'active';

            return (
              <div
                key={
                  module.key
                }
                className="rounded-[18px] border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <AppWindow className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-xs font-black">
                      {module.name}
                    </p>

                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-black ${
                        activeModule
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {formatLabel(
                        module.status,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          },
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
      <div className="rounded-[24px] border border-violet-200 bg-gradient-to-br from-blue-50 to-violet-50 p-6 dark:border-violet-900/60 dark:from-blue-950/25 dark:to-violet-950/25">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
            <Bot className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-black">
              SaMi AI
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Manage your SaMi AI workspace preferences and availability.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <InfoCard
          label="Current plan"
          value={
            planName
          }
        />
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
            <p className="text-xs font-black text-blue-600 dark:text-blue-400">
              Current subscription
            </p>

            <h2 className="mt-1 text-xl font-black">
              {currentPlan}
            </h2>
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
          value={formatLabel(
            subscription?.status,
          )}
        />

        <InfoCard
          label="Billing cycle"
          value={formatLabel(
            subscription
              ?.billingCycle,
          )}
        />

        <InfoCard
          label="Current period ends"
          value={
            subscription
              ?.currentPeriodEnd
              ? formatUserDateTime(
                  subscription
                    .currentPeriodEnd,
                  preferences,
                )
              : 'Not available'
          }
        />
      </div>
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
    <div className="rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-extrabold text-slate-900 dark:text-white">
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
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>

      <h2 className="mt-4 text-sm font-black">
        {title}
      </h2>

      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}