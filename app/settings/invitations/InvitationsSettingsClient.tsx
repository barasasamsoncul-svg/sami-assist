'use client';

import Link from 'next/link';

import {
  Building2,
  Check,
  ChevronDown,
  CirclePlus,
  Clock3,
  Mail,
  Menu,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  X,
  XCircle,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';


/* ================================================================
   TYPES — SHELL
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

  canManage:
    boolean;
};


/* ================================================================
   TYPES — INVITATIONS
   ================================================================ */

type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'revoked'
  | 'expired';


type InvitationMemberType =
  | 'internal'
  | 'portal';


type InvitationActor = {
  id:
    string;

  email:
    string;

  fullName:
    string;
};


type InvitationRole = {
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
    string;

  available:
    boolean;
};


type InvitationCompany = {
  id:
    string;

  name:
    string;

  legalName:
    string | null;

  currency:
    string | null;

  timezone:
    string | null;

  country:
    string | null;

  isDefault:
    boolean;

  isActive:
    boolean;

  archivedAt:
    string | null;

  available:
    boolean;
};


type WorkspaceInvitation = {
  id:
    string;

  tenantId:
    string;

  workspaceName:
    string;

  email:
    string;

  memberType:
    InvitationMemberType;

  status:
    InvitationStatus;

  message:
    string | null;

  roles:
    InvitationRole[];

  companies:
    InvitationCompany[];

  defaultCompanyId:
    string | null;

  invitedBy:
    InvitationActor;

  acceptedBy:
    InvitationActor | null;

  revokedBy:
    InvitationActor | null;

  expiresAt:
    string;

  lastSentAt:
    string | null;

  acceptedAt:
    string | null;

  revokedAt:
    string | null;

  createdAt:
    string;

  updatedAt:
    string;
};


/* ================================================================
   TYPES — OPTIONS
   ================================================================ */

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

  permissionCount:
    number;
};


type CompanyOption = {
  id:
    string;

  name:
    string;

  legalName:
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
};


type InvitationFormOptions = {
  roles:
    AssignableRole[];

  companies:
    CompanyOption[];

  defaultRoleId:
    string | null;

  defaultCompanyId:
    string;
};


/* ================================================================
   API TYPES
   ================================================================ */

type InvitationsResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  invitations?:
    WorkspaceInvitation[];

  invitation?:
    WorkspaceInvitation;

  emailSent?:
    boolean;
};


type OptionsResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  options?:
    InvitationFormOptions;
};


/* ================================================================
   FILTER
   ================================================================ */

type StatusFilter =
  | 'all'
  | InvitationStatus;


/* ================================================================
   FORM
   ================================================================ */

type InvitationFormState = {
  email:
    string;

  memberType:
    InvitationMemberType;

  selectedRoles:
    Set<string>;

  selectedCompanies:
    Set<string>;

  defaultCompanyId:
    string;

  message:
    string;

  expiresInDays:
    number;
};


const EMPTY_FORM:
  InvitationFormState = {
  email:
    '',

  memberType:
    'internal',

  selectedRoles:
    new Set(),

  selectedCompanies:
    new Set(),

  defaultCompanyId:
    '',

  message:
    '',

  expiresInDays:
    7,
};


/* ================================================================
   HELPERS
   ================================================================ */

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
    return '—';
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
    return '—';
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


function shortDate(
  value:
    string | null,
) {
  if (
    !value
  ) {
    return '—';
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
    return '—';
  }


  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',
    },
  ).format(
    date,
  );
}


function invitationDisplayName(
  invitation:
    WorkspaceInvitation,
) {
  return invitation.email;
}


function statusClasses(
  status:
    InvitationStatus,
) {
  switch (
    status
  ) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20';


    case 'accepted':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20';


    case 'revoked':
      return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20';


    case 'expired':
      return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10';
  }
}


function companySummary(
  invitation:
    WorkspaceInvitation,
) {
  const names =
    invitation.companies
      .filter(
        company =>
          company.available,
      )
      .map(
        company =>
          company.name,
      );


  if (
    names.length ===
      0
  ) {
    return 'No company';
  }


  if (
    names.length ===
      1
  ) {
    return names[0];
  }


  return `${names[0]} +${names.length - 1}`;
}


function roleSummary(
  invitation:
    WorkspaceInvitation,
) {
  if (
    invitation.memberType ===
      'portal'
  ) {
    return 'Portal';
  }


  const roles =
    invitation.roles
      .filter(
        role =>
          role.available,
      )
      .map(
        role =>
          role.name,
      );


  if (
    roles.length ===
      0
  ) {
    return 'No role';
  }


  if (
    roles.length ===
      1
  ) {
    return roles[0];
  }


  return `${roles[0]} +${roles.length - 1}`;
}


function cloneForm(
  form:
    InvitationFormState,
): InvitationFormState {
  return {
    ...form,

    selectedRoles:
      new Set(
        form.selectedRoles,
      ),

    selectedCompanies:
      new Set(
        form.selectedCompanies,
      ),
  };
}


/* ================================================================
   COMPONENT
   ================================================================ */

