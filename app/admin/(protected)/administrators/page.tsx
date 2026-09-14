'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  LockKeyhole,
  Mail,
  MoreHorizontal,
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
  type SaMiOverlayAction,
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
  id: string;

  firstName: string;
  lastName: string;
  fullName: string;

  email: string;

  role: PlatformAdminRole;

  status: PlatformAdminStatus;

  emailVerified: boolean;
  emailVerifiedAt: string | null;

  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;

  failedLoginAttempts: number;

  lockedUntil: string | null;

  lastLoginAt: string | null;
  lastLoginIp: string | null;

  passwordChangedAt: string | null;

  createdBy: string | null;

  createdAt: string;
  updatedAt: string;
};

type Summary = {
  total: number;
  active: number;
  invited: number;
  locked: number;
  suspended: number;
  disabled: number;
  twoFactorEnabled: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type AdministratorsResponse = {
  success?: boolean;
  code?: string;
  error?: string;

  administrators?: Administrator[];

  summary?: Summary;

  pagination?: Pagination;
};

type CreateResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;

  verification?: {
    sent?: boolean;
    pending?: boolean;
    cooldown?: boolean;
    retryAfterSeconds?: number | null;
  };
};

type LifecycleResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;

  admin?: Administrator;

  security?: {
    sessionsRevoked?: number;
    challengesInvalidated?: number;
  };
};

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;

  primaryAction?: SaMiOverlayAction;
  secondaryAction?: SaMiOverlayAction;
};

type ManageMode =
  | 'role'
  | 'status'
  | 'unlock'
  | null;

/* ============================================================
   CONSTANTS
   ============================================================ */

const ROLE_OPTIONS: {
  value: PlatformAdminRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'super_admin',
    label: 'Super Administrator',
    description:
      'Full Platform Administration authority.',
  },

  {
    value: 'security_admin',
    label: 'Security Administrator',
    description:
      'Platform security and investigation responsibilities.',
  },

  {
    value: 'support_admin',
    label: 'Support Administrator',
    description:
      'Customer and tenant support responsibilities.',
  },

  {
    value: 'billing_admin',
    label: 'Billing Administrator',
    description:
      'Subscription and billing responsibilities.',
  },

  {
    value: 'operations_admin',
    label: 'Operations Administrator',
    description:
      'Platform operational responsibilities.',
  },

  {
    value: 'developer_admin',
    label: 'Developer Administrator',
    description:
      'Technical platform and developer responsibilities.',
  },

  {
    value: 'read_only_admin',
    label: 'Read-only Administrator',
    description:
      'Read-only Platform Administration access.',
  },
];

const FILTER_STATUS_OPTIONS: PlatformAdminStatus[] = [
  'active',
  'invited',
  'locked',
  'suspended',
  'disabled',
];

