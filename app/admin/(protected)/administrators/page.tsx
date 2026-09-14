'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Users,
  X,
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

/* ============================================================
   TYPES
   ============================================================ */

type PlatformAdminRole =
  | 'super_admin'
  | 'security_admin'
  | 'support_admin'
  | 'billing_admin'
  | 'operations_admin'
  | 'developer_admin'
  | 'read_only_admin';

type PlatformAdminStatus =
  | 'invited'
  | 'active'
  | 'suspended'
  | 'locked'
  | 'disabled';

type Administrator = {
  id:
    string;

  firstName:
    string;

  lastName:
    string;

  fullName:
    string;

  email:
    string;

  role:
    PlatformAdminRole;

  status:
    PlatformAdminStatus;

  emailVerified:
    boolean;

  emailVerifiedAt:
    string | null;

  twoFactorRequired:
    boolean;

  twoFactorEnabled:
    boolean;

  failedLoginAttempts:
    number;

  lockedUntil:
    string | null;

  lastLoginAt:
    string | null;

  lastLoginIp:
    string | null;

  passwordChangedAt:
    string | null;

  createdBy:
    string | null;

  createdAt:
    string;

  updatedAt:
    string;
};

type Summary = {
  total:
    number;

  active:
    number;

  invited:
    number;

  locked:
    number;

  suspended:
    number;

  disabled:
    number;

  twoFactorEnabled:
    number;
};

type Pagination = {
  page:
    number;

  limit:
    number;

  total:
    number;

  totalPages:
    number;
};

type AdministratorsResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  administrators?:
    Administrator[];

  summary?:
    Summary;

  pagination?:
    Pagination;
};

type CreateResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  verification?: {
    sent?:
      boolean;

    pending?:
      boolean;

    cooldown?:
      boolean;

    retryAfterSeconds?:
      number | null;
  };
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

/* ============================================================
   CONSTANTS
   ============================================================ */

const ROLE_OPTIONS: {
  value:
    PlatformAdminRole;

  label:
    string;

  description:
    string;
}[] = [
  {
    value:
      'super_admin',

    label:
      'Super Administrator',

    description:
      'Full Platform Administration authority.',
  },

  {
    value:
      'security_admin',

    label:
      'Security Administrator',

    description:
      'Platform security and investigation responsibilities.',
  },

  {
    value:
      'support_admin',

    label:
      'Support Administrator',

    description:
      'Customer and tenant support responsibilities.',
  },

  {
    value:
      'billing_admin',

    label:
      'Billing Administrator',

    description:
      'Subscription and billing responsibilities.',
  },

  {
    value:
      'operations_admin',

    label:
      'Operations Administrator',

    description:
      'Platform operational responsibilities.',
  },

  {
    value:
      'developer_admin',

    label:
      'Developer Administrator',

    description:
      'Technical platform and developer responsibilities.',
  },

  {
    value:
      'read_only_admin',

    label:
      'Read-only Administrator',

    description:
      'Read-only Platform Administration access.',
  },
];

const STATUS_OPTIONS = [
  '',
  'active',
  'invited',
  'locked',
  'suspended',
  'disabled',
] as const;

/* ============================================================
   HELPERS
   ============================================================ */