export default function InvitationsSettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  canManage,
}: Props) {
  /* ============================================================
     SIDEBAR
     ============================================================ */

  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(
      false,
    );


  /* ============================================================
     LIST STATE
     ============================================================ */

  const [
    invitations,
    setInvitations,
  ] =
    useState<
      WorkspaceInvitation[]
    >(
      [],
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
    search,
    setSearch,
  ] =
    useState(
      '',
    );


  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<StatusFilter>(
      'all',
    );


  /* ============================================================
     DETAIL
     ============================================================ */

  const [
    selectedInvitation,
    setSelectedInvitation,
  ] =
    useState<
      WorkspaceInvitation | null
    >(
      null,
    );


  /* ============================================================
     ACTION MENU
     ============================================================ */

  const [
    menuInvitationId,
    setMenuInvitationId,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const menuRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  /* ============================================================
     FORM
     ============================================================ */

  const [
    formOpen,
    setFormOpen,
  ] =
    useState(
      false,
    );


  const [
    formOptions,
    setFormOptions,
  ] =
    useState<
      InvitationFormOptions | null
    >(
      null,
    );


  const [
    formOptionsLoading,
    setFormOptionsLoading,
  ] =
    useState(
      false,
    );


  const [
    form,
    setForm,
  ] =
    useState<InvitationFormState>(
      cloneForm(
        EMPTY_FORM,
      ),
    );


  const [
    formError,
    setFormError,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );


  /* ============================================================
     ROW ACTION
     ============================================================ */

  const [
    actionInvitationId,
    setActionInvitationId,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    actionType,
    setActionType,
  ] =
    useState<
      'resend'
      | 'revoke'
      | null
    >(
      null,
    );


  /* ============================================================
     LOAD
     ============================================================ */

  const loadInvitations =
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
              '/api/workspace/invitations?status=all&limit=200',
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
            await readJson<InvitationsResponse>(
              response,
            );


          if (
            !response.ok ||
            !data?.success ||
            !data.invitations
          ) {
            throw new Error(
              data?.error ||
              'Invitations could not be loaded.',
            );
          }


          setInvitations(
            data.invitations,
          );


          setSelectedInvitation(
            current => {
              if (
                !current
              ) {
                return null;
              }


              return (
                data.invitations
                  ?.find(
                    invitation =>
                      invitation.id ===
                      current.id,
                  ) ||
                null
              );
            },
          );
        } catch (
          requestError
        ) {
          setError(
            requestError instanceof
              Error
              ? requestError.message
              : 'Invitations could not be loaded.',
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
      void loadInvitations();
    },

    [
      loadInvitations,
    ],
  );


  /* ============================================================
     OUTSIDE ACTION MENU
     ============================================================ */

  useEffect(
    () => {
      if (
        !menuInvitationId
      ) {
        return;
      }


      function closeMenu(
        event:
          MouseEvent,
      ) {
        if (
          menuRef.current &&
          !menuRef.current.contains(
            event.target as Node,
          )
        ) {
          setMenuInvitationId(
            null,
          );
        }
      }


      document.addEventListener(
        'mousedown',
        closeMenu,
      );


      return () => {
        document.removeEventListener(
          'mousedown',
          closeMenu,
        );
      };
    },

    [
      menuInvitationId,
    ],
  );


  /* ============================================================
     SUMMARY
     ============================================================ */

  const summary =
    useMemo(
      () => {
        const result = {
          total:
            invitations.length,

          pending:
            0,

          accepted:
            0,

          expired:
            0,

          revoked:
            0,
        };


        for (
          const invitation
          of invitations
        ) {
          result[
            invitation.status
          ] +=
            1;
        }


        return result;
      },

      [
        invitations,
      ],
    );


  /* ============================================================
     FILTER
     ============================================================ */

  const filteredInvitations =
    useMemo(
      () => {
        const query =
          normalize(
            search,
          );


        return invitations.filter(
          invitation => {
            if (
              statusFilter !==
                'all' &&
              invitation.status !==
                statusFilter
            ) {
              return false;
            }


            if (
              !query
            ) {
              return true;
            }


            const haystack =
              normalize(
                [
                  invitation.email,

                  invitation.memberType,

                  invitation.status,

                  invitation.invitedBy
                    .fullName,

                  invitation.roles
                    .map(
                      role =>
                        role.name,
                    )
                    .join(
                      ' ',
                    ),

                  invitation.companies
                    .map(
                      company =>
                        company.name,
                    )
                    .join(
                      ' ',
                    ),
                ].join(
                  ' ',
                ),
              );


            return haystack.includes(
              query,
            );
          },
        );
      },

      [
        invitations,
        search,
        statusFilter,
      ],
    );


  /* ============================================================
     OPTIONS
     ============================================================ */

  async function loadFormOptions() {
    if (
      formOptions
    ) {
      return formOptions;
    }


    setFormOptionsLoading(
      true,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/invitations/options',
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
        await readJson<OptionsResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success ||
        !data.options
      ) {
        throw new Error(
          data?.error ||
          'Invitation options could not be loaded.',
        );
      }


      setFormOptions(
        data.options,
      );


      return data.options;
    } finally {
      setFormOptionsLoading(
        false,
      );
    }
  }


  /* ============================================================
     OPEN NEW
     ============================================================ */

  async function openNewInvitation() {
    if (
      !canManage
    ) {
      return;
    }


    setFormError(
      null,
    );


    setSuccess(
      null,
    );


    setFormOpen(
      true,
    );


    try {
      const options =
        await loadFormOptions();


      const roles =
        new Set<string>();


      if (
        options.defaultRoleId
      ) {
        roles.add(
          options.defaultRoleId,
        );
      }


      const companies =
        new Set<string>();


      if (
        options.defaultCompanyId
      ) {
        companies.add(
          options.defaultCompanyId,
        );
      }


      setForm({
        email:
          '',

        memberType:
          'internal',

        selectedRoles:
          roles,

        selectedCompanies:
          companies,

        defaultCompanyId:
          options.defaultCompanyId,

        message:
          '',

        expiresInDays:
          7,
      });
    } catch (
      requestError
    ) {
      setFormError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Invitation options could not be loaded.',
      );
    }
  }


  function closeForm() {
    if (
      saving
    ) {
      return;
    }


    setFormOpen(
      false,
    );


    setFormError(
      null,
    );
  }


  /* ============================================================
     MEMBER TYPE
     ============================================================ */

  function setMemberType(
    memberType:
      InvitationMemberType,
  ) {
    setForm(
      current => {
        if (
          memberType ===
            'portal'
        ) {
          return {
            ...current,

            memberType,

            selectedRoles:
              new Set(),
          };
        }


        const nextRoles =
          new Set(
            current.selectedRoles,
          );


        if (
          nextRoles.size ===
            0 &&
          formOptions
            ?.defaultRoleId
        ) {
          nextRoles.add(
            formOptions.defaultRoleId,
          );
        }


        return {
          ...current,

          memberType,

          selectedRoles:
            nextRoles,
        };
      },
    );
  }


  /* ============================================================
     ROLE SELECTION
     ============================================================ */

  function toggleRole(
    roleId:
      string,
  ) {
    if (
      form.memberType !==
        'internal'
    ) {
      return;
    }


    setForm(
      current => {
        const selected =
          new Set(
            current.selectedRoles,
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

          selectedRoles:
            selected,
        };
      },
    );
  }


  /* ============================================================
     COMPANY SELECTION
     ============================================================ */

  function toggleCompany(
    companyId:
      string,
  ) {
    setForm(
      current => {
        const selected =
          new Set(
            current.selectedCompanies,
          );


        if (
          selected.has(
            companyId,
          )
        ) {
          /*
           * Keep at least one company.
           */
          if (
            selected.size ===
              1
          ) {
            return current;
          }


          selected.delete(
            companyId,
          );
        } else {
          selected.add(
            companyId,
          );
        }


        let defaultCompanyId =
          current.defaultCompanyId;


        if (
          !selected.has(
            defaultCompanyId,
          )
        ) {
          defaultCompanyId =
            [
              ...selected,
            ][0] ||
            '';
        }


        return {
          ...current,

          selectedCompanies:
            selected,

          defaultCompanyId,
        };
      },
    );
  }


  /* ============================================================
     CREATE
     ============================================================ */

  async function createInvitation() {
    if (
      saving ||
      !formOptions
    ) {
      return;
    }


    setFormError(
      null,
    );


    const email =
      form.email
        .trim()
        .toLowerCase();


    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      )
    ) {
      setFormError(
        'Enter a valid email address.',
      );

      return;
    }


    if (
      form.memberType ===
        'internal' &&
      form.selectedRoles.size ===
        0
    ) {
      setFormError(
        'Select at least one role for an internal user.',
      );

      return;
    }


    if (
      form.selectedCompanies.size ===
        0
    ) {
      setFormError(
        'Select at least one company.',
      );

      return;
    }


    if (
      !form.defaultCompanyId ||
      !form.selectedCompanies.has(
        form.defaultCompanyId,
      )
    ) {
      setFormError(
        'Choose a valid default company.',
      );

      return;
    }


    setSaving(
      true,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/invitations',
          {
            method:
              'POST',

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
                email,

                memberType:
                  form.memberType,

                roleIds:
                  form.memberType ===
                    'internal'
                    ? [
                        ...form.selectedRoles,
                      ]
                    : [],

                companyIds: [
                  ...form.selectedCompanies,
                ],

                defaultCompanyId:
                  form.defaultCompanyId,

                message:
                  form.message,

                expiresInDays:
                  form.expiresInDays,
              }),
          },
        );


      const data =
        await readJson<InvitationsResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          'Invitation could not be created.',
        );
      }


      setFormOpen(
        false,
      );


      setForm(
        cloneForm(
          EMPTY_FORM,
        ),
      );


      setSuccess(
        data.emailSent ===
          false
          ? 'Invitation created. Email delivery is not configured.'
          : 'Invitation sent successfully.',
      );


      await loadInvitations(
        true,
      );
    } catch (
      requestError
    ) {
      setFormError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Invitation could not be created.',
      );
    } finally {
      setSaving(
        false,
      );
    }
  }


  /* ============================================================
     ACTION
     ============================================================ */

  async function runInvitationAction(
    invitation:
      WorkspaceInvitation,

    action:
      'resend'
      | 'revoke',
  ) {
    if (
      !canManage ||
      actionInvitationId
    ) {
      return;
    }


    if (
      invitation.status !==
        'pending'
    ) {
      return;
    }


    if (
      action ===
        'revoke'
    ) {
      const confirmed =
        window.confirm(
          `Revoke the invitation for ${invitation.email}?`,
        );


      if (
        !confirmed
      ) {
        return;
      }
    }


    setMenuInvitationId(
      null,
    );


    setError(
      null,
    );


    setSuccess(
      null,
    );


    setActionInvitationId(
      invitation.id,
    );


    setActionType(
      action,
    );


    try {
      const response =
        await fetch(
          '/api/workspace/invitations',
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
                invitationId:
                  invitation.id,

                action,
              }),
          },
        );


      const data =
        await readJson<InvitationsResponse>(
          response,
        );


      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          `Invitation could not be ${action ===
            'resend'
            ? 'resent'
            : 'revoked'}.`,
        );
      }


      setSuccess(
        data.message ||
        (
          action ===
            'resend'
            ? 'Invitation resent.'
            : 'Invitation revoked.'
        ),
      );


      if (
        data.invitation &&
        selectedInvitation
          ?.id ===
          data.invitation.id
      ) {
        setSelectedInvitation(
          data.invitation,
        );
      }


      await loadInvitations(
        true,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'Invitation action failed.',
      );
    } finally {
      setActionInvitationId(
        null,
      );


      setActionType(
        null,
      );
    }
  }


  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <main className="min-h-screen bg-[#F6F7F9] text-slate-950 dark:bg-[#090B10] dark:text-white">

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


      <div className="min-w-0 lg:pl-[286px]">

        {/* ======================================================
            HEADER
            ====================================================== */}

        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/90">

          <div className="flex h-[68px] items-center gap-3 px-4 sm:px-6 lg:px-8">

            <button
              type="button"
              aria-label="Open navigation"
              onClick={
                () =>
                  setSidebarOpen(
                    true,
                  )
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>


            <div className="min-w-0">

              <h1 className="truncate text-sm font-bold">
                Invitations
              </h1>

              <p className="hidden truncate text-[10px] text-slate-400 sm:block">
                Manage pending and historical workspace invitations
              </p>

            </div>


            <div className="ml-auto flex items-center gap-2">

              <button
                type="button"
                aria-label="Refresh invitations"
                disabled={
                  refreshing
                }
                onClick={
                  () =>
                    void loadInvitations(
                      true,
                    )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.07]"
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


              {canManage && (
                <button
                  type="button"
                  onClick={
                    () =>
                      void openNewInvitation()
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-bold text-white transition hover:bg-blue-700"
                >
                  <CirclePlus className="h-4 w-4" />

                  <span className="hidden sm:inline">
                    New Invitation
                  </span>

                  <span className="sm:hidden">
                    New
                  </span>
                </button>
              )}

            </div>

          </div>

        </header>


        {/* ======================================================
            PAGE
            ====================================================== */}

        <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 lg:px-8 lg:py-6">

          {/* ALERTS */}

          {error && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">

              <span>
                {error}
              </span>


              <button
                type="button"
                onClick={
                  () =>
                    setError(
                      null,
                    )
                }
              >
                <X className="h-4 w-4" />
              </button>

            </div>
          )}


          {success && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">

              <span>
                {success}
              </span>


              <button
                type="button"
                onClick={
                  () =>
                    setSuccess(
                      null,
                    )
                }
              >
                <X className="h-4 w-4" />
              </button>

            </div>
          )}


          {/* ====================================================
              ODOO-STYLE CONTROL BAR
              ==================================================== */}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#11141A]">

            <div className="border-b border-slate-200 px-3 py-3 dark:border-white/10 sm:px-4">

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">

                {/* STATUS */}

                <div className="flex min-w-0 gap-1 overflow-x-auto">

                  <FilterButton
                    label="All"
                    count={
                      summary.total
                    }
                    active={
                      statusFilter ===
                      'all'
                    }
                    onClick={
                      () =>
                        setStatusFilter(
                          'all',
                        )
                    }
                  />


                  <FilterButton
                    label="Pending"
                    count={
                      summary.pending
                    }
                    active={
                      statusFilter ===
                      'pending'
                    }
                    onClick={
                      () =>
                        setStatusFilter(
                          'pending',
                        )
                    }
                  />


                  <FilterButton
                    label="Accepted"
                    count={
                      summary.accepted
                    }
                    active={
                      statusFilter ===
                      'accepted'
                    }
                    onClick={
                      () =>
                        setStatusFilter(
                          'accepted',
                        )
                    }
                  />


                  <FilterButton
                    label="Expired"
                    count={
                      summary.expired
                    }
                    active={
                      statusFilter ===
                      'expired'
                    }
                    onClick={
                      () =>
                        setStatusFilter(
                          'expired',
                        )
                    }
                  />


                  <FilterButton
                    label="Revoked"
                    count={
                      summary.revoked
                    }
                    active={
                      statusFilter ===
                      'revoked'
                    }
                    onClick={
                      () =>
                        setStatusFilter(
                          'revoked',
                        )
                    }
                  />

                </div>


                {/* SEARCH */}

                <div className="relative min-w-0 flex-1 lg:ml-auto lg:max-w-sm">

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
                    placeholder="Search invitations..."
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04] dark:focus:bg-white/[0.06]"
                  />


                  {search && (
                    <button
                      type="button"
                      onClick={
                        () =>
                          setSearch(
                            '',
                          )
                      }
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}

                </div>

              </div>

            </div>


            {/* ==================================================
                DESKTOP LIST
                ================================================== */}

            <div className="hidden overflow-x-auto md:block">

              <table className="w-full min-w-[900px] border-collapse">

                <thead>

                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left dark:border-white/10 dark:bg-white/[0.025]">

                    <TableHeader>
                      Email
                    </TableHeader>

                    <TableHeader>
                      Type
                    </TableHeader>

                    <TableHeader>
                      Role
                    </TableHeader>

                    <TableHeader>
                      Company
                    </TableHeader>

                    <TableHeader>
                      Status
                    </TableHeader>

                    <TableHeader>
                      Sent
                    </TableHeader>

                    <TableHeader>
                      Expires
                    </TableHeader>

                    <th className="w-12 px-2 py-2" />

                  </tr>

                </thead>


                <tbody>

                  {loading ? (
                    <LoadingRows />
                  ) : filteredInvitations.length ===
                    0 ? (
                    <tr>

                      <td
                        colSpan={
                          8
                        }
                        className="px-4 py-16 text-center"
                      >
                        <EmptyInvitations />
                      </td>

                    </tr>
                  ) : (
                    filteredInvitations.map(
                      invitation => (
                        <tr
                          key={
                            invitation.id
                          }
                          onClick={
                            () =>
                              setSelectedInvitation(
                                invitation,
                              )
                          }
                          className="cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-blue-50/40 dark:border-white/[0.06] dark:hover:bg-blue-500/[0.04]"
                        >

                          <td className="px-4 py-3">

                            <div className="flex min-w-0 items-center gap-2.5">

                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                                <Mail className="h-3.5 w-3.5" />
                              </div>


                              <div className="min-w-0">

                                <p className="max-w-[260px] truncate text-xs font-semibold">
                                  {invitation.email}
                                </p>

                                <p className="mt-0.5 max-w-[260px] truncate text-[9px] text-slate-400">
                                  by {invitation.invitedBy.fullName ||
                                    invitation.invitedBy.email}
                                </p>

                              </div>

                            </div>

                          </td>


                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                            {invitation.memberType ===
                              'internal'
                              ? 'Internal'
                              : 'Portal'}
                          </td>


                          <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                            {roleSummary(
                              invitation,
                            )}
                          </td>


                          <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                            {companySummary(
                              invitation,
                            )}
                          </td>


                          <td className="px-4 py-3">

                            <StatusBadge
                              status={
                                invitation.status
                              }
                            />

                          </td>


                          <td className="whitespace-nowrap px-4 py-3 text-[10px] text-slate-500 dark:text-slate-400">
                            {shortDate(
                              invitation.lastSentAt ||
                              invitation.createdAt,
                            )}
                          </td>


                          <td className="whitespace-nowrap px-4 py-3 text-[10px] text-slate-500 dark:text-slate-400">
                            {shortDate(
                              invitation.expiresAt,
                            )}
                          </td>


                          <td
                            className="relative px-2 py-3"
                            onClick={
                              event =>
                                event.stopPropagation()
                            }
                          >

                            <ActionMenu
                              invitation={
                                invitation
                              }

                              canManage={
                                canManage
                              }

                              open={
                                menuInvitationId ===
                                invitation.id
                              }

                              loading={
                                actionInvitationId ===
                                invitation.id
                              }

                              actionType={
                                actionInvitationId ===
                                  invitation.id
                                  ? actionType
                                  : null
                              }

                              menuRef={
                                menuInvitationId ===
                                  invitation.id
                                  ? menuRef
                                  : undefined
                              }

                              onToggle={
                                () =>
                                  setMenuInvitationId(
                                    current =>
                                      current ===
                                        invitation.id
                                        ? null
                                        : invitation.id,
                                  )
                              }

                              onOpen={
                                () => {
                                  setSelectedInvitation(
                                    invitation,
                                  );

                                  setMenuInvitationId(
                                    null,
                                  );
                                }
                              }

                              onResend={
                                () =>
                                  void runInvitationAction(
                                    invitation,
                                    'resend',
                                  )
                              }

                              onRevoke={
                                () =>
                                  void runInvitationAction(
                                    invitation,
                                    'revoke',
                                  )
                              }
                            />

                          </td>

                        </tr>
                      ),
                    )
                  )}

                </tbody>

              </table>

            </div>


            {/* ==================================================
                MOBILE LIST
                ================================================== */}

            <div className="divide-y divide-slate-100 md:hidden dark:divide-white/[0.07]">

              {loading ? (
                <MobileLoadingRows />
              ) : filteredInvitations.length ===
                0 ? (
                <div className="px-4 py-14">
                  <EmptyInvitations />
                </div>
              ) : (
                filteredInvitations.map(
                  invitation => (
                    <button
                      key={
                        invitation.id
                      }
                      type="button"
                      onClick={
                        () =>
                          setSelectedInvitation(
                            invitation,
                          )
                      }
                      className="flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    >

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                        <Mail className="h-4 w-4" />
                      </div>


                      <div className="min-w-0 flex-1">

                        <div className="flex items-start gap-2">

                          <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                            {invitation.email}
                          </p>

                          <StatusBadge
                            status={
                              invitation.status
                            }
                          />

                        </div>


                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">

                          <span>
                            {invitation.memberType ===
                              'internal'
                              ? roleSummary(
                                  invitation,
                                )
                              : 'Portal'}
                          </span>

                          <span>
                            •
                          </span>

                          <span className="truncate">
                            {companySummary(
                              invitation,
                            )}
                          </span>

                        </div>


                        <p className="mt-1 text-[9px] text-slate-400">
                          {shortDate(
                            invitation.createdAt,
                          )}
                        </p>

                      </div>

                    </button>
                  ),
                )
              )}

            </div>


            {/* FOOTER */}

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-[10px] text-slate-400 dark:border-white/10">

              <span>
                {filteredInvitations.length}{' '}
                {filteredInvitations.length ===
                  1
                  ? 'invitation'
                  : 'invitations'}
              </span>


              <Link
                href="/settings/users"
                className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                View Users
              </Link>

            </div>

          </section>

        </div>

      </div>


      {/* ========================================================
          DETAIL DRAWER
          ======================================================== */}

      {selectedInvitation && (
        <InvitationDetailDrawer
          invitation={
            selectedInvitation
          }

          canManage={
            canManage
          }

          loading={
            actionInvitationId ===
            selectedInvitation.id
          }

          actionType={
            actionInvitationId ===
              selectedInvitation.id
              ? actionType
              : null
          }

          onClose={
            () =>
              setSelectedInvitation(
                null,
              )
          }

          onResend={
            () =>
              void runInvitationAction(
                selectedInvitation,
                'resend',
              )
          }

          onRevoke={
            () =>
              void runInvitationAction(
                selectedInvitation,
                'revoke',
              )
          }
        />
      )}


      {/* ========================================================
          NEW INVITATION DRAWER
          ======================================================== */}

      {formOpen && (
        <NewInvitationDrawer
          form={
            form
          }

          options={
            formOptions
          }

          loadingOptions={
            formOptionsLoading
          }

          saving={
            saving
          }

          error={
            formError
          }

          onClose={
            closeForm
          }

          onEmailChange={
            email =>
              setForm(
                current => ({
                  ...current,
                  email,
                }),
              )
          }

          onMemberTypeChange={
            setMemberType
          }

          onToggleRole={
            toggleRole
          }

          onToggleCompany={
            toggleCompany
          }

          onDefaultCompanyChange={
            defaultCompanyId =>
              setForm(
                current => ({
                  ...current,
                  defaultCompanyId,
                }),
              )
          }

          onMessageChange={
            message =>
              setForm(
                current => ({
                  ...current,
                  message,
                }),
              )
          }

          onExpiryChange={
            expiresInDays =>
              setForm(
                current => ({
                  ...current,
                  expiresInDays,
                }),
              )
          }

          onSubmit={
            () =>
              void createInvitation()
          }
        />
      )}

    </main>
  );
}


