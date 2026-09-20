'use client';

import Link from 'next/link';

import {
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  AppWindow,
  Bell,
  Bot,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Folder,
  Home,
  LayoutGrid,
  Loader2,
  Settings,
  ShieldCheck,
  Star,
  Store,
  User,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import SaMiLogo from '@/app/components/SaMiLogo';

import UserAvatar from '@/app/components/account/UserAvatar';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

import {
  getSaMiAppIcon,
} from '@/lib/apps/icon-registry';


/* ================================================================
   ACCOUNT TYPES
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

      planKey:
        string | null;

      planName:
        string | null;
    }
  | null;


type ModuleData = {
  key:
    string;

  registryKey?:
    string;

  name:
    string;

  status:
    string;

  href?:
    string | null;

  description?:
    string | null;

  iconKey?:
    string | null;

  category?:
    string | null;

  categoryLabel?:
    string | null;

  order?:
    number | null;

  recommended?:
    boolean;

  keywords?:
    string[];

  registered?:
    boolean;
};


/* ================================================================
   WORKSPACE TYPES
   ================================================================ */

type WorkspaceListItem = {
  id:
    string;

  name:
    string;

  slug:
    string;

  status:
    string;

  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';

  isOwner:
    boolean;

  isAdmin:
    boolean;
};


type CurrentAccountResponse = {
  success?:
    boolean;

  authenticated?:
    boolean;

  code?:
    string;

  error?:
    string;

  currentWorkspaceId?:
    string | null;

  workspaces?:
    WorkspaceListItem[];
};


type WorkspaceActionResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  currentWorkspaceId?:
    string | null;
};


/* ================================================================
   COMPANY TYPES
   ================================================================ */

type CompanySelectorCompany = {
  id:
    string;

  name:
    string;

  legalName:
    string | null;

  logoUrl:
    string | null;

  currency:
    string;

  timezone:
    string;

  country:
    string | null;

  isCurrent:
    boolean;

  isDefault:
    boolean;

  isSelected:
    boolean;
};


type CompanySelectorState = {
  currentCompanyId:
    string;

  defaultCompanyId:
    string;

  selectedCompanyIds:
    string[];

  companies:
    CompanySelectorCompany[];
};


type CompanyContextResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  selector?:
    CompanySelectorState;
};


/* ================================================================
   NAVIGATION PERMISSIONS / ENTITLEMENTS
   ================================================================ */

type NavigationPermissionState = {
  apps?:
    ModuleData[];

  appCount?:
    number;


  /*
   * Core platform entitlement.
   *
   * Unlike normal fields below, this is NOT a role permission.
   */
  aiAvailable:
    boolean;


  workspaceView:
    boolean;

  workspaceManage:
    boolean;


  usersView:
    boolean;

  usersManage:
    boolean;


  rolesView:
    boolean;

  rolesManage:
    boolean;


  invitationsView:
    boolean;

  invitationsManage:
    boolean;


  organizationView:
    boolean;

  organizationManage:
    boolean;


  companiesView:
    boolean;

  companiesManage:
    boolean;


  appsView:
    boolean;

  appsManage:
    boolean;


  filesView:
    boolean;

  notificationsView:
    boolean;


  /*
   * Deprecated compatibility aliases returned temporarily by
   * /api/workspace/navigation while the old AI permission model is
   * retired from dependent code.
   */
  aiUse?:
    boolean;

  aiManage?:
    boolean;


  billingView:
    boolean;

  billingManage:
    boolean;


  settingsView:
    boolean;

  settingsManage:
    boolean;
};


type NavigationPermissionResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  navigation?:
    NavigationPermissionState;
};


/* ================================================================
   COMPONENT TYPES
   ================================================================ */

type Capabilities = {
  /*
   * Legacy compatibility prop.
   *
   * AI availability is now resolved from navigation.aiAvailable.
   */
  aiEnabled?:
    boolean;

  filesEnabled?:
    boolean;

  notificationsEnabled?:
    boolean;
};


type Props = {
  user:
    UserData;

  tenant:
    TenantData;

  membership:
    MembershipData;

  /*
   * Must already be null when the current user does not have
   * billing visibility.
   */
  subscription:
    SubscriptionData;

  /*
   * IMPORTANT:
   *
   * This must contain the CURRENT USER'S accessible applications,
   * not every app installed in the workspace.
   */
  modules:
    ModuleData[];

  capabilities?:
    Capabilities;

  unreadNotifications?:
    number;

  open:
    boolean;

  onClose:
    () => void;
};


/* ================================================================
   NAVIGATION TYPES
   ================================================================ */

type SettingsKey =
  | 'account'
  | 'workspace'
  | 'organization'
  | 'users'
  | 'roles'
  | 'apps'
  | 'ai'
  | 'billing';


type SettingsChild = {
  key:
    SettingsKey;

  label:
    string;

  href:
    string;

  icon:
    LucideIcon;
};


type AppChild = {
  key:
    string;

  label:
    string;

  href:
    string;

  icon:
    LucideIcon;
};


type OverlayState = {
  open:
    boolean;

  type:
    SaMiOverlayType;

  title:
    string;

  message:
    string;
};


/* ================================================================
   CONSTANTS
   ================================================================ */

const SIDEBAR_APP_LIMIT =
  6;


const CLOSED_OVERLAY:
  OverlayState = {
  open:
    false,

  type:
    'info',

  title:
    '',

  message:
    '',
};


function hrefPath(
  href:
    string,
) {
  return (
    href.split(
      '?',
    )[0] ||
    href
  );
}


