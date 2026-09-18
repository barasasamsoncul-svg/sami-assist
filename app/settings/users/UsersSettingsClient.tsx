'use client';

import {
  Building2,
  Crown,
  Filter,
  Loader2,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';


/* ================================================================
   TYPES
   ================================================================ */

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

  label:
    string;
} | null;


type SubscriptionData = {
  status: string;

  planKey:
    string | null;

  planName:
    string | null;
} | null;


type ModuleData = {
  key: string;
  name: string;
  status: string;

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


  return joined ||
    member.email;
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
        character.toUpperCase(),
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


async function readResponse(
  response:
    Response,
): Promise<DirectoryResponse> {
  try {
    return (
      await response.json()
    ) as DirectoryResponse;
  } catch {
    return {
      success:
        false,

      error:
        'SaMi returned an invalid response.',
    };
  }
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
}: Props) {
  const router =
    useRouter();


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
            await readResponse(
              response,
            );


          if (
            !response.ok ||
            !data.success ||
            !data.directory
          ) {
            throw new Error(
              data.error ||
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

                  member
                    .membershipStatus,

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
     RENDER
     ============================================================ */

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950 dark:bg-[#070a10] dark:text-white">
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
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800/90 dark:bg-[#080b12]/90">
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
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">
                  Users
                </p>

                <p className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block dark:text-slate-400">
                  Manage workspace membership and access visibility
                </p>
              </div>


              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={
                    () =>
                      router.push(
                        '/settings?tab=workspace',
                      )
                  }
                  className="hidden rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 sm:inline-flex dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Workspace settings
                </button>


                <button
                  type="button"
                  disabled={
                    refreshing
                  }
                  onClick={
                    () =>
                      void loadDirectory(
                        true,
                      )
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:hover:bg-slate-900"
                  aria-label="Refresh users"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      refreshing
                        ? 'animate-spin'
                        : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </header>


          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState
                message={
                  error
                }
                onRetry={
                  () =>
                    void loadDirectory()
                }
              />
            ) : directory ? (
              <>
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-7">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
                          <UsersRound className="h-5 w-5" />
                        </div>

                        <div>
                          <h1 className="text-xl font-black sm:text-2xl">
                            Workspace users
                          </h1>

                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {directory.workspaceName ||
                              tenant?.name ||
                              'SaMi Workspace'}
                          </p>
                        </div>
                      </div>

                      <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                        View internal users, portal users, workspace status,
                        company access and role assignments from one place.
                      </p>
                    </div>
                  </div>


                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <SummaryCard
                      label="Total"
                      value={
                        directory
                          .summary
                          .total
                      }
                    />

                    <SummaryCard
                      label="Active"
                      value={
                        directory
                          .summary
                          .active
                      }
                    />

                    <SummaryCard
                      label="Internal"
                      value={
                        directory
                          .summary
                          .internal
                      }
                    />

                    <SummaryCard
                      label="Portal"
                      value={
                        directory
                          .summary
                          .portal
                      }
                    />

                    <SummaryCard
                      label="Suspended"
                      value={
                        directory
                          .summary
                          .suspended
                      }
                    />

                    <SummaryCard
                      label="Removed"
                      value={
                        directory
                          .summary
                          .removed
                      }
                    />
                  </div>
                </section>


                <section className="mt-5 rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0d121b]">
                  <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <label className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input
                          value={
                            search
                          }
                          onChange={
                            event =>
                              setSearch(
                                event
                                  .target
                                  .value,
                              )
                          }
                          placeholder="Search name, email, role or company"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950"
                        />
                      </label>


                      <label className="relative">
                        <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <select
                          value={
                            filter
                          }
                          onChange={
                            event =>
                              setFilter(
                                event
                                  .target
                                  .value as FilterValue,
                              )
                          }
                          className="h-11 min-w-[180px] appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm font-semibold outline-none transition focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950"
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


                    <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {filteredMembers.length}{' '}
                      {filteredMembers.length ===
                      1
                        ? 'user'
                        : 'users'}
                    </p>
                  </div>


                  {filteredMembers.length ===
                  0 ? (
                    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
                        <UserRound className="h-5 w-5" />
                      </div>

                      <p className="mt-4 text-sm font-black">
                        No users found
                      </p>

                      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Try another search or filter.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full min-w-[1050px] border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-left dark:border-slate-800">
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
                            </tr>
                          </thead>

                          <tbody>
                            {filteredMembers.map(
                              member => (
                                <MemberRow
                                  key={
                                    member
                                      .membershipId
                                  }
                                  member={
                                    member
                                  }
                                />
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>


                      <div className="divide-y divide-slate-200 lg:hidden dark:divide-slate-800">
                        {filteredMembers.map(
                          member => (
                            <MemberCard
                              key={
                                member
                                  .membershipId
                              }
                              member={
                                member
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
    </main>
  );
}


/* ================================================================
   MEMBER ROW
   ================================================================ */

function MemberRow({
  member,
}: {
  member:
    DirectoryMember;
}) {
  return (
    <tr className="border-b border-slate-100 align-top last:border-0 dark:border-slate-900">
      <td className="px-5 py-4">
        <MemberIdentity
          member={
            member
          }
        />
      </td>

      <td className="px-5 py-4">
        <TypeBadge
          type={
            member.memberType
          }
        />
      </td>

      <td className="px-5 py-4">
        <StatusBadge
          status={
            getMemberStatus(
              member,
            )
          }
        />
      </td>

      <td className="px-5 py-4">
        <RoleList
          roles={
            member.roles
          }
          owner={
            member.isOwner
          }
        />
      </td>

      <td className="px-5 py-4">
        <CompanyList
          companies={
            member.companies
          }
        />
      </td>

      <td className="px-5 py-4">
        <p className="whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-300">
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
    </tr>
  );
}


/* ================================================================
   MEMBER CARD
   ================================================================ */

function MemberCard({
  member,
}: {
  member:
    DirectoryMember;
}) {
  return (
    <div className="p-5">
      <MemberIdentity
        member={
          member
        }
      />


      <div className="mt-4 flex flex-wrap gap-2">
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
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <Crown className="h-3 w-3" />

            Owner
          </span>
        )}
      </div>


      <div className="mt-4">
        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
          Roles
        </p>

        <div className="mt-2">
          <RoleList
            roles={
              member.roles
            }
            owner={
              false
            }
          />
        </div>
      </div>


      <div className="mt-4">
        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
          Companies
        </p>

        <div className="mt-2">
          <CompanyList
            companies={
              member.companies
            }
          />
        </div>
      </div>


      <div className="mt-4 grid grid-cols-2 gap-3">
        <SmallInfo
          label="Joined"
          value={
            formatDate(
              member.joinedAt,
            )
          }
        />

        <SmallInfo
          label="Last active"
          value={
            formatDate(
              member.lastActiveAt,
            )
          }
        />
      </div>
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
    <div className="flex min-w-[220px] items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {initials(
          member,
        )}
      </div>


      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-black">
            {displayName(
              member,
            )}
          </p>

          {member.isOwner && (
            <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
        </div>

        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
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
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${
        internal
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
      }`}
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
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';


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
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${className}`}
    >
      {formatLabel(
        normalized,
      )}
    </span>
  );
}


/* ================================================================
   ROLES
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
      <span className="text-xs text-slate-400">
        No role
      </span>
    );
  }


  return (
    <div className="flex max-w-[260px] flex-wrap gap-1.5">
      {owner && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
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
            className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
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
   COMPANIES
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
      <span className="text-xs text-slate-400">
        No company
      </span>
    );
  }


  return (
    <div className="flex max-w-[300px] flex-wrap gap-1.5">
      {companies.map(
        company => (
          <span
            key={
              company.id
            }
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <Building2 className="h-3 w-3" />

            {company.name}

            {company.isDefault && (
              <span
                title="Default company"
                className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500"
              />
            )}
          </span>
        ),
      )}
    </div>
  );
}


/* ================================================================
   SMALL COMPONENTS
   ================================================================ */

function TableHeader({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
      {children}
    </th>
  );
}


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
    <div className="rounded-[18px] border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-black">
        {value}
      </p>
    </div>
  );
}


function SmallInfo({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        {value}
      </p>
    </div>
  );
}


function LoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />

        <p className="mt-3 text-xs font-semibold text-slate-500">
          Loading workspace users…
        </p>
      </div>
    </div>
  );
}


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
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          <UsersRound className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-sm font-black">
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
          className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Try again
        </button>
      </div>
    </div>
  );
}