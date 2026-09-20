'use client';

import Link from 'next/link';

import {
  AppWindow,
  Bot,
  CreditCard,
  Loader2,
  Menu,
  Moon,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
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


/* ================================================================
   TYPES
   ================================================================ */

type UserData = {
  id:
    string;

  email:
    string;

  fullName:
    string;

  firstName:
    string;

  lastName:
    string;

  avatarFileId:
    string | null;
};


type TenantData =
  | {
      id:
        string;

      name:
        string;

      slug:
        string;

      status:
        string;
    }
  | null;


type MembershipData =
  | {
      accessLevel:
        | 'owner'
        | 'admin'
        | 'member';

      isOwner:
        boolean;

      isAdmin:
        boolean;

      label:
        string;
    }
  | null;


type SubscriptionData =
  | {
      status:
        string;

      billingCycle:
        string | null;

      currentPeriodEnd:
        string | null;

      planKey:
        string | null;

      planName:
        string | null;
    }
  | null;


type ModuleData = {
  key:
    string;

  name:
    string;

  status:
    string;

  href?:
    string | null;

  description?:
    string | null;
};


type SettingsCapabilities = {
  /*
   * Core personal platform capability.
   *
   * SaMi AI is controlled by workspace billing entitlement,
   * NOT ai.use / ai.manage role permissions.
   */
  aiAvailable:
    boolean;


  filesView:
    boolean;

  notificationsView:
    boolean;


  /*
   * Administration capabilities.
   */
  workspaceManage:
    boolean;

  appsManage:
    boolean;


  billingView:
    boolean;

  billingManage:
    boolean;
};


type Props = {
  user:
    UserData;

  tenant:
    TenantData;

  membership:
    MembershipData;

  subscription:
    SubscriptionData;

  accessibleModules:
    ModuleData[];

  managedModules:
    ModuleData[];

  capabilities:
    SettingsCapabilities;
};


type Section =
  | 'account'
  | 'workspace'
  | 'apps'
  | 'ai'
  | 'billing';


type PreferencesResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  preferences?:
    UserDisplayPreferences;
};


/* ================================================================
   CONSTANTS
   ================================================================ */

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


/* ================================================================
   HELPERS
   ================================================================ */

function formatLabel(
  value?:
    string | null,
) {
  if (
    !value
  ) {
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
        character
          .toUpperCase(),
    );
}


function normalizeStatus(
  value?:
    string | null,
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
  theme:
    UserTheme,
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
    document
      .documentElement
      .classList
      .toggle(
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
    // Local cache is optional.
  }


  return dark;
}


async function readPreferencesResponse(
  response:
    Response,
): Promise<PreferencesResponse> {
  try {
    return (
      await response.json()
    ) as PreferencesResponse;
  } catch {
    return {
      success:
        false,

      code:
        'INVALID_SERVER_RESPONSE',

      error:
        'SaMi returned an invalid response.',
    };
  }
}


/*
 * Personal profile, email, appearance/preferences, security and
 * sessions remain owned by MyAccountSettings.
 *
 * Old direct links therefore resolve back into My Account.
 */