function getInitials(
  user:
    UserData,
) {
  const first =
    user.firstName
      ?.trim()
      .charAt(
        0,
      );


  const last =
    user.lastName
      ?.trim()
      .charAt(
        0,
      );


  const combined =
    `${first || ''}${last || ''}`
      .trim();


  if (
    combined
  ) {
    return combined
      .toUpperCase();
  }


  if (
    user.fullName
      ?.trim()
  ) {
    return user.fullName
      .trim()
      .split(
        /\s+/,
      )
      .slice(
        0,
        2,
      )
      .map(
        part =>
          part.charAt(
            0,
          ),
      )
      .join(
        '',
      )
      .toUpperCase();
  }


  return (
    user.email
      .charAt(
        0,
      )
      .toUpperCase() ||
    'S'
  );
}


function getDisplayName(
  user:
    UserData,
) {
  return (
    user.fullName
      ?.trim() ||
    `${user.firstName || ''} ${user.lastName || ''}`
      .trim() ||
    user.email
  );
}


/* ================================================================
   RESPONSE READERS
   ================================================================ */

async function readAccountResponse(
  response:
    Response,
): Promise<CurrentAccountResponse> {
  try {
    return (
      await response.json()
    ) as CurrentAccountResponse;
  } catch {
    return {
      success:
        false,

      error:
        'SaMi returned an invalid response.',
    };
  }
}


async function readWorkspaceActionResponse(
  response:
    Response,
): Promise<WorkspaceActionResponse> {
  try {
    return (
      await response.json()
    ) as WorkspaceActionResponse;
  } catch {
    return {
      success:
        false,

      error:
        'SaMi returned an invalid response.',
    };
  }
}


async function readCompanyContextResponse(
  response:
    Response,
): Promise<CompanyContextResponse> {
  try {
    return (
      await response.json()
    ) as CompanyContextResponse;
  } catch {
    return {
      success:
        false,

      error:
        'SaMi returned an invalid company-context response.',
    };
  }
}


async function readNavigationPermissionResponse(
  response:
    Response,
): Promise<NavigationPermissionResponse> {
  try {
    return (
      await response.json()
    ) as NavigationPermissionResponse;
  } catch {
    return {
      success:
        false,

      error:
        'SaMi returned an invalid navigation response.',
    };
  }
}


/* ================================================================
   SIDEBAR
   ================================================================ */