/* ================================================================
   FILTER BUTTON
   ================================================================ */

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label:
    string;

  count:
    number;

  active:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition',

        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]',
      ].join(
        ' ',
      )}
    >
      {label}

      <span
        className={[
          'rounded px-1.5 py-0.5 text-[8px]',

          active
            ? 'bg-white/15 text-white'
            : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400',
        ].join(
          ' ',
        )}
      >
        {count}
      </span>
    </button>
  );
}


/* ================================================================
   TABLE
   ================================================================ */

function TableHeader({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <th className="whitespace-nowrap px-4 py-2 text-[9px] font-bold uppercase tracking-[0.07em] text-slate-400">
      {children}
    </th>
  );
}


/* ================================================================
   STATUS
   ================================================================ */

function StatusBadge({
  status,
}: {
  status:
    InvitationStatus;
}) {
  return (
    <span
      className={[
        'inline-flex rounded-md px-2 py-1 text-[9px] font-bold ring-1 ring-inset',

        statusClasses(
          status,
        ),
      ].join(
        ' ',
      )}
    >
      {formatLabel(
        status,
      )}
    </span>
  );
}


/* ================================================================
   ACTION MENU
   ================================================================ */

function ActionMenu({
  invitation,
  canManage,
  open,
  loading,
  actionType,
  menuRef,
  onToggle,
  onOpen,
  onResend,
  onRevoke,
}: {
  invitation:
    WorkspaceInvitation;

  canManage:
    boolean;

  open:
    boolean;

  loading:
    boolean;

  actionType:
    'resend'
    | 'revoke'
    | null;

  menuRef?:
    React.RefObject<HTMLDivElement | null>;

  onToggle:
    () => void;

  onOpen:
    () => void;

  onResend:
    () => void;

  onRevoke:
    () => void;
}) {
  return (
    <div
      ref={
        menuRef
      }
      className="relative"
    >

      <button
        type="button"
        disabled={
          loading
        }
        onClick={
          onToggle
        }
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
      >
        {loading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>


      {open && (
        <div className="absolute right-0 top-9 z-40 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#15181F]">

          <MenuAction
            icon={
              Mail
            }
            label="Open"
            onClick={
              onOpen
            }
          />


          {canManage &&
            invitation.status ===
              'pending' && (
              <>
                <MenuAction
                  icon={
                    RotateCcw
                  }
                  label="Resend"
                  onClick={
                    onResend
                  }
                />

                <MenuAction
                  icon={
                    XCircle
                  }
                  label="Revoke"
                  danger
                  onClick={
                    onRevoke
                  }
                />
              </>
            )}

        </div>
      )}

    </div>
  );
}


function MenuAction({
  icon:
    Icon,
  label,
  danger =
    false,
  onClick,
}: {
  icon:
    typeof Mail;

  label:
    string;

  danger?:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] font-medium transition',

        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]',
      ].join(
        ' ',
      )}
    >
      <Icon className="h-3.5 w-3.5" />

      {label}
    </button>
  );
}