function roleLabel(
  role:
    string
) {
  return role
    .split('_')
    .map(
      part =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

function statusClasses(
  status:
    PlatformAdminStatus
) {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';

    case 'invited':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';

    case 'locked':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';

    case 'suspended':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300';

    case 'disabled':
      return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  }
}

function formatDate(
  value:
    string | null
) {
  if (
    !value
  ) {
    return 'Never';
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    }
  ).format(
    date
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function AdministratorsPage() {
  const [
    administrators,
    setAdministrators,
  ] =
    useState<
      Administrator[]
    >([]);

  const [
    summary,
    setSummary,
  ] =
    useState<Summary>({
      total:
        0,

      active:
        0,

      invited:
        0,

      locked:
        0,

      suspended:
        0,

      disabled:
        0,

      twoFactorEnabled:
        0,
    });

  const [
    pagination,
    setPagination,
  ] =
    useState<Pagination>({
      page:
        1,

      limit:
        25,

      total:
        0,

      totalPages:
        1,
    });

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    query,
    setQuery,
  ] =
    useState('');

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    status,
    setStatus,
  ] =
    useState('');

  const [
    role,
    setRole,
  ] =
    useState('');

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(false);

  const [
    creating,
    setCreating,
  ] =
    useState(false);

  const [
    firstName,
    setFirstName,
  ] =
    useState('');

  const [
    lastName,
    setLastName,
  ] =
    useState('');

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    newRole,
    setNewRole,
  ] =
    useState<
      PlatformAdminRole
    >(
      'read_only_admin'
    );

  const [
    formError,
    setFormError,
  ] =
    useState('');

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open:
        false,

      type:
        'info',

      title:
        '',

      message:
        '',
    });

  /* ==========================================================
     LOAD
     ========================================================== */

  const loadAdministrators =
    useCallback(
      async (
        page =
          pagination.page
      ) => {
        setLoading(
          true
        );

        try {
          const params =
            new URLSearchParams();

          params.set(
            'page',
            String(
              page
            )
          );

          params.set(
            'limit',
            '25'
          );

          if (
            search
          ) {
            params.set(
              'q',
              search
            );
          }

          if (
            status
          ) {
            params.set(
              'status',
              status
            );
          }

          if (
            role
          ) {
            params.set(
              'role',
              role
            );
          }

          const response =
            await fetch(
              `/api/admin/administrators?${params.toString()}`,
              {
                cache:
                  'no-store',

                credentials:
                  'same-origin',
              }
            );

          const data:
            AdministratorsResponse =
            await response.json();

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                'Could not load Platform Administrators.'
            );
          }

          setAdministrators(
            data.administrators ||
              []
          );

          if (
            data.summary
          ) {
            setSummary(
              data.summary
            );
          }

          if (
            data.pagination
          ) {
            setPagination(
              data.pagination
            );
          }
        } catch (error) {
          setOverlay({
            open:
              true,

            type:
              'error',

            title:
              'Administrators unavailable',

            message:
              error instanceof
                Error
                ? error.message
                : 'SaMi could not load Platform Administrators.',
          });
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        pagination.page,
        role,
        search,
        status,
      ]
    );

  useEffect(
    () => {
      void loadAdministrators(
        1
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      search,
      role,
      status,
    ]
  );

  /* ==========================================================
     SEARCH
     ========================================================== */

  function submitSearch(
    event:
      FormEvent
  ) {
    event.preventDefault();

    setSearch(
      query.trim()
    );
  }

  /* ==========================================================
     CREATE
     ========================================================== */

  async function createAdministrator(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      creating
    ) {
      return;
    }

    setFormError('');

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim()
    ) {
      setFormError(
        'First name, last name and email are required.'
      );

      return;
    }

    setCreating(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/administrators',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            credentials:
              'same-origin',

            body:
              JSON.stringify({
                firstName:
                  firstName.trim(),

                lastName:
                  lastName.trim(),

                email:
                  email.trim(),

                role:
                  newRole,
              }),
          }
        );

      const data:
        CreateResponse =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        setFormError(
          data.error ||
            'SaMi could not create this Platform Administrator.'
        );

        return;
      }

      setCreateOpen(
        false
      );

      setFirstName(
        ''
      );

      setLastName(
        ''
      );

      setEmail(
        ''
      );

      setNewRole(
        'read_only_admin'
      );

      await loadAdministrators(
        1
      );

      if (
        data.verification
          ?.sent
      ) {
        setOverlay({
          open:
            true,

          type:
            'success',

          title:
            'Administrator created',

          message:
            'The Platform Administrator identity has been created and the verification email was sent.',
        });

        return;
      }

      setOverlay({
        open:
          true,

        type:
          'warning',

        title:
          'Administrator created',

        message:
          'The administrator identity was created, but verification email delivery is still pending. Do not create the administrator again.',
      });
    } catch {
      setFormError(
        'SaMi could not reach the administrator service.'
      );
    } finally {
      setCreating(
        false
      );
    }
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <>
      <div className="space-y-6">
        {/* HEADER */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
              <ShieldCheck className="h-4 w-4" />
              Platform Identity
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
              Platform Administrators
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Provision and review identities that can access SaMi Platform Administration.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFormError(
                ''
              );

              setCreateOpen(
                true
              );
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            Add Administrator
          </button>
        </div>

        {/* SUMMARY */}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Administrators"
            value={
              summary.total
            }
            icon={
              Users
            }
          />

          <SummaryCard
            label="Active"
            value={
              summary.active
            }
            icon={
              CheckCircle2
            }
          />

          <SummaryCard
            label="Awaiting setup"
            value={
              summary.invited
            }
            icon={
              Mail
            }
          />

          <SummaryCard
            label="2FA enabled"
            value={
              summary.twoFactorEnabled
            }
            icon={
              ShieldCheck
            }
          />
        </div>

        {/* FILTERS */}

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 xl:flex-row">
            <form
              onSubmit={
                submitSearch
              }
              className="relative flex-1"
            >
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />

              <input
                value={
                  query
                }
                onChange={
                  event =>
                    setQuery(
                      event.target.value
                    )
                }
                maxLength={
                  120
                }
                placeholder="Search name or email"
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </form>

            <select
              value={
                status
              }
              onChange={
                event =>
                  setStatus(
                    event.target.value
                  )
              }
              className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">
                All statuses
              </option>

              {STATUS_OPTIONS
                .filter(
                  value =>
                    value
                )
                .map(
                  value => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {roleLabel(
                        value
                      )}
                    </option>
                  )
                )}
            </select>

            <select
              value={
                role
              }
              onChange={
                event =>
                  setRole(
                    event.target.value
                  )
              }
              className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">
                All roles
              </option>

              {ROLE_OPTIONS.map(
                item => (
                  <option
                    key={
                      item.value
                    }
                    value={
                      item.value
                    }
                  >
                    {item.label}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              onClick={() =>
                void loadAdministrators(
                  pagination.page
                )
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* TABLE */}

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-400" />

                <p className="mt-3 text-sm text-zinc-500">
                  Loading Platform Administrators…
                </p>
              </div>
            </div>
          ) : administrators.length ===
            0 ? (
            <div className="flex min-h-72 items-center justify-center px-6 text-center">
              <div>
                <UserCog className="mx-auto h-8 w-8 text-zinc-400" />

                <h2 className="mt-4 font-bold">
                  No administrators found
                </h2>

                <p className="mt-2 text-sm text-zinc-500">
                  Adjust your filters or provision a new administrator.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <tr>
                    <th className="px-5 py-4">
                      Administrator
                    </th>

                    <th className="px-5 py-4">
                      Role
                    </th>

                    <th className="px-5 py-4">
                      Status
                    </th>

                    <th className="px-5 py-4">
                      Verification
                    </th>

                    <th className="px-5 py-4">
                      2FA
                    </th>

                    <th className="px-5 py-4">
                      Last login
                    </th>

                    <th className="px-5 py-4">
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {administrators.map(
                    admin => (
                      <tr
                        key={
                          admin.id
                        }
                        className="transition hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-zinc-950 dark:text-white">
                            {admin.fullName}
                          </div>

                          <div className="mt-1 text-xs text-zinc-500">
                            {admin.email}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm">
                          {roleLabel(
                            admin.role
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(
                              admin.status
                            )}`}
                          >
                            {roleLabel(
                              admin.status
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          {admin.emailVerified ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-4 w-4" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <Mail className="h-4 w-4" />
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          {admin.twoFactorEnabled ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="h-4 w-4" />
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                              <ShieldOff className="h-4 w-4" />
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-xs text-zinc-500">
                          {formatDate(
                            admin.lastLoginAt
                          )}
                        </td>

                        <td className="px-5 py-4 text-xs text-zinc-500">
                          {formatDate(
                            admin.createdAt
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINATION */}

          {!loading &&
            pagination.total >
              0 && (
              <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="text-xs text-zinc-500">
                  Page{' '}
                  {pagination.page}{' '}
                  of{' '}
                  {
                    pagination.totalPages
                  }
                  {' · '}
                  {
                    pagination.total
                  }{' '}
                  administrator
                  {pagination.total ===
                  1
                    ? ''
                    : 's'}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      pagination.page <=
                      1
                    }
                    onClick={() =>
                      void loadAdministrators(
                        pagination.page -
                          1
                      )
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    disabled={
                      pagination.page >=
                      pagination.totalPages
                    }
                    onClick={() =>
                      void loadAdministrators(
                        pagination.page +
                          1
                      )
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* CREATE MODAL */}

      {createOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">
                  Add Platform Administrator
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  SaMi will create an invited identity and send the administrator a verification email.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCreateOpen(
                    false
                  )
                }
                className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={
                createAdministrator
              }
              className="mt-6 space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold">
                    First name
                  </label>

                  <input
                    value={
                      firstName
                    }
                    onChange={
                      event =>
                        setFirstName(
                          event.target.value
                        )
                    }
                    maxLength={
                      120
                    }
                    autoComplete="off"
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">
                    Last name
                  </label>

                  <input
                    value={
                      lastName
                    }
                    onChange={
                      event =>
                        setLastName(
                          event.target.value
                        )
                    }
                    maxLength={
                      120
                    }
                    autoComplete="off"
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Administrator email
                </label>

                <input
                  type="email"
                  value={
                    email
                  }
                  onChange={
                    event =>
                      setEmail(
                        event.target.value
                      )
                  }
                  maxLength={
                    254
                  }
                  autoComplete="off"
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Administrator role
                </label>

                <select
                  value={
                    newRole
                  }
                  onChange={
                    event =>
                      setNewRole(
                        event.target
                          .value as
                          PlatformAdminRole
                      )
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {ROLE_OPTIONS.map(
                    option => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>

                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {
                    ROLE_OPTIONS.find(
                      item =>
                        item.value ===
                        newRole
                    )
                      ?.description
                  }
                </p>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                >
                  {formError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    creating
                  }
                  onClick={() =>
                    setCreateOpen(
                      false
                    )
                  }
                  className="h-11 rounded-xl border border-zinc-200 px-5 text-sm font-bold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    creating
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Administrator
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        onClose={() =>
          setOverlay(
            current => ({
              ...current,
              open:
                false,
            })
          )
        }
      />
    </>
  );
}

/* ============================================================
   SUMMARY CARD
   ============================================================ */

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label:
    string;

  value:
    number;

  icon:
    React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 text-3xl font-black">
        {value}
      </div>

      <div className="mt-1 text-sm text-zinc-500">
        {label}
      </div>
    </div>
  );
}