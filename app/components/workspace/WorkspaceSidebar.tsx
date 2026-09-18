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
  Boxes,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  CircleHelp,
  ContactRound,
  CreditCard,
  Folder,
  FolderKanban,
  Home,
  LayoutGrid,
  Loader2,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingCart,
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


type TenantData =
  | {
      id: string;
      name: string;
      slug: string;
      status: string;
    }
  | null;


type MembershipData =
  | {
      accessLevel:
        | 'owner'
        | 'admin'
        | 'member';

      isOwner: boolean;
      isAdmin: boolean;
      label: string;
    }
  | null;


type SubscriptionData =
  | {
      status: string;
      planKey: string | null;
      planName: string | null;
    }
  | null;


type ModuleData = {
  key: string;
  name: string;
  status: string;
  href?: string | null;
  description?: string | null;
};


type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;

  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';

  isOwner: boolean;
  isAdmin: boolean;
};


type CurrentAccountResponse = {
  success?: boolean;
  authenticated?: boolean;
  code?: string;
  error?: string;

  currentWorkspaceId?:
    string | null;

  workspaces?:
    WorkspaceListItem[];
};


type WorkspaceActionResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;

  currentWorkspaceId?:
    string | null;
};


type CompanySelectorCompany = {
  id: string;
  name: string;

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
  success?: boolean;
  code?: string;
  error?: string;

  selector?:
    CompanySelectorState;
};


type Capabilities = {
  aiEnabled?: boolean;
  filesEnabled?: boolean;
  notificationsEnabled?: boolean;
};


type Props = {
  user: UserData;
  tenant: TenantData;
  membership: MembershipData;
  subscription: SubscriptionData;
  modules: ModuleData[];

  capabilities?: Capabilities;

  unreadNotifications?: number;

  open: boolean;

  onClose: () => void;
};


type SettingsTab =
  | 'personal'
  | 'workspace'
  | 'apps'
  | 'ai'
  | 'billing';


type SettingsKey =
  | SettingsTab
  | 'users';


type SettingsChild = {
  key:
    SettingsKey;

  label:
    string;

  href:
    string;

  icon:
    LucideIcon;

  ownerOnly?:
    boolean;

  adminOnly?:
    boolean;
};


type AppChild = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};


type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
};


/* ============================================================
   CONSTANTS
   ============================================================ */

const DISABLED_MODULE_STATUSES =
  new Set([
    'disabled',
    'failed',
    'uninstalled',
    'removed',
    'inactive',
  ]);


const APP_ROUTE_ALIASES:
  Record<
    string,
    string
  > = {
  invoice:
    '/invoices',

  invoices:
    '/invoices',

  invoicing:
    '/invoices',

  accounting:
    '/accounting',

  finance:
    '/accounting',

  crm:
    '/crm',

  sale:
    '/sales',

  sales:
    '/sales',

  pos:
    '/pos',

  'point-of-sale':
    '/pos',

  point_of_sale:
    '/pos',

  inventory:
    '/inventory',

  stock:
    '/inventory',

  hr:
    '/hr',

  'human-resources':
    '/hr',

  human_resources:
    '/hr',

  project:
    '/projects',

  projects:
    '/projects',

  ecommerce:
    '/ecommerce',

  'e-commerce':
    '/ecommerce',

  e_commerce:
    '/ecommerce',
};


const SETTINGS_CHILDREN:
  SettingsChild[] = [
    {
      key:
        'personal',

      label:
        'My Account',

      href:
        '/settings?tab=personal',

      icon:
        User,
    },

    {
      key:
        'workspace',

      label:
        'Workspace',

      href:
        '/settings?tab=workspace',

      icon:
        LayoutGrid,

      adminOnly:
        true,
    },

    {
      key:
        'users',

      label:
        'Users',

      href:
        '/settings/users',

      icon:
        UsersRound,

      adminOnly:
        true,
    },

    {
      key:
        'apps',

      label:
        'Apps',

      href:
        '/settings?tab=apps',

      icon:
        AppWindow,

      adminOnly:
        true,
    },

    {
      key:
        'ai',

      label:
        'SaMi AI',

      href:
        '/settings?tab=ai',

      icon:
        Bot,
    },

    {
      key:
        'billing',

      label:
        'Billing',

      href:
        '/settings?tab=billing',

      icon:
        CreditCard,

      ownerOnly:
        true,
    },
  ];


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


/* ============================================================
   HELPERS
   ============================================================ */

function normalizeKey(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      '-',
    );
}