export default function WorkspaceSidebar({
  user,
  tenant,
  membership,
  subscription,
  modules,
  capabilities,
  unreadNotifications =
    0,
  open,
  onClose,
}: Props) {
  const pathname =
    usePathname();


  const router =
    useRouter();


  const searchParams =
    useSearchParams();


  /* ============================================================
     WORKSPACE
     ============================================================ */

  const [
    workspaces,
    setWorkspaces,
  ] =
    useState<
      WorkspaceListItem[]
    >([]);


  const [
    currentWorkspaceId,
    setCurrentWorkspaceId,
  ] =
    useState<
      string | null
    >(
      tenant?.id ||
      null,
    );


  const [
    workspaceMenuOpen,
    setWorkspaceMenuOpen,
  ] =
    useState(
      false,
    );


  const [
    workspacesLoading,
    setWorkspacesLoading,
  ] =
    useState(
      true,
    );


  const [
    switchingWorkspaceId,
    setSwitchingWorkspaceId,
  ] =
    useState<
      string | null
    >(
      null,
    );


  /* ============================================================
     COMPANY CONTEXT
     ============================================================ */

  const [
    companySelector,
    setCompanySelector,
  ] =
    useState<
      CompanySelectorState | null
    >(
      null,
    );


  const [
    companyMenuOpen,
    setCompanyMenuOpen,
  ] =
    useState(
      false,
    );


  const [
    companyLoading,
    setCompanyLoading,
  ] =
    useState(
      false,
    );


  const [
    companyAction,
    setCompanyAction,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    companyError,
    setCompanyError,
  ] =
    useState<
      string | null
    >(
      null,
    );


  /* ============================================================
     NAVIGATION AUTHORIZATION / ENTITLEMENTS
     ============================================================ */

  const [
    navigationPermissions,
    setNavigationPermissions,
  ] =
    useState<
      NavigationPermissionState | null
    >(
      null,
    );


  const [
    navigationApps,
    setNavigationApps,
  ] =
    useState<
      ModuleData[]
    >(
      modules,
    );


  const [
    navigationLoading,
    setNavigationLoading,
  ] =
    useState(
      true,
    );


  /* ============================================================
     GENERAL UI
     ============================================================ */

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>(
      CLOSED_OVERLAY,
    );


  /* ============================================================
     ACCESSIBLE APPS

     The server already filtered these apps by installation +
     effective user permissions and enriched them from the canonical
     Category 12 registry. The client only renders that model.
     ============================================================ */

  useEffect(
    () => {
      setNavigationApps(
        modules,
      );
    },
    [
      modules,
    ],
  );


  const accessibleApps =
    navigationApps;


  const appChildren =
    useMemo<AppChild[]>(
      () =>
        [
          ...accessibleApps,
        ]
          .sort(
            (
              left,
              right,
            ) =>
              (
                left.order ??
                10_000
              ) -
                (
                  right.order ??
                  10_000
                ) ||
              left.name.localeCompare(
                right.name,
              ),
          )
          .map(
            module => ({
              key:
                module.key,

              label:
                module.name,

              href:
                module.href ||
                `/apps/${encodeURIComponent(
                  module.registryKey ||
                  module.key,
                )}`,

              icon:
                getSaMiAppIcon(
                  module.iconKey,
                ),
            }),
          ),

      [
        accessibleApps,
      ],
    );


  const sidebarAppChildren =
    useMemo(
      () => {
        if (
          appChildren.length <=
          SIDEBAR_APP_LIMIT
        ) {
          return appChildren;
        }

        const active =
          appChildren.find(
            item => {
              const path =
                hrefPath(
                  item.href,
                );

              return (
                pathname ===
                  path ||
                pathname.startsWith(
                  `${path}/`,
                )
              );
            },
          );

        const first =
          appChildren.slice(
            0,
            SIDEBAR_APP_LIMIT,
          );

        if (
          !active ||
          first.some(
            item =>
              item.key ===
              active.key,
          )
        ) {
          return first;
        }

        return [
          ...first.slice(
            0,
            SIDEBAR_APP_LIMIT -
              1,
          ),
          active,
        ];
      },
      [
        appChildren,
        pathname,
      ],
    );


  /* ============================================================
     NORMAL WORKSPACE CAPABILITIES
     ============================================================ */

  /*
   * SaMi AI is now a core billing entitlement.
   *
   * Do NOT gate this with ai.use or ai.manage.
   */
  const canUseAi =
    navigationPermissions
      ?.aiAvailable ===
      true;


  const canUseFiles =
    capabilities
      ?.filesEnabled ===
      true &&
    navigationPermissions
      ?.filesView ===
      true;


  const canUseNotifications =
    capabilities
      ?.notificationsEnabled ===
      true &&
    navigationPermissions
      ?.notificationsView ===
      true;


  /* ============================================================
     ADMINISTRATIVE SETTINGS

     IMPORTANT:

     Using a feature does NOT grant access to its administration.

       workspace.view != workspace.manage
       module access   != apps.manage

     SaMi AI is intentionally absent here because AI settings are
     personal and entitlement-driven.
     ============================================================ */

  const adminSettingsChildren =
    useMemo<
      SettingsChild[]
    >(
      () => {
        if (
          !navigationPermissions
        ) {
          return [];
        }


        const items:
          SettingsChild[] =
          [];


        if (
          navigationPermissions
            .workspaceManage
        ) {
          items.push({
            key:
              'workspace',

            label:
              'Workspace',

            href:
              '/settings?tab=workspace',

            icon:
              Building2,
          });
        }


        if (
          navigationPermissions
            .organizationView ||
          navigationPermissions
            .organizationManage ||
          navigationPermissions
            .companiesView ||
          navigationPermissions
            .companiesManage
        ) {
          items.push({
            key:
              'organization',

            label:
              'Organization',

            href:
              '/settings?tab=organization',

            icon:
              Store,
          });
        }


        /*
         * Unified employee/member/invitation management surface.
         */
        if (
          navigationPermissions
            .usersView ||
          navigationPermissions
            .invitationsView
        ) {
          items.push({
            key:
              'users',

            label:
              'People & Access',

            href:
              '/settings/users',

            icon:
              UsersRound,
          });
        }


        if (
          navigationPermissions
            .rolesView
        ) {
          items.push({
            key:
              'roles',

            label:
              'Roles & Permissions',

            href:
              '/settings/roles',

            icon:
              ShieldCheck,
          });
        }


        if (
          navigationPermissions
            .appsManage
        ) {
          items.push({
            key:
              'apps',

            label:
              'Apps',

            href:
              '/settings?tab=apps',

            icon:
              AppWindow,
          });
        }


        if (
          navigationPermissions
            .billingView ||
          navigationPermissions
            .billingManage
        ) {
          items.push({
            key:
              'billing',

            label:
              'Billing',

            href:
              '/settings?tab=billing',

            icon:
              CreditCard,
          });
        }


        return items;
      },

      [
        navigationPermissions,
      ],
    );


  /* ============================================================
     ACTIVE ROUTES
     ============================================================ */

  const appRouteActive =
    pathname ===
      '/apps' ||
    pathname.startsWith(
      '/apps/',
    ) ||
    appChildren.some(
      item => {
        const path =
          hrefPath(
            item.href,
          );


        return (
          pathname ===
            path ||
          pathname.startsWith(
            `${path}/`,
          )
        );
      },
    );


  const settingsRouteActive =
    pathname ===
      '/settings' ||
    pathname.startsWith(
      '/settings/',
    );


  const coreRouteActive =
    pathname ===
      '/files' ||
    pathname.startsWith(
      '/files/',
    ) ||
    pathname ===
      '/notifications' ||
    pathname.startsWith(
      '/notifications/',
    );


  const [
    coreExpanded,
    setCoreExpanded,
  ] =
    useState(
      coreRouteActive,
    );


  const [
    settingsExpanded,
    setSettingsExpanded,
  ] =
    useState(
      settingsRouteActive,
    );


  /* ============================================================
     CURRENT COMPANY
     ============================================================ */

  const currentCompany =
    useMemo(
      () =>
        companySelector
          ?.companies
          .find(
            company =>
              company.id ===
              companySelector
                .currentCompanyId,
          ) ||
        null,

      [
        companySelector,
      ],
    );


  /* ============================================================
     SETTINGS ACTIVE
     ============================================================ */

  function isSettingsChildActive(
    item:
      SettingsChild,
  ) {
    if (
      item.key ===
        'users' ||
      item.key ===
        'roles'
    ) {
      const path =
        hrefPath(
          item.href,
        );


      return (
        pathname ===
          path ||
        pathname.startsWith(
          `${path}/`,
        )
      );
    }


    if (
      item.key ===
      'account'
    ) {
      return (
        pathname ===
        '/settings'
      );
    }


    return (
      pathname ===
        '/settings' &&
      searchParams.get(
        'tab',
      ) ===
        item.key
    );
  }


  /* ============================================================
     LOAD WORKSPACES
     ============================================================ */

  const loadWorkspaces =
    useCallback(
      async () => {
        setWorkspacesLoading(
          true,
        );


        try {
          const response =
            await fetch(
              '/api/auth/me',
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
            await readAccountResponse(
              response,
            );


          if (
            !response.ok ||
            !data.success
          ) {
            return;
          }


          setWorkspaces(
            Array.isArray(
              data.workspaces,
            )
              ? data.workspaces
              : [],
          );


          setCurrentWorkspaceId(
            data.currentWorkspaceId ||
            tenant?.id ||
            null,
          );
        } catch {
          /*
           * The currently rendered workspace remains usable.
           */
        } finally {
          setWorkspacesLoading(
            false,
          );
        }
      },

      [
        tenant?.id,
      ],
    );


  /* ============================================================
     LOAD COMPANY CONTEXT
     ============================================================ */

  const loadCompanyContext =
    useCallback(
      async () => {
        if (
          !tenant?.id ||
          !membership
        ) {
          setCompanySelector(
            null,
          );

          setCompanyError(
            null,
          );

          return;
        }


        setCompanyLoading(
          true,
        );


        setCompanyError(
          null,
        );


        try {
          const response =
            await fetch(
              '/api/workspace/company-context',
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
            await readCompanyContextResponse(
              response,
            );


          if (
            !response.ok ||
            !data.success ||
            !data.selector
          ) {
            throw new Error(
              data.error ||
              'Company context could not be loaded.',
            );
          }


          setCompanySelector(
            data.selector,
          );
        } catch (
          error
        ) {
          setCompanySelector(
            null,
          );


          setCompanyError(
            error instanceof
              Error
              ? error.message
              : 'Company context could not be loaded.',
          );
        } finally {
          setCompanyLoading(
            false,
          );
        }
      },

      [
        tenant?.id,
        membership,
      ],
    );


  /* ============================================================
     LOAD NAVIGATION PERMISSIONS / ENTITLEMENTS
     ============================================================ */

  const loadNavigationPermissions =
    useCallback(
      async () => {
        if (
          !tenant?.id ||
          !membership
        ) {
          setNavigationPermissions(
            null,
          );


          setNavigationLoading(
            false,
          );


          return;
        }


        setNavigationLoading(
          true,
        );


        try {
          const response =
            await fetch(
              '/api/workspace/navigation',
              {
                method:
                  'GET',

                credentials:
                  'same-origin',

                cache:
                  'no-store',

                headers: {
                  Accept:
                    'application/json',
                },
              },
            );


          const data =
            await readNavigationPermissionResponse(
              response,
            );


          if (
            !response.ok ||
            !data.success ||
            !data.navigation
          ) {
            /*
             * Fail closed.
             */
            setNavigationPermissions(
              null,
            );


            return;
          }


          setNavigationPermissions(
            data.navigation,
          );


          setNavigationApps(
            Array.isArray(
              data.navigation
                .apps,
            )
              ? data.navigation
                  .apps
              : [],
          );
        } catch {
          setNavigationPermissions(
            null,
          );
        } finally {
          setNavigationLoading(
            false,
          );
        }
      },

      [
        tenant?.id,
        membership,
      ],
    );


  /* ============================================================
     INITIAL LOAD
     ============================================================ */

  useEffect(
    () => {
      void loadWorkspaces();
    },

    [
      loadWorkspaces,
    ],
  );


  useEffect(
    () => {
      void loadCompanyContext();
    },

    [
      loadCompanyContext,
    ],
  );


  useEffect(
    () => {
      void loadNavigationPermissions();
    },

    [
      loadNavigationPermissions,
    ],
  );


  useEffect(
    () => {
      setCurrentWorkspaceId(
        tenant?.id ||
        null,
      );


      setWorkspaceMenuOpen(
        false,
      );


      setCompanyMenuOpen(
        false,
      );
    },

    [
      tenant?.id,
    ],
  );


  /* ============================================================
     EXPANSION
     ============================================================ */

  useEffect(
    () => {
      if (
        coreRouteActive
      ) {
        setCoreExpanded(
          true,
        );
      }
    },

    [
      coreRouteActive,
    ],
  );


  useEffect(
    () => {
      if (
        settingsRouteActive
      ) {
        setSettingsExpanded(
          true,
        );
      }
    },

    [
      settingsRouteActive,
    ],
  );


  /* ============================================================
     MOBILE CLOSE
     ============================================================ */

  const searchString =
    searchParams.toString();


  useEffect(
    () => {
      if (
        open
      ) {
        onClose();
      }

      // eslint-disable-next-line react-hooks/exhaustive-deps
    },

    [
      pathname,
      searchString,
    ],
  );


  /* ============================================================
     SWITCH WORKSPACE
     ============================================================ */

  async function switchWorkspace(
    workspace:
      WorkspaceListItem,
  ) {
    if (
      switchingWorkspaceId ||
      workspace.id ===
        currentWorkspaceId
    ) {
      setWorkspaceMenuOpen(
        false,
      );


      return;
    }


    setSwitchingWorkspaceId(
      workspace.id,
    );


    setCompanyMenuOpen(
      false,
    );


    /*
     * Remove previous workspace permissions/entitlements immediately.
     */
    setNavigationPermissions(
      null,
    );


    setNavigationApps(
      [],
    );


    try {
      const response =
        await fetch(
          '/api/workspace',
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
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                action:
                  'switch_workspace',

                tenantId:
                  workspace.id,
              }),
          },
        );


      const data =
        await readWorkspaceActionResponse(
          response,
        );


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'The workspace could not be selected.',
        );
      }


      setCurrentWorkspaceId(
        workspace.id,
      );


      /*
       * Company IDs belong to the old tenant context.
       */
      setCompanySelector(
        null,
      );


      setCompanyError(
        null,
      );


      setWorkspaceMenuOpen(
        false,
      );


      router.refresh();


      setOverlay({
        open:
          true,

        type:
          'success',

        title:
          'Workspace changed',

        message:
          data.message ||
          `Switched to ${workspace.name}.`,
      });
    } catch (
      error
    ) {
      /*
       * Restore the still-current workspace immediately. The server
       * rendered module list remains trusted for this tenant even if
       * the capability refresh itself is temporarily unavailable.
       */
      setNavigationApps(
        modules,
      );


      void loadNavigationPermissions();


      setOverlay({
        open:
          true,

        type:
          'error',

        title:
          'Workspace switch failed',

        message:
          error instanceof
            Error
            ? error.message
            : 'The workspace could not be selected.',
      });
    } finally {
      setSwitchingWorkspaceId(
        null,
      );
    }
  }


  /* ============================================================
     UPDATE COMPANY CONTEXT
     ============================================================ */

  async function updateCompanyContext(
    body:
      Record<
        string,
        unknown
      >,

    actionKey:
      string,
  ) {
    if (
      companyAction
    ) {
      return;
    }


    setCompanyAction(
      actionKey,
    );


    setCompanyError(
      null,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/company-context',
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
              JSON.stringify(
                body,
              ),
          },
        );


      const data =
        await readCompanyContextResponse(
          response,
        );


      if (
        !response.ok ||
        !data.success ||
        !data.selector
      ) {
        throw new Error(
          data.error ||
          'Company context could not be updated.',
        );
      }


      setCompanySelector(
        data.selector,
      );


      router.refresh();
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : 'Company context could not be updated.';


      setCompanyError(
        message,
      );


      setOverlay({
        open:
          true,

        type:
          'error',

        title:
          'Company update failed',

        message,
      });
    } finally {
      setCompanyAction(
        null,
      );
    }
  }


  /* ============================================================
     CURRENT COMPANY
     ============================================================ */

  async function switchCurrentCompany(
    company:
      CompanySelectorCompany,
  ) {
    if (
      company.isCurrent
    ) {
      return;
    }


    await updateCompanyContext(
      {
        action:
          'set_current',

        companyId:
          company.id,
      },

      `current:${company.id}`,
    );
  }


  /* ============================================================
     SELECTED COMPANIES
     ============================================================ */

  async function toggleSelectedCompany(
    company:
      CompanySelectorCompany,
  ) {
    if (
      !companySelector
    ) {
      return;
    }


    let nextCompanyIds = [
      ...companySelector
        .selectedCompanyIds,
    ];


    if (
      company.isSelected
    ) {
      nextCompanyIds =
        nextCompanyIds.filter(
          id =>
            id !==
            company.id,
        );
    } else {
      nextCompanyIds.push(
        company.id,
      );
    }


    nextCompanyIds = [
      ...new Set(
        nextCompanyIds,
      ),
    ];


    if (
      nextCompanyIds.length ===
        0
    ) {
      setOverlay({
        open:
          true,

        type:
          'warning',

        title:
          'One company is required',

        message:
          'At least one company must remain selected in your working context.',
      });


      return;
    }


    await updateCompanyContext(
      {
        action:
          'set_selected',

        companyIds:
          nextCompanyIds,
      },

      `selected:${company.id}`,
    );
  }


  /* ============================================================
     DEFAULT COMPANY
     ============================================================ */

  async function makeDefaultCompany(
    company:
      CompanySelectorCompany,
  ) {
    if (
      company.isDefault
    ) {
      return;
    }


    await updateCompanyContext(
      {
        action:
          'set_default',

        companyId:
          company.id,
      },

      `default:${company.id}`,
    );
  }


  /* ============================================================
     DISPLAY
     ============================================================ */

  const displayName =
    getDisplayName(
      user,
    );


  const avatarInitials =
    getInitials(
      user,
    );


  /*
   * Never invent a "Free" plan when subscription data was
   * intentionally withheld by authorization.
   */
  const planName =
    subscription
      ? (
          subscription.planName ||
          subscription.planKey ||
          'Subscription'
        )
      : null;


  /*
   * Display only.
   *
   * This label NEVER controls authorization.
   */
  const roleName =
    membership?.label ||
    membership
      ?.accessLevel ||
    'Member';


  const hasMultipleWorkspaces =
    workspaces.length >
    1;


  const selectedCompanyCount =
    companySelector
      ?.selectedCompanyIds
      .length ||
    0;


  const companyCount =
    companySelector
      ?.companies
      .length ||
    0;


  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <>
      {/* MOBILE BACKDROP */}

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={
            onClose
          }
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
        />
      )}


      {/* SIDEBAR */}

      <aside
        aria-label="Workspace navigation"
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-[#090d15] lg:translate-x-0',

          open
            ? 'translate-x-0'
            : '-translate-x-full',
        ].join(
          ' ',
        )}
      >

        {/* LOGO */}

        <div className="flex h-[76px] shrink-0 items-center border-b border-slate-100 px-5 dark:border-slate-800">

          <Link
            href="/dashboard"
            onClick={
              onClose
            }
            className="min-w-0 flex-1"
          >
            <SaMiLogo
              size="sm"
              className="max-w-full"
            />
          </Link>


          <button
            type="button"
            aria-label="Close navigation"
            onClick={
              onClose
            }
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>

        </div>


        {/* ======================================================
            WORKSPACE SELECTOR
            ====================================================== */}

        <div className="relative px-4 pt-4">

          <button
            type="button"
            disabled={
              workspacesLoading ||
              !hasMultipleWorkspaces
            }
            aria-expanded={
              workspaceMenuOpen
            }
            onClick={() => {
              if (
                hasMultipleWorkspaces
              ) {
                setCompanyMenuOpen(
                  false,
                );


                setWorkspaceMenuOpen(
                  current =>
                    !current,
                );
              }
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left transition enabled:hover:bg-slate-100 disabled:cursor-default dark:bg-slate-900 dark:enabled:hover:bg-slate-800"
          >

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-xs font-black text-white">
              {tenant?.name
                ?.trim()
                .charAt(
                  0,
                )
                .toUpperCase() ||
                'S'}
            </div>


            <div className="min-w-0 flex-1">

              <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                {tenant?.name ||
                  'SaMi Workspace'}
              </p>


              <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                {roleName}

                {planName && (
                  <>
                    {' · '}
                    {planName}
                  </>
                )}
              </p>

            </div>


            {workspacesLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : hasMultipleWorkspaces ? (
              <ChevronDown
                className={[
                  'h-4 w-4 shrink-0 text-slate-400 transition-transform',

                  workspaceMenuOpen
                    ? 'rotate-180'
                    : '',
                ].join(
                  ' ',
                )}
              />
            ) : null}

          </button>


          {workspaceMenuOpen &&
            hasMultipleWorkspaces && (
              <div className="absolute left-4 right-4 top-[72px] z-[90] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">

                <p className="px-2 pb-2 pt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Switch workspace
                </p>


                <div className="max-h-[260px] space-y-1 overflow-y-auto">

                  {workspaces.map(
                    workspace => {
                      const selected =
                        workspace.id ===
                        currentWorkspaceId;


                      const switching =
                        switchingWorkspaceId ===
                        workspace.id;


                      return (
                        <button
                          key={
                            workspace.id
                          }
                          type="button"
                          disabled={
                            switchingWorkspaceId !==
                            null
                          }
                          onClick={() =>
                            void switchWorkspace(
                              workspace,
                            )
                          }
                          className={[
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-wait',

                            selected
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                          ].join(
                            ' ',
                          )}
                        >

                          <div
                            className={[
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-black',

                              selected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                            ].join(
                              ' ',
                            )}
                          >
                            {workspace.name
                              .trim()
                              .charAt(
                                0,
                              )
                              .toUpperCase() ||
                              'S'}
                          </div>


                          <div className="min-w-0 flex-1">

                            <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                              {workspace.name}
                            </p>

                            <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
                              {workspace.accessLevel ===
                                'owner'
                                ? 'Workspace Owner'
                                : workspace.accessLevel ===
                                    'admin'
                                  ? 'Workspace Admin'
                                  : 'Workspace Member'}
                            </p>

                          </div>


                          {switching ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                          ) : selected ? (
                            <Check className="h-4 w-4 shrink-0 text-blue-600" />
                          ) : null}

                        </button>
                      );
                    },
                  )}

                </div>

              </div>
            )}

        </div>


        {/* ======================================================
            COMPANY SELECTOR
            ====================================================== */}

        <div className="relative border-b border-slate-100 px-4 pb-4 pt-2 dark:border-slate-800">

          <button
            type="button"
            onClick={() => {
              setWorkspaceMenuOpen(
                false,
              );


              if (
                companySelector &&
                companySelector
                  .companies
                  .length >
                  1
              ) {
                setCompanyMenuOpen(
                  current =>
                    !current,
                );
              }
            }}
            disabled={
              companyLoading ||
              (
                !companySelector &&
                !companyError
              ) ||
              (
                companySelector !==
                  null &&
                companySelector
                  .companies
                  .length <=
                  1
              )
            }
            aria-expanded={
              companyMenuOpen
            }
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition enabled:hover:bg-slate-50 disabled:cursor-default dark:border-slate-800 dark:bg-[#0d121b] dark:enabled:hover:bg-slate-900"
          >

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <Building2 className="h-4 w-4" />
            </div>


            <div className="min-w-0 flex-1">

              <p className="truncate text-[11px] font-black text-slate-900 dark:text-white">
                {companyLoading
                  ? 'Loading company…'
                  : currentCompany
                    ?.name ||
                    'Company'}
              </p>


              <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
                {companySelector
                  ? companyCount >
                      1
                    ? `${selectedCompanyCount} of ${companyCount} selected`
                    : 'Current company'
                  : companyError
                    ? 'Company context unavailable'
                    : 'Working company'}
              </p>

            </div>


            {companyLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : companySelector &&
              companySelector
                .companies
                .length >
                1 ? (
              <ChevronDown
                className={[
                  'h-4 w-4 shrink-0 text-slate-400 transition-transform',

                  companyMenuOpen
                    ? 'rotate-180'
                    : '',
                ].join(
                  ' ',
                )}
              />
            ) : null}

          </button>


          {companyMenuOpen &&
            companySelector &&
            companySelector
              .companies
              .length >
              1 && (
              <div className="absolute left-4 right-4 top-[60px] z-[90] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">

                <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">

                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    My companies
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    Only companies available to your workspace access are shown.
                  </p>

                </div>


                {companyError ? (
                  <div className="p-3">

                    <p className="text-[10px] leading-4 text-red-600 dark:text-red-300">
                      {companyError}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void loadCompanyContext()
                      }
                      className="mt-2 text-[10px] font-black text-blue-600"
                    >
                      Try again
                    </button>

                  </div>
                ) : (
                  <div className="max-h-[320px] overflow-y-auto p-2">

                    {companySelector
                      .companies
                      .map(
                        company => {
                          const switching =
                            companyAction ===
                            `current:${company.id}`;


                          const toggling =
                            companyAction ===
                            `selected:${company.id}`;


                          const defaulting =
                            companyAction ===
                            `default:${company.id}`;


                          return (
                            <div
                              key={
                                company.id
                              }
                              className={[
                                'mb-1 flex items-center gap-1 rounded-xl p-1',

                                company.isCurrent
                                  ? 'bg-blue-50 dark:bg-blue-950/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                              ].join(
                                ' ',
                              )}
                            >

                              {/* SELECT COMPANY */}

                              <button
                                type="button"
                                title={
                                  company.isSelected
                                    ? 'Remove from selected companies'
                                    : 'Add to selected companies'
                                }
                                disabled={
                                  companyAction !==
                                  null
                                }
                                onClick={() =>
                                  void toggleSelectedCompany(
                                    company,
                                  )
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-50"
                              >

                                <span
                                  className={[
                                    'flex h-4 w-4 items-center justify-center rounded border',

                                    company.isSelected
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950',
                                  ].join(
                                    ' ',
                                  )}
                                >
                                  {toggling ? (
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  ) : company.isSelected ? (
                                    <Check className="h-2.5 w-2.5" />
                                  ) : null}
                                </span>

                              </button>


                              {/* CURRENT COMPANY */}

                              <button
                                type="button"
                                disabled={
                                  companyAction !==
                                  null
                                }
                                onClick={() =>
                                  void switchCurrentCompany(
                                    company,
                                  )
                                }
                                className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left disabled:opacity-60"
                              >

                                <div className="flex items-center gap-2">

                                  <p
                                    className={[
                                      'min-w-0 flex-1 truncate text-[11px] font-black',

                                      company.isCurrent
                                        ? 'text-blue-700 dark:text-blue-300'
                                        : 'text-slate-800 dark:text-slate-100',
                                    ].join(
                                      ' ',
                                    )}
                                  >
                                    {company.name}
                                  </p>


                                  {switching ? (
                                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
                                  ) : company.isCurrent ? (
                                    <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">
                                      Current
                                    </span>
                                  ) : null}

                                </div>


                                <div className="mt-1 flex items-center gap-1.5">

                                  {company.isDefault && (
                                    <span className="text-[8px] font-black text-amber-600 dark:text-amber-300">
                                      Default
                                    </span>
                                  )}


                                  <span className="truncate text-[8px] font-semibold text-slate-400">
                                    {company.currency}
                                    {' · '}
                                    {company.timezone}
                                  </span>

                                </div>

                              </button>


                              {/* DEFAULT COMPANY */}

                              <button
                                type="button"
                                title={
                                  company.isDefault
                                    ? 'Default company'
                                    : 'Make default company'
                                }
                                disabled={
                                  companyAction !==
                                    null ||
                                  company.isDefault
                                }
                                onClick={() =>
                                  void makeDefaultCompany(
                                    company,
                                  )
                                }
                                className={[
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition disabled:cursor-default',

                                  company.isDefault
                                    ? 'text-amber-500'
                                    : 'text-slate-300 hover:text-amber-500 dark:text-slate-600',
                                ].join(
                                  ' ',
                                )}
                              >
                                {defaulting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Star
                                    className="h-3.5 w-3.5"
                                    fill={
                                      company.isDefault
                                        ? 'currentColor'
                                        : 'none'
                                    }
                                  />
                                )}
                              </button>

                            </div>
                          );
                        },
                      )}

                  </div>
                )}

              </div>
            )}

        </div>


        {/* ======================================================
            NAVIGATION
            ====================================================== */}

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">

          {/* WORKSPACE */}

          <NavSectionLabel>
            Workspace
          </NavSectionLabel>


          <div className="space-y-1">

            <NavLink
              href="/dashboard"
              icon={
                Home
              }
              label="Dashboard"
              active={
                pathname ===
                  '/dashboard' ||
                pathname.startsWith(
                  '/dashboard/',
                )
              }
              onNavigate={
                onClose
              }
            />


            {canUseAi && (
              <NavLink
                href="/ai"
                icon={
                  Bot
                }
                label="SaMi AI"
                active={
                  pathname ===
                    '/ai' ||
                  pathname.startsWith(
                    '/ai/',
                  )
                }
                onNavigate={
                  onClose
                }
              />
            )}

          </div>


          {/* ====================================================
              MY APPS

              One launcher + a small direct-access set keeps the
              shell useful even when many apps are installed.
              ==================================================== */}

          <div className="mt-6">

              <NavSectionLabel>
                My Apps
              </NavSectionLabel>


              <div className="space-y-1">

                <NavLink
                  href="/apps"
                  icon={
                    LayoutGrid
                  }
                  label="All Apps"
                  badge={
                    String(
                      accessibleApps.length,
                    )
                  }
                  active={
                    pathname ===
                      '/apps'
                  }
                  onNavigate={
                    onClose
                  }
                />


                {sidebarAppChildren.map(
                  item => (
                    <ChildNavLink
                      key={
                        item.key
                      }
                      href={
                        item.href
                      }
                      icon={
                        item.icon
                      }
                      label={
                        item.label
                      }
                      active={
                        pathname ===
                          hrefPath(
                            item.href,
                          ) ||
                        pathname.startsWith(
                          `${hrefPath(
                            item.href,
                          )}/`,
                        )
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  ),
                )}

              </div>

            </div>


          {/* ====================================================
              WORKSPACE TOOLS
              ==================================================== */}

          {(canUseFiles ||
            canUseNotifications) && (
            <div className="mt-6">

              <NavSectionLabel>
                Tools
              </NavSectionLabel>


              <DropdownButton
                icon={
                  Folder
                }
                label="Workspace Tools"
                expanded={
                  coreExpanded
                }
                active={
                  coreRouteActive
                }
                onClick={() =>
                  setCoreExpanded(
                    current =>
                      !current,
                  )
                }
              />


              {coreExpanded && (
                <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">

                  {canUseFiles && (
                    <ChildNavLink
                      href="/files"
                      icon={
                        Folder
                      }
                      label="Files"
                      active={
                        pathname ===
                          '/files' ||
                        pathname.startsWith(
                          '/files/',
                        )
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  )}


                  {canUseNotifications && (
                    <ChildNavLink
                      href="/notifications"
                      icon={
                        Bell
                      }
                      label="Notifications"
                      badge={
                        unreadNotifications >
                          0
                          ? unreadNotifications >
                              99
                            ? '99+'
                            : String(
                                unreadNotifications,
                              )
                          : undefined
                      }
                      active={
                        pathname ===
                          '/notifications' ||
                        pathname.startsWith(
                          '/notifications/',
                        )
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  )}

                </div>
              )}

            </div>
          )}


          {/* ====================================================
              SETTINGS
              ==================================================== */}

          <div className="mt-6">

            <NavSectionLabel>
              Account
            </NavSectionLabel>


            <DropdownButton
              icon={
                Settings
              }
              label="Settings"
              expanded={
                settingsExpanded
              }
              active={
                settingsRouteActive
              }
              badge={
                navigationLoading
                  ? '…'
                  : undefined
              }
              onClick={() =>
                setSettingsExpanded(
                  current =>
                    !current,
                )
              }
            />


            {settingsExpanded && (
              <div className="ml-[19px] mt-1 border-l border-slate-200 pl-3 dark:border-slate-800">

                {/* PERSONAL SETTINGS */}

                <div className="space-y-1">

                  <ChildNavLink
                    href="/settings?tab=personal"
                    icon={
                      User
                    }
                    label="My Account"
                    active={
                      pathname ===
                        '/settings' &&
                      (
                        !searchParams.get(
                          'tab',
                        ) ||
                        [
                          'personal',
                          'account',
                          'preferences',
                          'appearance',
                          'security',
                          'sessions',
                        ].includes(
                          searchParams.get(
                            'tab',
                          ) ||
                          '',
                        )
                      )
                    }
                    onNavigate={
                      onClose
                    }
                  />


                  {canUseAi && (
                    <ChildNavLink
                      href="/settings?tab=ai"
                      icon={
                        Bot
                      }
                      label="SaMi AI"
                      active={
                        pathname ===
                          '/settings' &&
                        searchParams.get(
                          'tab',
                        ) ===
                          'ai'
                      }
                      onNavigate={
                        onClose
                      }
                    />
                  )}

                </div>


                {/* ADMINISTRATIVE SETTINGS */}

                {adminSettingsChildren.length >
                  0 && (
                  <>
                    <p className="mb-1 mt-4 px-3 text-[8px] font-black uppercase tracking-[0.13em] text-slate-400">
                      Administration
                    </p>


                    <div className="space-y-1">

                      {adminSettingsChildren.map(
                        item => (
                          <ChildNavLink
                            key={
                              item.key
                            }
                            href={
                              item.href
                            }
                            icon={
                              item.icon
                            }
                            label={
                              item.label
                            }
                            active={
                              isSettingsChildActive(
                                item,
                              )
                            }
                            onNavigate={
                              onClose
                            }
                          />
                        ),
                      )}

                    </div>
                  </>
                )}

              </div>
            )}


            <div className="mt-1">

              <NavLink
                href="/help"
                icon={
                  CircleHelp
                }
                label="Help"
                active={
                  pathname ===
                    '/help' ||
                  pathname.startsWith(
                    '/help/',
                  )
                }
                onNavigate={
                  onClose
                }
              />

            </div>

          </div>

        </nav>


        {/* ======================================================
            USER
            ====================================================== */}

        <div className="shrink-0 border-t border-slate-100 p-3 dark:border-slate-800">

          <Link
            href="/settings?tab=personal"
            onClick={
              onClose
            }
            className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-900"
          >

            <UserAvatar
              avatarFileId={
                user.avatarFileId
              }
              displayName={
                displayName
              }
              initials={
                avatarInitials
              }
              size="md"
            />


            <div className="min-w-0 flex-1">

              <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                {displayName}
              </p>

              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                {user.email}
              </p>

            </div>

          </Link>

        </div>

      </aside>


      {/* ========================================================
          OVERLAY
          ======================================================== */}

      <SaMiOverlay
        open={
          overlay.open
        }
        type={
          overlay.type
        }
        title={
          overlay.title
        }
        message={
          overlay.message
        }
        primaryAction={{
          label:
            'OK',

          onClick: () =>
            setOverlay(
              CLOSED_OVERLAY,
            ),
        }}
        onClose={() =>
          setOverlay(
            CLOSED_OVERLAY,
          )
        }
      />
    </>
  );
}


/* ================================================================
   SECTION LABEL
   ================================================================ */

function NavSectionLabel({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
      {children}
    </p>
  );
}


/* ================================================================
   NAV LINK
   ================================================================ */

function NavLink({
  href,
  icon:
    Icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href:
    string;

  icon:
    LucideIcon;

  label:
    string;

  active:
    boolean;

  badge?:
    string;

  onNavigate:
    () => void;
}) {
  return (
    <Link
      href={
        href
      }
      onClick={
        onNavigate
      }
      aria-current={
        active
          ? 'page'
          : undefined
      }
      className={[
        'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition',

        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
      ].join(
        ' ',
      )}
    >

      <Icon
        className={[
          'h-[18px] w-[18px] shrink-0',

          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400',
        ].join(
          ' ',
        )}
      />


      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>


      {badge && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      )}

    </Link>
  );
}


/* ================================================================
   DROPDOWN
   ================================================================ */

function DropdownButton({
  icon:
    Icon,
  label,
  expanded,
  active,
  badge,
  onClick,
}: {
  icon:
    LucideIcon;

  label:
    string;

  expanded:
    boolean;

  active:
    boolean;

  badge?:
    string;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      aria-expanded={
        expanded
      }
      className={[
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition',

        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white',
      ].join(
        ' ',
      )}
    >

      <Icon
        className={[
          'h-[18px] w-[18px] shrink-0',

          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400',
        ].join(
          ' ',
        )}
      />


      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>


      {badge && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      )}


      <ChevronDown
        className={[
          'h-4 w-4 shrink-0 transition-transform duration-200',

          expanded
            ? 'rotate-180'
            : '',
        ].join(
          ' ',
        )}
      />

    </button>
  );
}


/* ================================================================
   CHILD LINK
   ================================================================ */

function ChildNavLink({
  href,
  icon:
    Icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href:
    string;

  icon:
    LucideIcon;

  label:
    string;

  active:
    boolean;

  badge?:
    string;

  onNavigate:
    () => void;
}) {
  return (
    <Link
      href={
        href
      }
      onClick={
        onNavigate
      }
      aria-current={
        active
          ? 'page'
          : undefined
      }
      className={[
        'flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-bold transition',

        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white',
      ].join(
        ' ',
      )}
    >

      <Icon
        className={[
          'h-3.5 w-3.5 shrink-0',

          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400',
        ].join(
          ' ',
        )}
      />


      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>


      {badge && (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      )}

    </Link>
  );
}