/* ================================================================
   DETAIL DRAWER
   ================================================================ */

function InvitationDetailDrawer({
  invitation,
  canManage,
  loading,
  actionType,
  onClose,
  onResend,
  onRevoke,
}: {
  invitation:
    WorkspaceInvitation;

  canManage:
    boolean;

  loading:
    boolean;

  actionType:
    'resend'
    | 'revoke'
    | null;

  onClose:
    () => void;

  onResend:
    () => void;

  onRevoke:
    () => void;
}) {
  return (
    <DrawerShell
      title="Invitation"
      subtitle={
        invitation.email
      }
      onClose={
        onClose
      }
    >

      <div className="space-y-5">

        {/* STATUS */}

        <div className="flex items-center justify-between">

          <StatusBadge
            status={
              invitation.status
            }
          />


          {canManage &&
            invitation.status ===
              'pending' && (
              <div className="flex gap-2">

                <button
                  type="button"
                  disabled={
                    loading
                  }
                  onClick={
                    onResend
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[10px] font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/[0.06]"
                >
                  {loading &&
                  actionType ===
                    'resend' ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}

                  Resend
                </button>


                <button
                  type="button"
                  disabled={
                    loading
                  }
                  onClick={
                    onRevoke
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-2.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  {loading &&
                  actionType ===
                    'revoke' ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}

                  Revoke
                </button>

              </div>
            )}

        </div>


        {/* GENERAL */}

        <DetailSection
          title="General"
        >

          <DetailRow
            label="Email"
            value={
              invitation.email
            }
          />

          <DetailRow
            label="User type"
            value={
              invitation.memberType ===
                'internal'
                ? 'Internal User'
                : 'Portal User'
            }
          />

          <DetailRow
            label="Invited by"
            value={
              invitation.invitedBy
                .fullName ||
              invitation.invitedBy
                .email
            }
          />

          <DetailRow
            label="Created"
            value={
              formatDate(
                invitation.createdAt,
              )
            }
          />

          <DetailRow
            label="Last sent"
            value={
              formatDate(
                invitation.lastSentAt,
              )
            }
          />

          <DetailRow
            label="Expires"
            value={
              formatDate(
                invitation.expiresAt,
              )
            }
          />

        </DetailSection>


        {/* ROLES */}

        <DetailSection
          title="Roles"
        >

          {invitation.memberType ===
            'portal' ? (
            <p className="text-xs text-slate-400">
              Portal users do not receive internal workspace roles.
            </p>
          ) : invitation.roles.length ===
            0 ? (
            <p className="text-xs text-slate-400">
              No roles assigned.
            </p>
          ) : (
            <div className="space-y-1.5">

              {invitation.roles.map(
                role => (
                  <div
                    key={
                      role.id
                    }
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10"
                  >

                    <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />


                    <div className="min-w-0 flex-1">

                      <p className="truncate text-xs font-semibold">
                        {role.name}
                      </p>

                      {role.description && (
                        <p className="mt-0.5 truncate text-[9px] text-slate-400">
                          {role.description}
                        </p>
                      )}

                    </div>


                    {!role.available && (
                      <span className="text-[9px] font-semibold text-red-500">
                        Unavailable
                      </span>
                    )}

                  </div>
                ),
              )}

            </div>
          )}

        </DetailSection>


        {/* COMPANIES */}

        <DetailSection
          title="Companies"
        >

          <div className="space-y-1.5">

            {invitation.companies.map(
              company => (
                <div
                  key={
                    company.id
                  }
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10"
                >

                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />


                  <div className="min-w-0 flex-1">

                    <p className="truncate text-xs font-semibold">
                      {company.name}
                    </p>

                    <p className="mt-0.5 text-[9px] text-slate-400">
                      {[
                        company.country,
                        company.currency,
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(
                          ' · ',
                        )}
                    </p>

                  </div>


                  {company.isDefault && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[8px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                      DEFAULT
                    </span>
                  )}

                </div>
              ),
            )}

          </div>

        </DetailSection>


        {/* MESSAGE */}

        {invitation.message && (
          <DetailSection
            title="Message"
          >

            <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">
              {invitation.message}
            </p>

          </DetailSection>
        )}


        {/* COMPLETION */}

        {invitation.acceptedAt && (
          <DetailSection
            title="Acceptance"
          >

            <DetailRow
              label="Accepted"
              value={
                formatDate(
                  invitation.acceptedAt,
                )
              }
            />

            <DetailRow
              label="Accepted by"
              value={
                invitation.acceptedBy
                  ?.fullName ||
                invitation.acceptedBy
                  ?.email ||
                '—'
              }
            />

          </DetailSection>
        )}


        {invitation.revokedAt && (
          <DetailSection
            title="Revocation"
          >

            <DetailRow
              label="Revoked"
              value={
                formatDate(
                  invitation.revokedAt,
                )
              }
            />

            <DetailRow
              label="Revoked by"
              value={
                invitation.revokedBy
                  ?.fullName ||
                invitation.revokedBy
                  ?.email ||
                '—'
              }
            />

          </DetailSection>
        )}

      </div>

    </DrawerShell>
  );
}


/* ================================================================
   NEW INVITATION DRAWER
   ================================================================ */

function NewInvitationDrawer({
  form,
  options,
  loadingOptions,
  saving,
  error,
  onClose,
  onEmailChange,
  onMemberTypeChange,
  onToggleRole,
  onToggleCompany,
  onDefaultCompanyChange,
  onMessageChange,
  onExpiryChange,
  onSubmit,
}: {
  form:
    InvitationFormState;

  options:
    InvitationFormOptions | null;

  loadingOptions:
    boolean;

  saving:
    boolean;

  error:
    string | null;

  onClose:
    () => void;

  onEmailChange:
    (
      email:
        string,
    ) => void;

  onMemberTypeChange:
    (
      memberType:
        InvitationMemberType,
    ) => void;

  onToggleRole:
    (
      roleId:
        string,
    ) => void;

  onToggleCompany:
    (
      companyId:
        string,
    ) => void;

  onDefaultCompanyChange:
    (
      companyId:
        string,
    ) => void;

  onMessageChange:
    (
      message:
        string,
    ) => void;

  onExpiryChange:
    (
      days:
        number,
    ) => void;

  onSubmit:
    () => void;
}) {
  return (
    <DrawerShell
      title="New Invitation"
      subtitle="Invite a user to this workspace"
      onClose={
        onClose
      }
    >

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}


      {loadingOptions &&
      !options ? (
        <div className="flex min-h-[240px] items-center justify-center">

          <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />

        </div>
      ) : options ? (
        <div className="space-y-5">

          {/* EMAIL */}

          <FormSection
            title="User"
          >

            <label className="block">

              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Email
              </span>

              <div className="relative mt-1.5">

                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  type="email"
                  autoComplete="email"
                  value={
                    form.email
                  }
                  onChange={
                    event =>
                      onEmailChange(
                        event.target.value,
                      )
                  }
                  placeholder="name@company.com"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04]"
                />

              </div>

            </label>


            <div className="mt-4">

              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                User type
              </span>


              <div className="mt-2 grid grid-cols-2 gap-2">

                <TypeOption
                  icon={
                    Users
                  }
                  title="Internal"
                  description="Workspace user"
                  selected={
                    form.memberType ===
                    'internal'
                  }
                  onClick={
                    () =>
                      onMemberTypeChange(
                        'internal',
                      )
                  }
                />


                <TypeOption
                  icon={
                    UserRound
                  }
                  title="Portal"
                  description="External access"
                  selected={
                    form.memberType ===
                    'portal'
                  }
                  onClick={
                    () =>
                      onMemberTypeChange(
                        'portal',
                      )
                  }
                />

              </div>

            </div>

          </FormSection>


          {/* ROLES */}

          {form.memberType ===
            'internal' && (
            <FormSection
              title="Roles"
              description="Permissions this user receives when the invitation is accepted."
            >

              <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-white/[0.06] dark:border-white/10">

                {options.roles.map(
                  role => {
                    const selected =
                      form.selectedRoles.has(
                        role.id,
                      );


                    return (
                      <button
                        key={
                          role.id
                        }
                        type="button"
                        onClick={
                          () =>
                            onToggleRole(
                              role.id,
                            )
                        }
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                      >

                        <SelectionBox
                          selected={
                            selected
                          }
                        />


                        <div className="min-w-0 flex-1">

                          <p className="truncate text-xs font-semibold">
                            {role.name}
                          </p>

                          <p className="mt-0.5 truncate text-[9px] text-slate-400">
                            {role.description ||
                              `${role.permissionCount} permissions`}
                          </p>

                        </div>


                        {role.isSystem && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
                            SYSTEM
                          </span>
                        )}

                      </button>
                    );
                  },
                )}

              </div>

            </FormSection>
          )}


          {/* COMPANIES */}

          <FormSection
            title="Company Access"
            description="Select the companies this user can access."
          >

            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-white/[0.06] dark:border-white/10">

              {options.companies.map(
                company => {
                  const selected =
                    form.selectedCompanies.has(
                      company.id,
                    );


                  return (
                    <button
                      key={
                        company.id
                      }
                      type="button"
                      onClick={
                        () =>
                          onToggleCompany(
                            company.id,
                          )
                      }
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    >

                      <SelectionBox
                        selected={
                          selected
                        }
                      />


                      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />


                      <div className="min-w-0 flex-1">

                        <p className="truncate text-xs font-semibold">
                          {company.name}
                        </p>

                        <p className="mt-0.5 truncate text-[9px] text-slate-400">
                          {[
                            company.country,
                            company.currency,
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              ' · ',
                            )}
                        </p>

                      </div>


                      {company.isCurrent && (
                        <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400">
                          CURRENT
                        </span>
                      )}

                    </button>
                  );
                },
              )}

            </div>


            <label className="mt-4 block">

              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Default company
              </span>


              <div className="relative mt-1.5">

                <select
                  value={
                    form.defaultCompanyId
                  }
                  onChange={
                    event =>
                      onDefaultCompanyChange(
                        event.target.value,
                      )
                  }
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-[#15181F]"
                >

                  {options.companies
                    .filter(
                      company =>
                        form.selectedCompanies.has(
                          company.id,
                        ),
                    )
                    .map(
                      company => (
                        <option
                          key={
                            company.id
                          }
                          value={
                            company.id
                          }
                        >
                          {company.name}
                        </option>
                      ),
                    )}

                </select>


                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              </div>

            </label>

          </FormSection>


          {/* INVITATION */}

          <FormSection
            title="Invitation"
          >

            <label className="block">

              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Personal message
              </span>

              <textarea
                rows={
                  4
                }
                maxLength={
                  1000
                }
                value={
                  form.message
                }
                onChange={
                  event =>
                    onMessageChange(
                      event.target.value,
                    )
                }
                placeholder="Optional message..."
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.04]"
              />

              <p className="mt-1 text-right text-[9px] text-slate-400">
                {form.message.length}/1000
              </p>

            </label>


            <label className="mt-4 block">

              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Expires after
              </span>

              <div className="relative mt-1.5">

                <Clock3 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <select
                  value={
                    form.expiresInDays
                  }
                  onChange={
                    event =>
                      onExpiryChange(
                        Number(
                          event.target.value,
                        ),
                      )
                  }
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-[#15181F]"
                >
                  <option value={1}>
                    1 day
                  </option>

                  <option value={3}>
                    3 days
                  </option>

                  <option value={7}>
                    7 days
                  </option>

                  <option value={14}>
                    14 days
                  </option>

                  <option value={30}>
                    30 days
                  </option>
                </select>


                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              </div>

            </label>

          </FormSection>


          {/* ACTION */}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">

            <button
              type="button"
              disabled={
                saving
              }
              onClick={
                onClose
              }
              className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>


            <button
              type="button"
              disabled={
                saving
              }
              onClick={
                onSubmit
              }
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}

              {saving
                ? 'Sending…'
                : 'Send Invitation'}
            </button>

          </div>

        </div>
      ) : null}

    </DrawerShell>
  );
}