function getModuleHref(
  module:
    ModuleData,
) {
  const suppliedHref =
    module.href?.trim();


  if (
    suppliedHref
  ) {
    return suppliedHref;
  }


  const normalized =
    normalizeKey(
      module.key,
    );


  if (
    APP_ROUTE_ALIASES[
      normalized
    ]
  ) {
    return APP_ROUTE_ALIASES[
      normalized
    ];
  }


  return `/apps/${encodeURIComponent(
    normalized,
  )}`;
}


function getModuleIcon(
  key:
    string,
): LucideIcon {
  const normalized =
    normalizeKey(
      key,
    );


  if (
    normalized ===
      'invoice' ||
    normalized ===
      'invoices' ||
    normalized ===
      'invoicing'
  ) {
    return ReceiptText;
  }


  if (
    normalized ===
      'accounting' ||
    normalized ===
      'finance'
  ) {
    return Calculator;
  }


  if (
    normalized ===
    'crm'
  ) {
    return ContactRound;
  }


  if (
    normalized ===
      'sale' ||
    normalized ===
      'sales'
  ) {
    return ShoppingCart;
  }


  if (
    normalized ===
      'inventory' ||
    normalized ===
      'stock'
  ) {
    return Boxes;
  }


  if (
    normalized ===
      'hr' ||
    normalized ===
      'human-resources' ||
    normalized ===
      'human_resources'
  ) {
    return UsersRound;
  }


  if (
    normalized ===
      'project' ||
    normalized ===
      'projects'
  ) {
    return FolderKanban;
  }


  if (
    normalized ===
      'ecommerce' ||
    normalized ===
      'e-commerce' ||
    normalized ===
      'e_commerce'
  ) {
    return Store;
  }


  if (
    normalized ===
      'pos' ||
    normalized ===
      'point-of-sale' ||
    normalized ===
      'point_of_sale'
  ) {
    return PackageSearch;
  }


  return AppWindow;
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


  const value =
    `${first || ''}${last || ''}`
      .trim();


  if (
    value
  ) {
    return value.toUpperCase();
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
    user.fullName?.trim() ||
    `${user.firstName || ''} ${
      user.lastName || ''
    }`.trim() ||
    user.email
  );
}


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


