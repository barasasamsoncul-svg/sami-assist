'use client';

import Link from 'next/link';

import {
  Building2,
  Check,
  Crown,
  Filter,
  KeyRound,
  Loader2,
  Menu,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';


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


type Props = {
  user:
    UserData;

  tenant:
    TenantData;

  membership:
    MembershipData;

  subscription:
    SubscriptionData;

  modules:
    ModuleData[];

  canViewRoles:
    boolean;

  canManageRoles:
    boolean;
};


type DirectoryRole = {
  id:
    string;

  key:
    string | null;

  name:
    string;
};


type DirectoryCompany = {
  id:
    string;

  name:
    string;

  isDefault:
    boolean;
};


type DirectoryMember = {
  membershipId:
    string;

  userId:
    string;

  email:
    string;

  firstName:
    string;

  lastName:
    string;

  fullName:
    string;

  avatarFileId:
    string | null;

  accountStatus:
    string;

  memberType:
    'internal'
    | 'portal';

  membershipStatus:
    'active'
    | 'suspended';

  accessState:
    string;

  canEnterWorkspace:
    boolean;

  isOwner:
    boolean;

  defaultCompanyId:
    string | null;

  roles:
    DirectoryRole[];

  companies:
    DirectoryCompany[];

  invitedAt:
    string | null;

  joinedAt:
    string | null;

  lastActiveAt:
    string | null;

  suspendedAt:
    string | null;

  deletedAt:
    string | null;
};


type DirectorySummary = {
  total:
    number;

  active:
    number;

  suspended:
    number;

  internal:
    number;

  portal:
    number;

  removed:
    number;
};


type Directory = {
  tenantId:
    string;

  workspaceName:
    string;

  generatedAt:
    string;

  summary:
    DirectorySummary;

  members:
    DirectoryMember[];
};


type DirectoryResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  directory?:
    Directory;
};


type FilterValue =
  | 'all'
  | 'active'
  | 'suspended'
  | 'internal'
  | 'portal'
  | 'removed';


type AssignableRole = {
  id:
    string;

  tenantId:
    string | null;

  key:
    string;

  name:
    string;

  description:
    string | null;

  isSystem:
    boolean;

  status:
    'active'
    | 'disabled';

  permissionCount:
    number;

  assignable:
    boolean;
};


type MemberRoleAssignment = {
  id:
    string;

  key:
    string;

  name:
    string;

  description:
    string | null;

  isSystem:
    boolean;

  status:
    'active'
    | 'disabled';
};


type MemberRoleState = {
  membershipId:
    string;

  userId:
    string;

  tenantId:
    string;

  isOwner:
    boolean;

  memberType:
    'internal';

  membershipStatus:
    'active';

  roles:
    MemberRoleAssignment[];
};


type MemberRolesResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  roles?:
    AssignableRole[];

  member?:
    MemberRoleState;

  changed?:
    boolean;
};


type RoleEditorState = {
  member:
    DirectoryMember | null;

  roles:
    AssignableRole[];

  selected:
    Set<string>;

  original:
    Set<string>;

  loading:
    boolean;

  saving:
    boolean;

  error:
    string | null;
};


const EMPTY_ROLE_EDITOR:
  RoleEditorState = {
  member:
    null,

  roles:
    [],

  selected:
    new Set(),

  original:
    new Set(),

  loading:
    false,

  saving:
    false,

  error:
    null,
};


/* ================================================================
   HELPERS
   ================================================================ */

function normalize(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}


function displayName(
  member:
    DirectoryMember,
) {
  const full =
    member.fullName
      .trim();


  if (
    full
  ) {
    return full;
  }


  const joined =
    `${member.firstName} ${member.lastName}`
      .trim();


  return (
    joined ||
    member.email
  );
}


function initials(
  member:
    DirectoryMember,
) {
  const first =
    member.firstName
      ?.trim()
      .charAt(
        0,
      );


  const last =
    member.lastName
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


  const name =
    member.fullName
      ?.trim();


  if (
    name
  ) {
    return name
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


  return member.email
    .charAt(
      0,
    )
    .toUpperCase();
}


function formatLabel(
  value:
    string,
) {
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


function formatDate(
  value:
    string | null,
) {
  if (
    !value
  ) {
    return 'Never';
  }


  const date =
    new Date(
      value,
    );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Not available';
  }


  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    },
  ).format(
    date,
  );
}


