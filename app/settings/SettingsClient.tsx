'use client';

import Link from 'next/link';

import {
  AppWindow,
  Bot,
  Building2,
  CreditCard,
  Factory,
  Loader2,
  Moon,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import MyAccountSettings from './components/MyAccountSettings';

import WorkspaceSettings from './components/WorkspaceSettings';

import OrganizationSettings from './components/OrganizationSettings';

import AppsSettings from './components/AppsSettings';

import AiSettings from './components/AiSettings';

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

  registryKey:
    string;

  name:
    string;

  status:
    string;

  href:
    string;

  description:
    string;

  iconKey:
    string;

  category:
    string;

  categoryLabel:
    string;

  order:
    number;

  recommended:
    boolean;

  keywords:
    string[];

  registered:
    boolean;
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

  organizationView:
    boolean;

  organizationManage:
    boolean;

  companiesView:
    boolean;

  companiesManage:
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
  | 'organization'
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
    'organization',
    'apps',
    'ai',
    'billing',
  ]);


const SETTINGS_NAVIGATION:
  Array<{
    key: Section;
    label: string;
    icon: LucideIcon;
  }> = [
    {
      key: 'account',
      label: 'My Account',
      icon: UserRound,
    },
    {
      key: 'ai',
      label: 'SaMi AI',
      icon: Bot,
    },
    {
      key: 'workspace',
      label: 'Workspace',
      icon: Building2,
    },
    {
      key: 'organization',
      label: 'Organization',
      icon: Factory,
    },
    {
      key: 'apps',
      label: 'Apps',
      icon: AppWindow,
    },
    {
      key: 'billing',
      label: 'Billing',
      icon: CreditCard,
    },
  ];


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

    case 'organization':
      return 'Organization';

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
  const router =
    useRouter();

  const searchParams =
    useSearchParams();


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


  const {
    overlay,
    closeOverlay,
    showError,
  } =
    useSaMiOverlay();


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
          hasWorkspaceAccess &&
          (
            capabilities
              .organizationView ||
            capabilities
              .organizationManage ||
            capabilities
              .companiesView ||
            capabilities
              .companiesManage
          )
        ) {
          sections.add(
            'organization',
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


      showError(
        'Theme update failed',
        'SaMi could not save your theme preference. Your previous theme has been restored.',
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


  function navigateSection(
    section: Section,
  ) {
    if (
      !allowedSections.has(
        section,
      )
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        searchParams.toString(),
      );

    params.set(
      'tab',
      section,
    );

    router.push(
      `/settings?${params.toString()}`,
      {
        scroll:
          false,
      },
    );
  }


  /* ==============================================================
     RENDER
     ============================================================== */

  return (
    <>
      <SaMiOverlay
        open={overlay.open}
        type={overlay.type}
        title={overlay.title}
        message={overlay.message}
        primaryAction={overlay.primaryAction}
        secondaryAction={overlay.secondaryAction}
        onClose={closeOverlay}
      />

      <WorkspaceShell
      user={user}
      tenant={tenant}
      membership={membership}
      subscription={subscription}
      modules={accessibleModules}
      sidebarCapabilities={{
        aiEnabled:
          capabilities.aiAvailable,
        filesEnabled:
          capabilities.filesView,
        notificationsEnabled:
          capabilities.notificationsView,
      }}
      title={pageLabel}
      description="Personal preferences and workspace administration, organized without mixing permissions or ownership."
      contextLabel={tenant?.name || null}
      actions={
        <button
          type="button"
          onClick={() =>
            void toggleTheme()
          }
          disabled={themeSaving}
          aria-label={
            darkMode
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-500 shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px hover:bg-[var(--sami-surface-soft)] disabled:opacity-60 dark:text-slate-300"
        >
          {themeSaving ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : darkMode ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>
      }
      contentClassName="max-w-[1500px]"
    >
      {allowedSections.size > 1 && (
        <nav
          aria-label="Settings sections"
          className="sami-surface mb-4 flex gap-1.5 overflow-x-auto rounded-2xl p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SETTINGS_NAVIGATION
            .filter(
              item =>
                allowedSections.has(
                  item.key,
                ),
            )
            .map(
              item => {
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
                      navigateSection(
                        item.key,
                      )
                    }
                    aria-current={
                      selected
                        ? 'page'
                        : undefined
                    }
                    className={
                      selected
                        ? item.key === 'ai'
                          ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/15'
                          : 'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-3.5 text-xs font-semibold text-white shadow-sm dark:bg-white dark:text-slate-950'
                        : 'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold text-slate-500 transition hover:bg-[var(--sami-surface-soft)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              },
            )}
        </nav>
      )}

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

                  <AiSettings />

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


            {/* ORGANIZATION / COMPANY PROFILE */}

            {active ===
              'organization' &&
              hasWorkspaceAccess &&
              (
                capabilities
                  .organizationView ||
                capabilities
                  .organizationManage ||
                capabilities
                  .companiesView ||
                capabilities
                  .companiesManage
              ) && (
                <OrganizationSettings />
              )}


            {/* APPS ADMINISTRATION */}

            {active ===
              'apps' &&
              capabilities
                .appsManage && (
                <SettingsSurface>

                  <AppsSettings
                    workspaceModules={
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


      </WorkspaceShell>
    </>
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
    <section className="sami-surface min-w-0 rounded-[24px] p-4 sm:p-6">
      {children}
    </section>
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