/* ============================================================
   SIDEBAR
   ============================================================ */

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


  /* ==========================================================
     WORKSPACE STATE
     ========================================================== */

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


  /* ==========================================================
     COMPANY STATE
     ========================================================== */

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


  /* ==========================================================
     GENERAL STATE
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>(
      CLOSED_OVERLAY,
    );


  const rawSettingsTab =
    searchParams.get(
      'tab',
    );


  const settingsTab:
    SettingsTab =
    rawSettingsTab ===
      'workspace' ||
    rawSettingsTab ===
      'apps' ||
    rawSettingsTab ===
      'ai' ||
    rawSettingsTab ===
      'billing'
      ? rawSettingsTab
      : 'personal';


  const canAdminWorkspace =
    Boolean(
      membership?.isAdmin ||
      membership?.isOwner,
    );


  const canManageApps =
    canAdminWorkspace;


  const installedApps =
    useMemo(
      () =>
        modules.filter(
          module => {
            const status =
              String(
                module.status ||
                  '',
              )
                .trim()
                .toLowerCase();


            return !DISABLED_MODULE_STATUSES.has(
              status,
            );
          },
        ),
      [
        modules,
      ],
    );


  const appChildren =
    useMemo<AppChild[]>(
      () =>
        installedApps.map(
          module => ({
            key:
              module.key,

            label:
              module.name,

            href:
              getModuleHref(
                module,
              ),

            icon:
              getModuleIcon(
                module.key,
              ),
          }),
        ),
      [
        installedApps,
      ],
    );


  const settingsChildren =
    useMemo(
      () =>
        SETTINGS_CHILDREN.filter(
          item => {
            if (
              item.ownerOnly &&
              !membership?.isOwner
            ) {
              return false;
            }


            if (
              item.adminOnly &&
              !canAdminWorkspace
            ) {
              return false;
            }


            if (
              item.key ===
                'ai' &&
              capabilities
                ?.aiEnabled ===
                false
            ) {
              return false;
            }


            return true;
          },
        ),
      [
        membership?.isOwner,
        canAdminWorkspace,
        capabilities
          ?.aiEnabled,
      ],
    );


  const appRouteActive =
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
    appsExpanded,
    setAppsExpanded,
  ] =
    useState(
      appRouteActive,
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


  /* ==========================================================
     CURRENT COMPANY
     ========================================================== */

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


  /* ==========================================================
     SETTINGS ACTIVE STATE
     ========================================================== */

  function isSettingsChildActive(
    item:
      SettingsChild,
  ) {
    if (
      item.key ===
      'users'
    ) {
      return (
        pathname ===
          '/settings/users' ||
        pathname.startsWith(
          '/settings/users/',
        )
      );
    }


    return (
      pathname ===
        '/settings' &&
      settingsTab ===
        item.key
    );
  }


  /* ==========================================================
     LOAD WORKSPACES
     ========================================================== */

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
           * Current workspace remains usable.
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


  /* ==========================================================
     LOAD COMPANY CONTEXT
     ========================================================== */

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


  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

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
      setCurrentWorkspaceId(
        tenant?.id ||
        null,
      );


      setCompanyMenuOpen(
        false,
      );
    },
    [
      tenant?.id,
    ],
  );


  /* ==========================================================
     ROUTE STATE
     ========================================================== */

  useEffect(
    () => {
      if (
        appRouteActive
      ) {
        setAppsExpanded(
          true,
        );
      }
    },
    [
      appRouteActive,
    ],
  );


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
      searchParams,
    ],
  );


  /* ==========================================================
     SWITCH WORKSPACE
     ========================================================== */

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
       * Company IDs belong to the previous physical tenant DB.
       *
       * Clear browser representation immediately.
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


  /* ==========================================================
     MUTATE COMPANY CONTEXT
     ========================================================== */

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


      /*
       * Refresh server components.
       *
       * Any dashboard/module that resolves requireCompanyContext()
       * now receives the new company state.
       */
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


  /* ==========================================================
     SET CURRENT COMPANY
     ========================================================== */

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


  /* ==========================================================
     TOGGLE SELECTED COMPANY
     ========================================================== */

  async function toggleSelectedCompany(
    company:
      CompanySelectorCompany,
  ) {
    if (
      !companySelector
    ) {
      return;
    }


    let nextCompanyIds =
      [
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


    nextCompanyIds =
      [
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
          'At least one company must remain selected in the working context.',
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


  /* ==========================================================
     SET DEFAULT COMPANY
     ========================================================== */

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


  /* ==========================================================
     DISPLAY
     ========================================================== */

  const displayName =
    getDisplayName(
      user,
    );


  const avatarInitials =
    getInitials(
      user,
    );


  const planName =
    subscription?.planName ||
    subscription?.planKey ||
    'Free';


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


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
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


      <aside
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-[#090d15] lg:translate-x-0 ${
          open
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        {/* ====================================================
            LOGO
            ==================================================== */}

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


        {/* ====================================================
            CURRENT WORKSPACE
            ==================================================== */}

        <div className="relative px-4 pt-4">
          <button
            type="button"
            onClick={
              () => {
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
              }
            }
            disabled={
              workspacesLoading ||
              !hasMultipleWorkspaces
            }
            aria-expanded={
              workspaceMenuOpen
            }
            className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left transition enabled:hover:bg-slate-100 disabled:cursor-default dark:bg-slate-900 dark:enabled:hover:bg-slate-800"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white">
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
                {' · '}
                {planName}
              </p>
            </div>


            {workspacesLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : hasMultipleWorkspaces ? (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  workspaceMenuOpen
                    ? 'rotate-180'
                    : ''
                }`}
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
                          onClick={
                            () =>
                              void switchWorkspace(
                                workspace,
                              )
                          }
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-wait ${
                            selected
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-black ${
                              selected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
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


        {/* ====================================================
            COMPANY SELECTOR
            ==================================================== */}

        <div className="relative border-b border-slate-100 px-4 pb-4 pt-2 dark:border-slate-800">
          <button
            type="button"
            onClick={
              () => {
                setWorkspaceMenuOpen(
                  false,
                );


                setCompanyMenuOpen(
                  current =>
                    !current,
                );
              }
            }
            disabled={
              companyLoading ||
              (
                !companySelector &&
                !companyError
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
                  ? `${selectedCompanyCount} of ${companyCount} selected`
                  : companyError
                    ? 'Company context unavailable'
                    : 'Working company'}
              </p>
            </div>


            {companyLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  companyMenuOpen
                    ? 'rotate-180'
                    : ''
                }`}
              />
            )}
          </button>


          {companyMenuOpen && (
            <div className="absolute left-4 right-4 top-[60px] z-[90] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Companies
                </p>

                <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                  Select companies for your working context. The highlighted company is current.
                </p>
              </div>


              {companyError ? (
                <div className="p-3">
                  <p className="text-[10px] leading-4 text-red-600 dark:text-red-300">
                    {companyError}
                  </p>

                  <button
                    type="button"
                    onClick={
                      () =>
                        void loadCompanyContext()
                    }
                    className="mt-2 text-[10px] font-black text-blue-600"
                  >
                    Try again
                  </button>
                </div>
              ) : companySelector &&
                companySelector
                  .companies
                  .length >
                  0 ? (
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
                            className={`mb-1 flex items-center gap-1 rounded-xl p-1 ${
                              company.isCurrent
                                ? 'bg-blue-50 dark:bg-blue-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
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
                              onClick={
                                () =>
                                  void toggleSelectedCompany(
                                    company,
                                  )
                              }
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-50"
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  company.isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950'
                                }`}
                              >
                                {toggling ? (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                ) : company.isSelected ? (
                                  <Check className="h-2.5 w-2.5" />
                                ) : null}
                              </span>
                            </button>


                            <button
                              type="button"
                              disabled={
                                companyAction !==
                                null
                              }
                              onClick={
                                () =>
                                  void switchCurrentCompany(
                                    company,
                                  )
                              }
                              className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left disabled:opacity-60"
                            >
                              <div className="flex items-center gap-2">
                                <p
                                  className={`min-w-0 flex-1 truncate text-[11px] font-black ${
                                    company.isCurrent
                                      ? 'text-blue-700 dark:text-blue-300'
                                      : 'text-slate-800 dark:text-slate-100'
                                  }`}
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
                              onClick={
                                () =>
                                  void makeDefaultCompany(
                                    company,
                                  )
                              }
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition disabled:cursor-default ${
                                company.isDefault
                                  ? 'text-amber-500'
                                  : 'text-slate-300 hover:bg-white hover:text-amber-500 dark:text-slate-600 dark:hover:bg-slate-900'
                              }`}
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
              ) : (
                <div className="p-4 text-[10px] text-slate-400">
                  No active company access is available.
                </div>
              )}
            </div>
          )}
        </div>


        {/* ====================================================
            NAVIGATION
            ==================================================== */}

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
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


            {capabilities
              ?.aiEnabled !==
              false && (
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


          {/* ==================================================
              APPS
              ================================================== */}

          <div className="mt-6">
            <NavSectionLabel>
              Business
            </NavSectionLabel>


            <DropdownButton
              icon={
                LayoutGrid
              }
              label="Apps"
              expanded={
                appsExpanded
              }
              active={
                appRouteActive
              }
              badge={
                installedApps.length >
                0
                  ? String(
                      installedApps.length,
                    )
                  : undefined
              }
              onClick={
                () =>
                  setAppsExpanded(
                    current =>
                      !current,
                  )
              }
            />


            {appsExpanded && (
              <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                {appChildren.length >
                0 ? (
                  appChildren.map(
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
                  )
                ) : (
                  <div className="px-3 py-2 text-[10px] font-semibold leading-4 text-slate-400">
                    No business apps installed.
                  </div>
                )}


                {canManageApps && (
                  <ChildNavLink
                    href="/settings?tab=apps"
                    icon={
                      AppWindow
                    }
                    label="Manage Apps"
                    active={
                      pathname ===
                        '/settings' &&
                      settingsTab ===
                        'apps'
                    }
                    onNavigate={
                      onClose
                    }
                  />
                )}
              </div>
            )}
          </div>


          {/* ==================================================
              CORE
              ================================================== */}

          {(capabilities
            ?.filesEnabled ||
            capabilities
              ?.notificationsEnabled) && (
            <div className="mt-6">
              <NavSectionLabel>
                Core
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
                onClick={
                  () =>
                    setCoreExpanded(
                      current =>
                        !current,
                    )
                }
              />


              {coreExpanded && (
                <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                  {capabilities
                    ?.filesEnabled && (
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


                  {capabilities
                    ?.notificationsEnabled && (
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


          {/* ==================================================
              SETTINGS
              ================================================== */}

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
              onClick={
                () =>
                  setSettingsExpanded(
                    current =>
                      !current,
                  )
              }
            />


            {settingsExpanded && (
              <div className="ml-[19px] mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                {settingsChildren.map(
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


        {/* ====================================================
            USER
            ==================================================== */}

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


      {/* ======================================================
          OVERLAY
          ====================================================== */}

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

          onClick:
            () =>
              setOverlay(
                CLOSED_OVERLAY,
              ),
        }}
        onClose={
          () =>
            setOverlay(
              CLOSED_OVERLAY,
            )
        }
      />
    </>
  );
}


/* ============================================================
   SECTION LABEL
   ============================================================ */

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


/* ============================================================
   NAV LINK
   ============================================================ */

function NavLink({
  href,
  icon:
    Icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href: string;

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
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400'
        }`}
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


/* ============================================================
   DROPDOWN
   ============================================================ */

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
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400'
        }`}
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
        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
          expanded
            ? 'rotate-180'
            : ''
        }`}
      />
    </button>
  );
}


/* ============================================================
   CHILD LINK
   ============================================================ */

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
      className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
        active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          active
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-400'
        }`}
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