function getMemberStatus(
  member:
    DirectoryMember,
) {
  if (
    member.deletedAt
  ) {
    return 'removed';
  }


  return member
    .membershipStatus;
}


function canEditMemberRoles(
  member:
    DirectoryMember,

  canManageRoles:
    boolean,
) {
  return Boolean(
    canManageRoles &&

    member.memberType ===
      'internal' &&

    member.membershipStatus ===
      'active' &&

    !member.deletedAt &&

    !member.isOwner,
  );
}


async function readJson<T>(
  response:
    Response,
): Promise<T | null> {
  try {
    return (
      await response.json()
    ) as T;
  } catch {
    return null;
  }
}


function setsEqual(
  first:
    Set<string>,

  second:
    Set<string>,
) {
  if (
    first.size !==
    second.size
  ) {
    return false;
  }


  for (
    const value
    of first
  ) {
    if (
      !second.has(
        value,
      )
    ) {
      return false;
    }
  }


  return true;
}


/* ================================================================
   COMPONENT
   ================================================================ */

export default function UsersSettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  canViewRoles,
  canManageRoles,
}: Props) {
  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    );


  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    directory,
    setDirectory,
  ] =
    useState<
      Directory | null
    >(
      null,
    );


  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );


  const [
    filter,
    setFilter,
  ] =
    useState<FilterValue>(
      'all',
    );


  const [
    roleEditor,
    setRoleEditor,
  ] =
    useState<RoleEditorState>(
      EMPTY_ROLE_EDITOR,
    );


  /* ============================================================
     LOAD DIRECTORY
     ============================================================ */

  const loadDirectory =
    useCallback(
      async (
        silent =
          false,
      ) => {
        if (
          silent
        ) {
          setRefreshing(
            true,
          );
        } else {
          setLoading(
            true,
          );
        }


        setError(
          null,
        );


        try {
          const response =
            await fetch(
              '/api/workspace/members',
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
            await readJson<DirectoryResponse>(
              response,
            );


          if (
            !response.ok ||
            !data?.success ||
            !data.directory
          ) {
            throw new Error(
              data?.error ||
              'Workspace users could not be loaded.',
            );
          }


          setDirectory(
            data.directory,
          );
        } catch (
          requestError
        ) {
          setError(
            requestError instanceof
              Error
              ? requestError.message
              : 'Workspace users could not be loaded.',
          );
        } finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      },

      [],
    );


  useEffect(
    () => {
      void loadDirectory();
    },

    [
      loadDirectory,
    ],
  );


  /* ============================================================
     FILTER
     ============================================================ */

  const filteredMembers =
    useMemo(
      () => {
        if (
          !directory
        ) {
          return [];
        }


        const query =
          normalize(
            search,
          );


        return directory.members
          .filter(
            member => {
              switch (
                filter
              ) {
                case 'active':
                  return (
                    !member.deletedAt &&
                    member.membershipStatus ===
                      'active'
                  );

                case 'suspended':
                  return (
                    !member.deletedAt &&
                    member.membershipStatus ===
                      'suspended'
                  );

                case 'internal':
                  return (
                    !member.deletedAt &&
                    member.memberType ===
                      'internal'
                  );

                case 'portal':
                  return (
                    !member.deletedAt &&
                    member.memberType ===
                      'portal'
                  );

                case 'removed':
                  return Boolean(
                    member.deletedAt,
                  );

                default:
                  return true;
              }
            },
          )
          .filter(
            member => {
              if (
                !query
              ) {
                return true;
              }


              const roleText =
                member.roles
                  .map(
                    role =>
                      role.name,
                  )
                  .join(
                    ' ',
                  );


              const companyText =
                member.companies
                  .map(
                    company =>
                      company.name,
                  )
                  .join(
                    ' ',
                  );


              return normalize(
                [
                  displayName(
                    member,
                  ),
                  member.email,
                  member.memberType,
                  member.membershipStatus,
                  roleText,
                  companyText,
                ].join(
                  ' ',
                ),
              ).includes(
                query,
              );
            },
          );
      },

      [
        directory,
        filter,
        search,
      ],
    );


  /* ============================================================
     ROLE EDITOR
     ============================================================ */

  async function openRoleEditor(
    member:
      DirectoryMember,
  ) {
    if (
      !canEditMemberRoles(
        member,
        canManageRoles,
      )
    ) {
      return;
    }


    setRoleEditor({
      member,

      roles:
        [],

      selected:
        new Set(),

      original:
        new Set(),

      loading:
        true,

      saving:
        false,

      error:
        null,
    });


    try {
      const response =
        await fetch(
          `/api/workspace/member-roles?userId=${encodeURIComponent(
            member.userId,
          )}`,
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
        await readJson<MemberRolesResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success ||
        !data.member ||
        !data.roles
      ) {
        throw new Error(
          data?.error ||
          'Role assignments could not be loaded.',
        );
      }


      const assigned =
        new Set(
          data.member.roles.map(
            role =>
              role.id,
          ),
        );


      setRoleEditor({
        member,

        roles:
          data.roles,

        selected:
          assigned,

        original:
          new Set(
            assigned,
          ),

        loading:
          false,

        saving:
          false,

        error:
          null,
      });
    } catch (
      requestError
    ) {
      setRoleEditor(
        current => ({
          ...current,

          loading:
            false,

          error:
            requestError instanceof
              Error
              ? requestError.message
              : 'Role assignments could not be loaded.',
        }),
      );
    }
  }


  function closeRoleEditor() {
    if (
      roleEditor.saving
    ) {
      return;
    }


    setRoleEditor(
      EMPTY_ROLE_EDITOR,
    );
  }


  function toggleRole(
    roleId:
      string,
  ) {
    if (
      roleEditor.saving
    ) {
      return;
    }


    setRoleEditor(
      current => {
        const selected =
          new Set(
            current.selected,
          );


        if (
          selected.has(
            roleId,
          )
        ) {
          selected.delete(
            roleId,
          );
        } else {
          selected.add(
            roleId,
          );
        }


        return {
          ...current,
          selected,
        };
      },
    );
  }


  const roleEditorDirty =
    !setsEqual(
      roleEditor.selected,
      roleEditor.original,
    );


  async function saveMemberRoles() {
    const member =
      roleEditor.member;


    if (
      !member ||
      roleEditor.saving ||
      !roleEditorDirty
    ) {
      return;
    }


    if (
      roleEditor.selected.size ===
      0
    ) {
      setRoleEditor(
        current => ({
          ...current,

          error:
            'An active internal member must have at least one role.',
        }),
      );

      return;
    }


    setRoleEditor(
      current => ({
        ...current,

        saving:
          true,

        error:
          null,
      }),
    );


    try {
      const response =
        await fetch(
          '/api/workspace/member-roles',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                userId:
                  member.userId,

                roleIds: [
                  ...roleEditor.selected,
                ],
              }),
          },
        );


      const data =
        await readJson<MemberRolesResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          'Role assignments could not be saved.',
        );
      }


      setRoleEditor(
        EMPTY_ROLE_EDITOR,
      );


      setSuccess(
        `Roles updated for ${displayName(
          member,
        )}.`,
      );


      await loadDirectory(
        true,
      );
    } catch (
      requestError
    ) {
      setRoleEditor(
        current => ({
          ...current,

          saving:
            false,

          error:
            requestError instanceof
              Error
              ? requestError.message
              : 'Role assignments could not be saved.',
        }),
      );
    }
  }


  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">
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

          onClose={() =>
            setSidebarOpen(
              false,
            )
          }
        />


        <div className="min-w-0 flex-1 lg:pl-[286px]">

          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">

              <button
                type="button"
                aria-label="Open navigation"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  Users
                </p>

                <p className="hidden truncate text-[11px] text-slate-400 sm:block">
                  {tenant?.name ||
                    'SaMi Workspace'}
                </p>
              </div>


              <div className="ml-auto flex items-center gap-2">

                {canViewRoles && (
                  <Link
                    href="/settings/roles"
                    className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300 sm:inline-flex"
                  >
                    <Shield className="h-4 w-4" />

                    Roles & permissions
                  </Link>
                )}


                <button
                  type="button"
                  disabled={
                    refreshing
                  }
                  onClick={() =>
                    void loadDirectory(
                      true,
                    )
                  }
                  aria-label="Refresh users"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                >
                  <RefreshCw
                    className={[
                      'h-4 w-4',
                      refreshing
                        ? 'animate-spin'
                        : '',
                    ].join(
                      ' ',
                    )}
                  />
                </button>
              </div>
            </div>
          </header>


          <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">

            {error && (
              <Message
                type="error"
                text={
                  error
                }
                onClose={() =>
                  setError(
                    null,
                  )
                }
              />
            )}


            {success && (
              <Message
                type="success"
                text={
                  success
                }
                onClose={() =>
                  setSuccess(
                    null,
                  )
                }
              />
            )}


            {loading ? (
              <LoadingState />
            ) : error &&
              !directory ? (
              <ErrorState
                message={
                  error
                }
                onRetry={() =>
                  void loadDirectory()
                }
              />
            ) : directory ? (
              <>
                <section className="mb-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

                    <div>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        Access management
                      </p>

                      <h1 className="mt-1 text-xl font-bold tracking-[-0.025em] sm:text-2xl">
                        Workspace users
                      </h1>

                      <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                        Manage workspace members, company access visibility and role assignments.
                      </p>
                    </div>


                    {canViewRoles && (
                      <Link
                        href="/settings/roles"
                        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 sm:hidden"
                      >
                        <Shield className="h-4 w-4" />

                        Roles
                      </Link>
                    )}
                  </div>


                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-6 xl:overflow-visible">
                    <SummaryCard
                      label="Total"
                      value={
                        directory.summary.total
                      }
                    />

                    <SummaryCard
                      label="Active"
                      value={
                        directory.summary.active
                      }
                    />

                    <SummaryCard
                      label="Internal"
                      value={
                        directory.summary.internal
                      }
                    />

                    <SummaryCard
                      label="Portal"
                      value={
                        directory.summary.portal
                      }
                    />

                    <SummaryCard
                      label="Suspended"
                      value={
                        directory.summary.suspended
                      }
                    />

                    <SummaryCard
                      label="Removed"
                      value={
                        directory.summary.removed
                      }
                    />
                  </div>
                </section>


                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">

                  <div className="border-b border-slate-100 p-3 dark:border-white/10 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row">

                      <label className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input
                          value={
                            search
                          }
                          onChange={
                            event =>
                              setSearch(
                                event.target.value,
                              )
                          }
                          placeholder="Search name, email, role or company"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-500/60"
                        />
                      </label>


                      <label className="relative shrink-0">
                        <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <select
                          value={
                            filter
                          }
                          onChange={
                            event =>
                              setFilter(
                                event.target.value as FilterValue,
                              )
                          }
                          className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5 sm:w-[175px]"
                        >
                          <option value="all">
                            All users
                          </option>

                          <option value="active">
                            Active
                          </option>

                          <option value="internal">
                            Internal
                          </option>

                          <option value="portal">
                            Portal
                          </option>

                          <option value="suspended">
                            Suspended
                          </option>

                          <option value="removed">
                            Removed
                          </option>
                        </select>
                      </label>
                    </div>


                    <p className="mt-2 text-[11px] text-slate-400">
                      {filteredMembers.length}{' '}
                      {filteredMembers.length ===
                      1
                        ? 'user'
                        : 'users'}
                    </p>
                  </div>


                  {filteredMembers.length ===
                  0 ? (
                    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
                      <UserRound className="h-7 w-7 text-slate-300" />

                      <p className="mt-3 text-sm font-semibold">
                        No users found
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Try another search or filter.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full min-w-[1080px] border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 text-left dark:border-white/10">
                              <TableHeader>
                                User
                              </TableHeader>

                              <TableHeader>
                                Type
                              </TableHeader>

                              <TableHeader>
                                Status
                              </TableHeader>

                              <TableHeader>
                                Roles
                              </TableHeader>

                              <TableHeader>
                                Companies
                              </TableHeader>

                              <TableHeader>
                                Last active
                              </TableHeader>

                              {canManageRoles && (
                                <TableHeader>
                                  Access
                                </TableHeader>
                              )}
                            </tr>
                          </thead>


                          <tbody>
                            {filteredMembers.map(
                              member => (
                                <MemberRow
                                  key={
                                    member.membershipId
                                  }

                                  member={
                                    member
                                  }

                                  canManageRoles={
                                    canManageRoles
                                  }

                                  onManageRoles={
                                    openRoleEditor
                                  }
                                />
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>


                      <div className="divide-y divide-slate-100 lg:hidden dark:divide-white/10">
                        {filteredMembers.map(
                          member => (
                            <MemberCard
                              key={
                                member.membershipId
                              }

                              member={
                                member
                              }

                              canManageRoles={
                                canManageRoles
                              }

                              onManageRoles={
                                openRoleEditor
                              }
                            />
                          ),
                        )}
                      </div>
                    </>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>


      {roleEditor.member && (
        <RoleEditor
          state={
            roleEditor
          }

          dirty={
            roleEditorDirty
          }

          onClose={
            closeRoleEditor
          }

          onToggle={
            toggleRole
          }

          onSave={() =>
            void saveMemberRoles()
          }
        />
      )}
    </main>
  );
}


/* ================================================================
   MEMBER ROW
   ================================================================ */

function MemberRow({
  member,
  canManageRoles,
  onManageRoles,
}: {
  member:
    DirectoryMember;

  canManageRoles:
    boolean;

  onManageRoles:
    (
      member:
        DirectoryMember,
    ) => void;
}) {
  const editable =
    canEditMemberRoles(
      member,
      canManageRoles,
    );


  return (
    <tr className="border-b border-slate-100 align-top last:border-0 dark:border-white/10">

      <td className="px-4 py-3.5">
        <MemberIdentity
          member={
            member
          }
        />
      </td>


      <td className="px-4 py-3.5">
        <TypeBadge
          type={
            member.memberType
          }
        />
      </td>


      <td className="px-4 py-3.5">
        <StatusBadge
          status={
            getMemberStatus(
              member,
            )
          }
        />
      </td>


      <td className="px-4 py-3.5">
        <RoleList
          roles={
            member.roles
          }

          owner={
            member.isOwner
          }
        />
      </td>


      <td className="px-4 py-3.5">
        <CompanyList
          companies={
            member.companies
          }
        />
      </td>


      <td className="px-4 py-3.5">
        <p className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-300">
          {formatDate(
            member.lastActiveAt,
          )}
        </p>

        <p className="mt-1 whitespace-nowrap text-[10px] text-slate-400">
          Joined{' '}
          {formatDate(
            member.joinedAt,
          )}
        </p>
      </td>


      {canManageRoles && (
        <td className="px-4 py-3.5">
          {editable ? (
            <button
              type="button"
              onClick={() =>
                onManageRoles(
                  member,
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
            >
              <Pencil className="h-3.5 w-3.5" />

              Roles
            </button>
          ) : (
            <span className="text-[10px] text-slate-400">
              {member.isOwner
                ? 'Protected'
                : 'Unavailable'}
            </span>
          )}
        </td>
      )}
    </tr>
  );
}


/* ================================================================
   MEMBER CARD
   ================================================================ */

function MemberCard({
  member,
  canManageRoles,
  onManageRoles,
}: {
  member:
    DirectoryMember;

  canManageRoles:
    boolean;

  onManageRoles:
    (
      member:
        DirectoryMember,
    ) => void;
}) {
  const editable =
    canEditMemberRoles(
      member,
      canManageRoles,
    );


  return (
    <div className="p-4">

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <MemberIdentity
            member={
              member
            }
          />
        </div>


        {editable && (
          <button
            type="button"
            onClick={() =>
              onManageRoles(
                member,
              )
            }
            aria-label="Manage roles"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>


      <div className="mt-3 flex flex-wrap gap-1.5">
        <TypeBadge
          type={
            member.memberType
          }
        />

        <StatusBadge
          status={
            getMemberStatus(
              member,
            )
          }
        />

        {member.isOwner && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <Crown className="h-3 w-3" />

            Owner
          </span>
        )}
      </div>


      <div className="mt-3">
        <RoleList
          roles={
            member.roles
          }

          owner={
            false
          }
        />
      </div>


      <div className="mt-3 flex gap-2 overflow-x-auto">
        {member.companies.map(
          company => (
            <span
              key={
                company.id
              }
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
            >
              <Building2 className="h-3 w-3" />

              {company.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}


/* ================================================================
   ROLE EDITOR
   ================================================================ */

function RoleEditor({
  state,
  dirty,
  onClose,
  onToggle,
  onSave,
}: {
  state:
    RoleEditorState;

  dirty:
    boolean;

  onClose:
    () => void;

  onToggle:
    (
      roleId:
        string,
    ) => void;

  onSave:
    () => void;
}) {
  const member =
    state.member;


  if (
    !member
  ) {
    return null;
  }


  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-5">

      <button
        type="button"
        aria-label="Close role editor"
        onClick={
          onClose
        }
        className="absolute inset-0"
      />


      <section className="relative z-10 flex max-h-[82vh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#15181F] sm:max-w-xl sm:rounded-2xl">

        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm">
            <KeyRound className="h-5 w-5" />
          </div>


          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">
              Manage roles
            </h2>

            <p className="mt-0.5 truncate text-xs text-slate-400">
              {displayName(
                member,
              )}
            </p>
          </div>


          <button
            type="button"
            disabled={
              state.saving
            }
            onClick={
              onClose
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>


        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">

          {state.loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : state.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {state.error}
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[11px] leading-5 text-slate-600 dark:border-blue-500/20 dark:bg-blue-500/[0.06] dark:text-slate-300">
                Roles are additive. A user receives the combined permissions of all assigned roles. Company access separately controls where those permissions apply.
              </div>


              <div className="space-y-1">
                {state.roles.map(
                  role => {
                    const checked =
                      state.selected.has(
                        role.id,
                      );


                    return (
                      <button
                        key={
                          role.id
                        }
                        type="button"
                        disabled={
                          state.saving
                        }
                        onClick={() =>
                          onToggle(
                            role.id,
                          )
                        }
                        className={[
                          'flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition',
                          checked
                            ? 'border-blue-300 bg-blue-50/70 dark:border-blue-500/40 dark:bg-blue-500/10'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/[0.04]',
                        ].join(
                          ' ',
                        )}
                      >
                        <span
                          className={[
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                            checked
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 dark:border-white/20',
                          ].join(
                            ' ',
                          )}
                        >
                          {checked && (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </span>


                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                          {role.isSystem ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <Shield className="h-4 w-4" />
                          )}
                        </div>


                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-semibold">
                              {role.name}
                            </p>

                            {role.isSystem && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                System
                              </span>
                            )}
                          </div>

                          <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                            {role.description ||
                              `${role.permissionCount} permissions`}
                          </p>
                        </div>


                        <span className="shrink-0 text-[10px] text-slate-400">
                          {role.permissionCount}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </>
          )}
        </div>


        {!state.loading && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">

            <p className="text-[10px] text-slate-400">
              {state.selected.size}{' '}
              {state.selected.size ===
              1
                ? 'role'
                : 'roles'}{' '}
              selected
            </p>


            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  state.saving
                }
                onClick={
                  onClose
                }
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
              >
                Cancel
              </button>


              <button
                type="button"
                disabled={
                  state.saving ||
                  !dirty ||
                  state.selected.size ===
                    0
                }
                onClick={
                  onSave
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state.saving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                Save
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


/* ================================================================
   USER IDENTITY
   ================================================================ */

function MemberIdentity({
  member,
}: {
  member:
    DirectoryMember;
}) {
  return (
    <div className="flex min-w-[210px] items-center gap-3">

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
        {initials(
          member,
        )}
      </div>


      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-semibold">
            {displayName(
              member,
            )}
          </p>

          {member.isOwner && (
            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
        </div>

        <p className="mt-0.5 truncate text-[10px] text-slate-400">
          {member.email}
        </p>
      </div>
    </div>
  );
}


/* ================================================================
   BADGES
   ================================================================ */

function TypeBadge({
  type,
}: {
  type:
    'internal'
    | 'portal';
}) {
  const internal =
    type ===
    'internal';


  return (
    <span
      className={[
        'inline-flex rounded-md px-2 py-1 text-[10px] font-semibold',
        internal
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
          : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300',
      ].join(
        ' ',
      )}
    >
      {internal
        ? 'Internal'
        : 'Portal'}
    </span>
  );
}


function StatusBadge({
  status,
}: {
  status:
    string;
}) {
  const normalized =
    normalize(
      status,
    );


  let className =
    'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';


  if (
    normalized ===
      'active'
  ) {
    className =
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  }


  if (
    normalized ===
      'suspended'
  ) {
    className =
      'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  }


  if (
    normalized ===
      'removed'
  ) {
    className =
      'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
  }


  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${className}`}
    >
      {formatLabel(
        normalized,
      )}
    </span>
  );
}


/* ================================================================
   ROLE LIST
   ================================================================ */

function RoleList({
  roles,
  owner,
}: {
  roles:
    DirectoryRole[];

  owner:
    boolean;
}) {
  if (
    roles.length ===
      0 &&
    !owner
  ) {
    return (
      <span className="text-[10px] text-slate-400">
        No role
      </span>
    );
  }


  return (
    <div className="flex max-w-[250px] flex-wrap gap-1">

      {owner && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldCheck className="h-3 w-3" />

          Owner
        </span>
      )}


      {roles.map(
        role => (
          <span
            key={
              role.id
            }
            className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
          >
            {role.name ||
              role.key ||
              'Role'}
          </span>
        ),
      )}
    </div>
  );
}


/* ================================================================
   COMPANY LIST
   ================================================================ */

function CompanyList({
  companies,
}: {
  companies:
    DirectoryCompany[];
}) {
  if (
    companies.length ===
      0
  ) {
    return (
      <span className="text-[10px] text-slate-400">
        No company
      </span>
    );
  }


  return (
    <div className="flex max-w-[280px] flex-wrap gap-1">

      {companies
        .slice(
          0,
          3,
        )
        .map(
          company => (
            <span
              key={
                company.id
              }
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
            >
              <Building2 className="h-3 w-3" />

              {company.name}

              {company.isDefault && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </span>
          ),
        )}


      {companies.length >
        3 && (
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-white/10">
          +
          {companies.length -
            3}
        </span>
      )}
    </div>
  );
}


/* ================================================================
   TABLE HEADER
   ================================================================ */

function TableHeader({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">
      {children}
    </th>
  );
}


/* ================================================================
   SUMMARY CARD
   ================================================================ */

function SummaryCard({
  label,
  value,
}: {
  label:
    string;

  value:
    number;
}) {
  return (
    <div className="min-w-[105px] shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-blue-200 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-500/30 xl:min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-lg font-bold">
        {value}
      </p>
    </div>
  );
}


/* ================================================================
   MESSAGE
   ================================================================ */

function Message({
  type,
  text,
  onClose,
}: {
  type:
    'error'
    | 'success';

  text:
    string;

  onClose:
    () => void;
}) {
  return (
    <div
      className={[
        'mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs',
        type ===
          'error'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
      ].join(
        ' ',
      )}
    >
      <span>
        {text}
      </span>

      <button
        type="button"
        onClick={
          onClose
        }
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}


/* ================================================================
   LOADING
   ================================================================ */

function LoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />

        <p className="mt-3 text-xs font-medium text-slate-500">
          Loading workspace users…
        </p>
      </div>
    </div>
  );
}


/* ================================================================
   ERROR
   ================================================================ */

function ErrorState({
  message,
  onRetry,
}: {
  message:
    string;

  onRetry:
    () => void;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="max-w-md text-center">

        <UsersRound className="mx-auto h-8 w-8 text-slate-300" />

        <h2 className="mt-3 text-sm font-semibold">
          Users unavailable
        </h2>

        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {message}
        </p>

        <button
          type="button"
          onClick={
            onRetry
          }
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}