/* ================================================================
   DRAWER SHELL
   ================================================================ */

function DrawerShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title:
    string;

  subtitle?:
    string;

  onClose:
    () => void;

  children:
    React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80]">

      <button
        type="button"
        aria-label="Close"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
      />


      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[520px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#11141A]">

        <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">

          <div className="min-w-0 flex-1">

            <h2 className="truncate text-sm font-bold">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                {subtitle}
              </p>
            )}

          </div>


          <button
            type="button"
            aria-label="Close"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

        </header>


        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {children}
        </div>

      </aside>

    </div>
  );
}


/* ================================================================
   FORM SECTION
   ================================================================ */

function FormSection({
  title,
  description,
  children,
}: {
  title:
    string;

  description?:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <section>

      <div className="mb-3">

        <h3 className="text-xs font-bold">
          {title}
        </h3>

        {description && (
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            {description}
          </p>
        )}

      </div>


      {children}

    </section>
  );
}


/* ================================================================
   TYPE OPTION
   ================================================================ */

function TypeOption({
  icon:
    Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon:
    typeof Users;

  title:
    string;

  description:
    string;

  selected:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'flex items-center gap-3 rounded-lg border p-3 text-left transition',

        selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10 dark:bg-blue-500/10'
          : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20',
      ].join(
        ' ',
      )}
    >

      <div
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',

          selected
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400',
        ].join(
          ' ',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>


      <div className="min-w-0">

        <p className="text-xs font-semibold">
          {title}
        </p>

        <p className="mt-0.5 text-[9px] text-slate-400">
          {description}
        </p>

      </div>

    </button>
  );
}