function normalizeSection(
  value:
    string | null,
): Section {
  if (
    value ===
      'personal' ||
    value ===
      'account' ||
    value ===
      'preferences' ||
    value ===
      'appearance' ||
    value ===
      'security' ||
    value ===
      'sessions'
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


/* ================================================================
   CLIENT
   ================================================================ */

export default function SettingsClient({
  user,
  tenant,
  membership,
  subscription,
  accessibleModules,
  managedModules,
  capabilities,
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


  const hasWorkspaceAccess =
    Boolean(
      tenant &&
      membership,
    );


  /* ==============================================================
     ALLOWED SETTINGS

     PERSONAL:
       - My Account
       - SaMi AI when workspace billing entitlement allows it

     ADMINISTRATION:
       - Workspace
       - Apps
       - Billing

     SaMi AI is deliberately NOT an owner/admin-controlled setting.
     ============================================================== */

  const allowedSections =
    useMemo(
      () => {
        const sections =
          new Set<Section>([
            'account',
          ]);


        if (
          hasWorkspaceAccess &&
          capabilities
            .aiAvailable
        ) {
          sections.add(
            'ai',
          );
        }


        if (
          hasWorkspaceAccess &&
          capabilities
            .workspaceManage
        ) {
          sections.add(
            'workspace',
          );
        }


        if (
          capabilities
            .appsManage
        ) {
          sections.add(
            'apps',
          );
        }


        if (
          capabilities
            .billingView ||
          capabilities
            .billingManage
        ) {
          sections.add(
            'billing',
          );
        }


        return sections;
      },

      [
        hasWorkspaceAccess,
        capabilities,
      ],
    );


  /* ==============================================================
     ACTIVE SECTION
     ============================================================== */

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


      /*
       * Fail closed for protected administrative pages.
       */
      setActive(
        'account',
      );
    },

    [
      searchParams,
      allowedSections,
    ],
  );


  /* ==============================================================
     INITIAL THEME
     ============================================================== */

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


        document
          .documentElement
          .classList
          .toggle(
            'dark',
            dark,
          );
      }
    },

    [],
  );


  /* ==============================================================
     LOAD PERSONAL PREFERENCES
     ============================================================== */

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
          /*
           * Personal settings remain usable with defaults.
           */
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


  /* ==============================================================
     SYSTEM THEME
     ============================================================== */

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


  /* ==============================================================
     THEME TOGGLE
     ============================================================== */

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


  /* ==============================================================
     DISPLAY
     ============================================================== */

  const currentPlan =
    subscription
      ? (
          subscription.planName ||
          (
            subscription.planKey
              ? formatLabel(
                  subscription
                    .planKey,
                )
              : 'Subscription'
          )
        )
      : null;


  const pageLabel =
    getSectionLabel(
      active,
    );


  /* ==============================================================
     RENDER
     ============================================================== */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 transition-colors dark:bg-[#090B10] dark:text-white">

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

          /*
           * Already filtered server-side.
           */
          subscription={
            subscription
          }

          /*
           * Personal accessible apps only.
           *
           * NEVER managedModules.
           */
          modules={
            accessibleModules
          }

          capabilities={{
            /*
             * Compatibility prop only. WorkspaceSidebar now uses
             * navigation.aiAvailable as the canonical AI source.
             */
            aiEnabled:
              capabilities
                .aiAvailable,

            filesEnabled:
              capabilities
                .filesView,

            notificationsEnabled:
              capabilities
                .notificationsView,
          }}

          unreadNotifications={
            0
          }

          open={
            sidebarOpen
          }

          onClose={() =>
            setSidebarOpen(
              false,
            )
          }
        />


        <div className="min-w-0 flex-1 lg:pl-[286px]">

          {/* ====================================================
              HEADER
              ==================================================== */}

          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">

            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">

              <button
                type="button"
                aria-label="Open navigation"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">

                <p className="truncate text-sm font-bold">
                  {pageLabel}
                </p>

              </div>


              {tenant && (
                <div className="ml-2 hidden min-w-0 border-l border-slate-200 pl-4 sm:block dark:border-white/10">

                  <p className="max-w-[260px] truncate text-xs font-medium text-slate-400">
                    {tenant.name}
                  </p>

                </div>
              )}


              <div className="ml-auto">

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
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-white/10"
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


          {/* ====================================================
              SETTINGS CONTENT
              ==================================================== */}

          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">

            {/* PERSONAL ACCOUNT */}

            {active ===
              'account' && (
              <MyAccountSettings />
            )}


            {/* PERSONAL SaMi AI */}

            {active ===
              'ai' &&
              capabilities
                .aiAvailable && (
                <SettingsSurface>

                  <AiSection />

                </SettingsSurface>
              )}


            {/* WORKSPACE ADMINISTRATION */}

            {active ===
              'workspace' &&
              hasWorkspaceAccess &&
              capabilities
                .workspaceManage && (
                <WorkspaceSettings />
              )}


            {/* APPS ADMINISTRATION */}

            {active ===
              'apps' &&
              capabilities
                .appsManage && (
                <SettingsSurface>

                  <AppsSection
                    modules={
                      managedModules
                    }
                  />

                </SettingsSurface>
              )}


            {/* BILLING */}

            {active ===
              'billing' &&
              (
                capabilities
                  .billingView ||
                capabilities
                  .billingManage
              ) && (
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

                    canManage={
                      capabilities
                        .billingManage
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


/* ================================================================
   SETTINGS SURFACE
   ================================================================ */

function SettingsSurface({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/[0.035]">
      {children}
    </section>
  );
}


/* ================================================================
   APPS ADMINISTRATION
   ================================================================ */

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
        title="No installed applications"
        description="There are currently no active business applications available for workspace administration."
      />
    );
  }


  return (
    <div>

      <div className="mb-5">

        <div className="flex items-start justify-between gap-4">

          <div>

            <h2 className="text-sm font-bold">
              Workspace Apps
            </h2>

            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Installed business applications available to your Apps administration access.
            </p>

          </div>


          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
            {modules.length}
          </span>

        </div>

      </div>


      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

        {modules.map(
          module => {
            const activeModule =
              [
                'active',
                'installed',
                'enabled',
              ].includes(
                normalizeStatus(
                  module.status,
                ),
              );


            return (
              <div
                key={
                  module.key
                }
                className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
              >

                <div className="flex items-start gap-3">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <AppWindow className="h-[18px] w-[18px]" />
                  </div>


                  <div className="min-w-0 flex-1">

                    <p className="truncate text-xs font-bold">
                      {module.name}
                    </p>


                    <span
                      className={[
                        'mt-2 inline-flex rounded-md px-2 py-1 text-[9px] font-semibold',

                        activeModule
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400',
                      ].join(
                        ' ',
                      )}
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


/* ================================================================
   PERSONAL SaMi AI SETTINGS

   This is deliberately NOT an administration surface.

   The owner cannot grant/remove another user's core AI access.
   Billing entitlement controls availability.

   Category 18 will later own deeper AI preferences such as response
   style, confirmations, history and advanced AI behavior.
   ================================================================ */

function AiSection() {
  return (
    <div className="max-w-4xl">

      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6 dark:border-blue-900/50 dark:from-blue-950/20 dark:to-cyan-950/20">

        <div className="flex items-start gap-4">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
            <Sparkles className="h-5 w-5" />
          </div>


          <div className="min-w-0 flex-1">

            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
              Personal AI
            </p>

            <h2 className="mt-1 text-base font-bold">
              SaMi AI
            </h2>


            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              SaMi AI is part of your workspace experience whenever the workspace subscription includes AI. Your workspace owner does not separately grant or remove this personal access.
            </p>

          </div>

        </div>

      </div>


      <div className="mt-4 grid gap-3 sm:grid-cols-2">

        <AiInfoCard
          title="Permission-safe context"
          description="SaMi AI can only use applications, companies and records your normal account is already authorized to access."
        />


        <AiInfoCard
          title="Personal workspace"
          description="AI access follows your signed-in account inside the current workspace and company context."
        />


        <AiInfoCard
          title="Actions stay authorized"
          description="Using AI never bypasses normal SaMi permissions, company scope or record-level access rules."
        />


        <AiInfoCard
          title="Billing controls availability"
          description="If the workspace no longer has an AI entitlement, SaMi AI becomes unavailable to users in that workspace."
        />

      </div>


      <div className="mt-5">

        <Link
          href="/ai"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-xs font-semibold text-white transition hover:opacity-95"
        >
          <Bot className="h-4 w-4" />

          Open SaMi AI
        </Link>

      </div>

    </div>
  );
}


function AiInfoCard({
  title,
  description,
}: {
  title:
    string;

  description:
    string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">

      <p className="text-xs font-semibold">
        {title}
      </p>

      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>

    </div>
  );
}


/* ================================================================
   BILLING
   ================================================================ */

function BillingSection({
  subscription,
  currentPlan,
  preferences,
  canManage,
}: {
  subscription:
    SubscriptionData;

  currentPlan:
    string | null;

  preferences:
    UserDisplayPreferences;

  canManage:
    boolean;
}) {
  if (
    !subscription
  ) {
    return (
      <EmptyState
        icon={
          CreditCard
        }
        title="Billing information unavailable"
        description="Subscription information is not currently available for this workspace."
      />
    );
  }


  return (
    <div className="max-w-4xl">

      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">

        <div className="flex items-start gap-4">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <CreditCard className="h-5 w-5" />
          </div>


          <div>

            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Current subscription
            </p>

            <h2 className="mt-1 text-xl font-bold">
              {currentPlan ||
                'Subscription'}
            </h2>

            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {canManage
                ? 'You can manage workspace billing.'
                : 'You have read-only billing access.'}
            </p>

          </div>

        </div>

      </div>


      <div className="mt-5 grid gap-3 sm:grid-cols-2">

        <InfoCard
          label="Plan"
          value={
            currentPlan ||
            'Not available'
          }
        />


        <InfoCard
          label="Subscription status"
          value={
            formatLabel(
              subscription.status,
            )
          }
        />


        <InfoCard
          label="Billing cycle"
          value={
            formatLabel(
              subscription
                .billingCycle,
            )
          }
        />


        <InfoCard
          label="Current period ends"
          value={
            subscription
              .currentPeriodEnd
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


/* ================================================================
   INFO CARD
   ================================================================ */

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
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.025]">

      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-bold">
        {value}
      </p>

    </div>
  );
}


/* ================================================================
   EMPTY STATE
   ================================================================ */

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
    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>

      <h2 className="mt-4 text-sm font-bold">
        {title}
      </h2>

      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>

    </div>
  );
}