const MUTABLE_STATUS_OPTIONS: {
  value: 'active' | 'suspended' | 'disabled';
  label: string;
  description: string;
}[] = [
  {
    value: 'active',
    label: 'Active',
    description:
      'Allow this administrator to authenticate and use their assigned role.',
  },

  {
    value: 'suspended',
    label: 'Suspended',
    description:
      'Temporarily prevent access while preserving the administrator identity.',
  },

  {
    value: 'disabled',
    label: 'Disabled',
    description:
      'Disable Platform Administrator access until explicitly reactivated.',
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

function roleLabel(
  value: string
) {
  return value
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
  status: PlatformAdminStatus
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
  value: string | null
) {
  if (!value) {
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
      dateStyle: 'medium',
      timeStyle: 'short',
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
    useState<Administrator[]>(
      []
    );

  const [
    summary,
    setSummary,
  ] =
    useState<Summary>({
      total: 0,
      active: 0,
      invited: 0,
      locked: 0,
      suspended: 0,
      disabled: 0,
      twoFactorEnabled: 0,
    });

  const [
    pagination,
    setPagination,
  ] =
    useState<Pagination>({
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 1,
    });

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

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

  /* ==========================================================
     CREATE ADMIN
     ========================================================== */

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(
      false
    );

  const [
    creating,
    setCreating,
  ] =
    useState(
      false
    );

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
    useState<PlatformAdminRole>(
      'read_only_admin'
    );

  const [
    formError,
    setFormError,
  ] =
    useState('');

  /* ==========================================================
     MANAGE ADMIN
     ========================================================== */

  const [
    selectedAdmin,
    setSelectedAdmin,
  ] =
    useState<Administrator | null>(
      null
    );

  const [
    manageMode,
    setManageMode,
  ] =
    useState<ManageMode>(
      null
    );

  const [
    selectedRole,
    setSelectedRole,
  ] =
    useState<PlatformAdminRole>(
      'read_only_admin'
    );

  const [
    selectedStatus,
    setSelectedStatus,
  ] =
    useState<
      'active' | 'suspended' | 'disabled'
    >(
      'active'
    );

  const [
    mutating,
    setMutating,
  ] =
    useState(
      false
    );

  const [
    mutationError,
    setMutationError,
  ] =
    useState('');

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open: false,
      type: 'info',
      title: '',
      message: '',
    });

  function closeOverlay() {
    setOverlay(
      current => ({
        ...current,
        open: false,
      })
    );
  }

  function showOverlay(
    type: SaMiOverlayType,
    title: string,
    message: string,
    primaryAction?: SaMiOverlayAction,
    secondaryAction?: SaMiOverlayAction
  ) {
    setOverlay({
      open: true,
      type,
      title,
      message,
      primaryAction,
      secondaryAction,
    });
  }

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

          let data:
            AdministratorsResponse;

          try {
            data =
              await response.json();
          } catch {
            throw new Error(
              'SaMi returned an invalid administrator response.'
            );
          }

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
        } catch (
          error
        ) {
          showOverlay(
            'error',
            'Administrators unavailable',
            error instanceof
              Error
              ? error.message
              : 'SaMi could not load Platform Administrators.'
          );
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
    event: FormEvent
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
    event: FormEvent<HTMLFormElement>
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
            method: 'POST',

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

      let data:
        CreateResponse;

      try {
        data =
          await response.json();
      } catch {
        setFormError(
          'SaMi returned an invalid response.'
        );

        return;
      }

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

      setFirstName('');
      setLastName('');
      setEmail('');

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
        showOverlay(
          'success',
          'Administrator created',
          'The Platform Administrator identity was created and the verification email was sent.'
        );

        return;
      }

      showOverlay(
        'warning',
        'Administrator created',
        'The administrator identity was created, but verification email delivery is still pending. Do not create the administrator again.'
      );
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
     OPEN MANAGEMENT
     ========================================================== */

  function openManage(
    admin: Administrator
  ) {
    setSelectedAdmin(
      admin
    );

    setSelectedRole(
      admin.role
    );

    if (
      admin.status ===
        'suspended' ||
      admin.status ===
        'disabled'
    ) {
      setSelectedStatus(
        admin.status
      );
    } else {
      setSelectedStatus(
        'active'
      );
    }

    setMutationError('');

    setManageMode(
      null
    );
  }

  function closeManage() {
    if (
      mutating
    ) {
      return;
    }

    setSelectedAdmin(
      null
    );

    setManageMode(
      null
    );

    setMutationError('');
  }

  /* ==========================================================
     LIFECYCLE REQUEST
     ========================================================== */

  async function lifecycleRequest(
    admin: Administrator,
    payload: Record<
      string,
      unknown
    >
  ): Promise<boolean> {
    if (
      mutating
    ) {
      return false;
    }

    setMutationError('');

    setMutating(
      true
    );

    try {
      const response =
        await fetch(
          `/api/admin/administrators/${encodeURIComponent(
            admin.id
          )}`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            credentials:
              'same-origin',

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      let data:
        LifecycleResponse;

      try {
        data =
          await response.json();
      } catch {
        setMutationError(
          'SaMi returned an invalid administrator update response.'
        );

        return false;
      }

      if (
        !response.ok ||
        !data.success
      ) {
        const message =
          data.error ||
          'SaMi could not update this Platform Administrator.';

        switch (
          data.code
        ) {
          case 'LAST_SUPER_ADMIN_PROTECTED':
            showOverlay(
              'warning',
              'Super Administrator protected',
              'SaMi must always have at least one active Super Administrator. Create or promote another active Super Administrator before making this change.'
            );

            break;

          case 'SELF_MODIFICATION_NOT_ALLOWED':
            showOverlay(
              'warning',
              'Self-modification blocked',
              'You cannot change your own Platform Administrator role or lifecycle status from administrator management.'
            );

            break;

          case 'ADMIN_STATE_CONFLICT':
            showOverlay(
              'warning',
              'Administrator changed',
              message
            );

            break;

          case 'ADMIN_NOT_LOCKED':
            showOverlay(
              'info',
              'Administrator is not locked',
              message
            );

            break;

          case 'ADMIN_UNAUTHENTICATED':
            showOverlay(
              'error',
              'Administrator session expired',
              'Your administrator session is no longer valid. Sign in again before making Platform changes.',
              {
                label:
                  'Sign in',
                href:
                  '/admin/login',
              }
            );

            break;

          case 'ADMIN_FORBIDDEN':
          case 'FORBIDDEN':
            showOverlay(
              'error',
              'Action not permitted',
              message
            );

            break;

          case 'SERVICE_TEMPORARILY_UNAVAILABLE':
            showOverlay(
              'warning',
              'SaMi temporarily unavailable',
              'SaMi could not safely complete this administrator change. Please retry shortly.'
            );

            break;

          default:
            setMutationError(
              message
            );
        }

        return false;
      }

      await loadAdministrators(
        pagination.page
      );

      setSelectedAdmin(
        null
      );

      setManageMode(
        null
      );

      showOverlay(
        'success',
        'Administrator updated',
        data.message ||
          'The Platform Administrator was updated successfully.'
      );

      return true;
    } catch {
      setMutationError(
        'SaMi could not reach the administrator service.'
      );

      return false;
    } finally {
      setMutating(
        false
      );
    }
  }

  /* ==========================================================
     CONFIRM ROLE
     ========================================================== */

  function confirmRoleChange() {
    if (
      !selectedAdmin
    ) {
      return;
    }

    if (
      selectedRole ===
      selectedAdmin.role
    ) {
      setMutationError(
        'Select a different role.'
      );

      return;
    }

    const target =
      selectedAdmin;

    const nextRole =
      selectedRole;

    showOverlay(
      'warning',
      'Change administrator role?',
      `Change ${target.fullName} from ${roleLabel(
        target.role
      )} to ${roleLabel(
        nextRole
      )}? Existing administrator sessions will be revoked.`,
      {
        label:
          'Change role',

        onClick: () => {
          closeOverlay();

          void lifecycleRequest(
            target,
            {
              action:
                'change_role',

              role:
                nextRole,
            }
          );
        },
      },
      {
        label:
          'Cancel',

        onClick:
          closeOverlay,
      }
    );
  }

  /* ==========================================================
     CONFIRM STATUS
     ========================================================== */

  function confirmStatusChange() {
    if (
      !selectedAdmin
    ) {
      return;
    }

    if (
      selectedStatus ===
      selectedAdmin.status
    ) {
      setMutationError(
        'Select a different status.'
      );

      return;
    }

    const target =
      selectedAdmin;

    const nextStatus =
      selectedStatus;

    let warning =
      `Change ${target.fullName} to ${roleLabel(
        nextStatus
      )}. Existing administrator sessions will be revoked.`;

    if (
      nextStatus ===
      'suspended'
    ) {
      warning =
        `Suspend ${target.fullName}? They will immediately lose Platform Administration access and existing sessions will be revoked.`;
    }

    if (
      nextStatus ===
      'disabled'
    ) {
      warning =
        `Disable ${target.fullName}? They will not be able to access Platform Administration until reactivated. Existing sessions will be revoked.`;
    }

    if (
      nextStatus ===
      'active'
    ) {
      warning =
        `Reactivate ${target.fullName}? They will regain access according to their current administrator role.`;
    }

    showOverlay(
      nextStatus ===
        'active'
        ? 'info'
        : 'warning',
      nextStatus ===
        'active'
        ? 'Reactivate administrator?'
        : nextStatus ===
            'suspended'
          ? 'Suspend administrator?'
          : 'Disable administrator?',
      warning,
      {
        label:
          nextStatus ===
            'active'
            ? 'Reactivate'
            : nextStatus ===
                'suspended'
              ? 'Suspend'
              : 'Disable',

        onClick: () => {
          closeOverlay();

          void lifecycleRequest(
            target,
            {
              action:
                'change_status',

              status:
                nextStatus,
            }
          );
        },
      },
      {
        label:
          'Cancel',

        onClick:
          closeOverlay,
      }
    );
  }

  /* ==========================================================
     CONFIRM UNLOCK
     ========================================================== */

  function confirmUnlock() {
    if (
      !selectedAdmin
    ) {
      return;
    }

    const target =
      selectedAdmin;

    showOverlay(
      'warning',
      'Unlock administrator?',
      `Unlock ${target.fullName}? Failed login counters will be cleared, existing sessions will remain revoked, and they will need to authenticate again.`,
      {
        label:
          'Unlock',

        onClick: () => {
          closeOverlay();

          void lifecycleRequest(
            target,
            {
              action:
                'unlock',
            }
          );
        },
      },
      {
        label:
          'Cancel',

        onClick:
          closeOverlay,
      }
    );
  }

  /* ==========================================================
     DERIVED
     ========================================================== */

  const selectedRoleDescription =
    useMemo(
      () =>
        ROLE_OPTIONS.find(
          item =>
            item.value ===
            selectedRole
        )?.description ||
        '',
      [
        selectedRole,
      ]
    );

  const selectedStatusDescription =
    useMemo(
      () =>
        MUTABLE_STATUS_OPTIONS.find(
          item =>
            item.value ===
            selectedStatus
        )?.description ||
        '',
      [
        selectedStatus,
      ]
    );

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
              Provision, review and securely manage identities that can access SaMi Platform Administration.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFormError('');

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
                      event.target
                        .value
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
                    event.target
                      .value
                  )
              }
              className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="">
                All statuses
              </option>

              {FILTER_STATUS_OPTIONS.map(
                item => (
                  <option
                    key={
                      item
                    }
                    value={
                      item
                    }
                  >
                    {roleLabel(
                      item
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
                    event.target
                      .value
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
              <table className="w-full min-w-[1120px] text-left">
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

                    <th className="px-5 py-4 text-right">
                      Actions
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
                            {
                              admin.fullName
                            }
                          </div>

                          <div className="mt-1 text-xs text-zinc-500">
                            {
                              admin.email
                            }
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

                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openManage(
                                admin
                              )
                            }
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs font-bold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                          >
                            <MoreHorizontal className="h-4 w-4" />

                            Manage
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading &&
            pagination.total >
              0 && (
              <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="text-xs text-zinc-500">
                  Page{' '}
                  {
                    pagination.page
                  }{' '}
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

      {/* ======================================================
          CREATE ADMINISTRATOR
          ====================================================== */}

      {createOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">
                  Add Platform Administrator
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  SaMi creates an invited identity and sends the administrator a verification email.
                </p>
              </div>

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
                aria-label="Close"
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900"
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
                <Field
                  label="First name"
                  value={
                    firstName
                  }
                  onChange={
                    setFirstName
                  }
                  maxLength={
                    120
                  }
                />

                <Field
                  label="Last name"
                  value={
                    lastName
                  }
                  onChange={
                    setLastName
                  }
                  maxLength={
                    120
                  }
                />
              </div>

              <Field
                label="Administrator email"
                type="email"
                value={
                  email
                }
                onChange={
                  setEmail
                }
                maxLength={
                  254
                }
              />

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
                <InlineError>
                  {formError}
                </InlineError>
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
                  className="h-11 rounded-xl border border-zinc-200 px-5 text-sm font-bold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    creating
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
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

      {/* ======================================================
          MANAGE ADMINISTRATOR
          ====================================================== */}

      {selectedAdmin && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/55 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <UserCog className="h-6 w-6" />
                </div>

                <h2 className="mt-4 text-xl font-black">
                  {
                    selectedAdmin.fullName
                  }
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {
                    selectedAdmin.email
                  }
                </p>
              </div>

              <button
                type="button"
                disabled={
                  mutating
                }
                onClick={
                  closeManage
                }
                aria-label="Close"
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* CURRENT STATE */}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StateCard
                label="Role"
                value={
                  roleLabel(
                    selectedAdmin.role
                  )
                }
              />

              <StateCard
                label="Status"
                value={
                  roleLabel(
                    selectedAdmin.status
                  )
                }
              />

              <StateCard
                label="2FA"
                value={
                  selectedAdmin
                    .twoFactorEnabled
                    ? 'Enabled'
                    : 'Pending'
                }
              />
            </div>

            {/* ACTION SELECTOR */}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setManageMode(
                    'role'
                  );

                  setMutationError('');
                }}
                className={[
                  'rounded-2xl border p-4 text-left transition',
                  manageMode ===
                  'role'
                    ? 'border-zinc-950 bg-zinc-50 dark:border-white dark:bg-zinc-900'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900',
                ].join(
                  ' '
                )}
              >
                <Edit3 className="h-5 w-5" />

                <div className="mt-3 text-sm font-bold">
                  Change role
                </div>

                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  Change Platform permissions.
                </div>
              </button>

              <button
                type="button"
                disabled={
                  selectedAdmin.status ===
                  'invited'
                }
                onClick={() => {
                  setManageMode(
                    'status'
                  );

                  setMutationError('');
                }}
                className={[
                  'rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                  manageMode ===
                  'status'
                    ? 'border-zinc-950 bg-zinc-50 dark:border-white dark:bg-zinc-900'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900',
                ].join(
                  ' '
                )}
              >
                <ShieldCheck className="h-5 w-5" />

                <div className="mt-3 text-sm font-bold">
                  Change status
                </div>

                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  Activate, suspend or disable.
                </div>
              </button>

              <button
                type="button"
                disabled={
                  selectedAdmin.status !==
                  'locked'
                }
                onClick={() => {
                  setManageMode(
                    'unlock'
                  );

                  setMutationError('');
                }}
                className={[
                  'rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                  manageMode ===
                  'unlock'
                    ? 'border-zinc-950 bg-zinc-50 dark:border-white dark:bg-zinc-900'
                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900',
                ].join(
                  ' '
                )}
              >
                <LockKeyhole className="h-5 w-5" />

                <div className="mt-3 text-sm font-bold">
                  Unlock
                </div>

                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  Reset authentication lock.
                </div>
              </button>
            </div>

            {/* ROLE */}

            {manageMode ===
              'role' && (
              <div className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                <h3 className="font-bold">
                  Change administrator role
                </h3>

                <select
                  value={
                    selectedRole
                  }
                  onChange={
                    event =>
                      setSelectedRole(
                        event.target
                          .value as
                          PlatformAdminRole
                      )
                  }
                  className="mt-4 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
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
                    selectedRoleDescription
                  }
                </p>

                <button
                  type="button"
                  disabled={
                    mutating ||
                    selectedRole ===
                      selectedAdmin.role
                  }
                  onClick={
                    confirmRoleChange
                  }
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  {mutating && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  Save role
                </button>
              </div>
            )}

            {/* STATUS */}

            {manageMode ===
              'status' && (
              <div className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                <h3 className="font-bold">
                  Change lifecycle status
                </h3>

                <select
                  value={
                    selectedStatus
                  }
                  onChange={
                    event =>
                      setSelectedStatus(
                        event.target
                          .value as
                          | 'active'
                          | 'suspended'
                          | 'disabled'
                      )
                  }
                  className="mt-4 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {MUTABLE_STATUS_OPTIONS.map(
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
                    selectedStatusDescription
                  }
                </p>

                <button
                  type="button"
                  disabled={
                    mutating ||
                    selectedStatus ===
                      selectedAdmin.status
                  }
                  onClick={
                    confirmStatusChange
                  }
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  {mutating && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  Save status
                </button>
              </div>
            )}

            {/* UNLOCK */}

            {manageMode ===
              'unlock' && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
                <h3 className="font-bold">
                  Unlock administrator
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  This clears failed login attempts and removes the current authentication lock. The administrator must sign in again normally.
                </p>

                <button
                  type="button"
                  disabled={
                    mutating
                  }
                  onClick={
                    confirmUnlock
                  }
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  {mutating && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  Unlock Administrator
                </button>
              </div>
            )}

            {mutationError && (
              <div className="mt-5">
                <InlineError>
                  {mutationError}
                </InlineError>
              </div>
            )}

            {selectedAdmin.status ===
              'invited' && (
              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                This administrator is still completing identity setup. They cannot be manually activated from lifecycle management.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SHARED SAMI OVERLAY */}

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
        primaryAction={
          overlay.primaryAction
        }
        secondaryAction={
          overlay.secondaryAction
        }
        onClose={
          closeOverlay
        }
      />
    </>
  );
}

/* ============================================================
   COMPONENTS
   ============================================================ */

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
        <Icon className="h-5 w-5" />
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

function StateCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>

      <div className="mt-2 text-sm font-bold">
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  maxLength,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  maxLength: number;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
      </label>

      <input
        type={
          type
        }
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target.value
            )
        }
        maxLength={
          maxLength
        }
        autoComplete="off"
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
      />
    </div>
  );
}

function InlineError({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
    >
      {children}
    </div>
  );
}