/* ================================================================
   SELECTION
   ================================================================ */

function SelectionBox({
  selected,
}: {
  selected:
    boolean;
}) {
  return (
    <div
      className={[
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',

        selected
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-slate-300 dark:border-white/20',
      ].join(
        ' ',
      )}
    >
      {selected && (
        <Check className="h-3 w-3" />
      )}
    </div>
  );
}


/* ================================================================
   DETAIL SECTION
   ================================================================ */

function DetailSection({
  title,
  children,
}: {
  title:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <section>

      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </h3>


      <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
        {children}
      </div>

    </section>
  );
}


/* ================================================================
   DETAIL ROW
   ================================================================ */

function DetailRow({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="flex gap-4 border-b border-slate-100 py-2 first:pt-0 last:border-b-0 last:pb-0 dark:border-white/[0.06]">

      <span className="w-[105px] shrink-0 text-[10px] font-medium text-slate-400">
        {label}
      </span>

      <span className="min-w-0 flex-1 break-words text-right text-[11px] font-medium text-slate-700 dark:text-slate-200">
        {value}
      </span>

    </div>
  );
}


/* ================================================================
   EMPTY
   ================================================================ */

function EmptyInvitations() {
  return (
    <div className="mx-auto max-w-sm text-center">

      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-white/[0.06]">
        <Mail className="h-4 w-4" />
      </div>


      <h3 className="mt-3 text-xs font-bold">
        No invitations found
      </h3>


      <p className="mt-1 text-[10px] leading-4 text-slate-400">
        There are no invitations matching the current filters.
      </p>

    </div>
  );
}


/* ================================================================
   LOADING
   ================================================================ */

function LoadingRows() {
  return (
    <>
      {Array.from({
        length:
          5,
      }).map(
        (
          _,
          index,
        ) => (
          <tr
            key={
              index
            }
            className="border-b border-slate-100 dark:border-white/[0.06]"
          >

            <td
              colSpan={
                8
              }
              className="px-4 py-3"
            >
              <div className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.05]" />
            </td>

          </tr>
        ),
      )}
    </>
  );
}


function MobileLoadingRows() {
  return (
    <div className="space-y-1 p-3">

      {Array.from({
        length:
          5,
      }).map(
        (
          _,
          index,
        ) => (
          <div
            key={
              index
            }
            className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.05]"
          />
        ),
      )}

    </div>
  );
}