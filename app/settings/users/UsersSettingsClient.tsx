'use client';

import {
  Ban,
  Building2,
  Check,
  Clock3,
  Crown,
  Filter,
  Loader2,
  Mail,
  Menu,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Shield,
  UserPlus,
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

import {
  useSearchParams,
} from 'next/navigation';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';


/* ================================================================
   SHELL TYPES
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

  canViewUsers:
    boolean;

  canManageUsers:
    boolean;

  canViewRoles:
    boolean;

  canManageRoles:
    boolean;

  canViewInvitations:
    boolean;

  canManageInvitations:
    boolean;

  canUseAi:
    boolean;

  canViewFiles:
    boolean;

  canViewNotifications:
    boolean;
};


/* ================================================================
   MEMBER TYPES
   ================================================================ */

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


type Directory = {
  tenantId:
    string;

  workspaceName:
    string;

  generatedAt:
    string;

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


/* ================================================================
   INVITATION TYPES
   ================================================================ */

type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'revoked'
  | 'expired';


type InvitationRole = {
  id:
    string;

  key:
    string;

  name:
    string;

  available:
    boolean;
};


type InvitationCompany = {
  id:
    string;

  name:
    string;

  isDefault:
    boolean;

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
    'internal'
    | 'portal';

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


/* ================================================================
   INVITATION OPTIONS
   ================================================================ */

type InvitationRoleOption = {
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


type InvitationCompanyOption = {
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


type InvitationOptions = {
  roles:
    InvitationRoleOption[];

  companies:
    InvitationCompanyOption[];

  defaultRoleId:
    string | null;

  defaultCompanyId:
    string;
};


type InvitationOptionsResponse = {
  success?:
    boolean;

  error?:
    string;

  options?:
    InvitationOptions;
};


/* ================================================================
   ROLE EDITOR
   ================================================================ */

type AssignableRole = {
  id:
    string;

  key:
    string;

  name:
    string;

  description:
    string | null;

  assignable:
    boolean;
};


type MemberRoleState = {
  roles:
    AssignableRole[];
};


type MemberRolesResponse = {
  success?:
    boolean;

  error?:
    string;

  roles?:
    AssignableRole[];

  member?:
    MemberRoleState;
};


type RoleEditor = {
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
  RoleEditor = {
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
   NEW INVITATION
   ================================================================ */

type InviteForm = {
  open:
    boolean;

  loading:
    boolean;

  saving:
    boolean;

  error:
    string | null;

  options:
    InvitationOptions | null;

  email:
    string;

  memberType:
    'internal'
    | 'portal';

  roleIds:
    Set<string>;

  companyIds:
    Set<string>;

  defaultCompanyId:
    string;

  message:
    string;

  expiresInDays:
    number;
};


const EMPTY_INVITE_FORM:
  InviteForm = {
  open:
    false,

  loading:
    false,

  saving:
    false,

  error:
    null,

  options:
    null,

  email:
    '',

  memberType:
    'internal',

  roleIds:
    new Set(),

  companyIds:
    new Set(),

  defaultCompanyId:
    '',

  message:
    '',

  expiresInDays:
    7,
};


/* ================================================================
   UNIFIED RECORD
   ================================================================ */

type AccessRecord =
  | {
      kind:
        'member';

      id:
        string;

      email:
        string;

      name:
        string;

      memberType:
        'internal'
        | 'portal';

      status:
        'active'
        | 'suspended'
        | 'removed';

      roles:
        {
          id:
            string;

          name:
            string;
        }[];

      companies:
        {
          id:
            string;

          name:
            string;

          isDefault:
            boolean;
        }[];

      date:
        string | null;

      member:
        DirectoryMember;
    }
  | {
      kind:
        'invitation';

      id:
        string;

      email:
        string;

      name:
        string;

      memberType:
        'internal'
        | 'portal';

      status:
        'invited'
        | 'expired'
        | 'revoked';

      roles:
        {
          id:
            string;

          name:
            string;
        }[];

      companies:
        {
          id:
            string;

          name:
            string;

          isDefault:
            boolean;
        }[];

      date:
        string | null;

      invitation:
        WorkspaceInvitation;
    };


type FilterValue =
  | 'all'
  | 'active'
  | 'invited'
  | 'suspended'
  | 'portal'
  | 'expired'
  | 'revoked';


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
  )
    .format(
      date,
    );
}


function memberName(
  member:
    DirectoryMember,
) {
  return (
    member.fullName
      ?.trim() ||
    `${member.firstName || ''} ${member.lastName || ''}`
      .trim() ||
    member.email
  );
}


function memberStatus(
  member:
    DirectoryMember,
):
  | 'active'
  | 'suspended'
  | 'removed' {
  if (
    member.deletedAt
  ) {
    return 'removed';
  }


  return member.membershipStatus;
}


function invitationStatus(
  invitation:
    WorkspaceInvitation,
):
  | 'invited'
  | 'expired'
  | 'revoked' {
  if (
    invitation.status ===
    'expired'
  ) {
    return 'expired';
  }


  if (
    invitation.status ===
    'revoked'
  ) {
    return 'revoked';
  }


  return 'invited';
}


function setsEqual(
  a:
    Set<string>,

  b:
    Set<string>,
) {
  if (
    a.size !==
    b.size
  ) {
    return false;
  }


  for (
    const value
    of a
  ) {
    if (
      !b.has(
        value,
      )
    ) {
      return false;
    }
  }


  return true;
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


/* ================================================================
   COMPONENT
   ================================================================ */

export default function UsersSettingsClient({
  user,
  tenant,
  membership,
  subscription,
  modules,
  canViewUsers,
  canManageUsers,
  canViewRoles,
  canManageRoles,
  canViewInvitations,
  canManageInvitations,
  canUseAi,
  canViewFiles,
  canViewNotifications,
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
    members,
    setMembers,
  ] =
    useState<
      DirectoryMember[]
    >([]);


  const [
    invitations,
    setInvitations,
  ] =
    useState<
      WorkspaceInvitation[]
    >([]);


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
    filter,
    setFilter,
  ] =
    useState<FilterValue>(
      searchParams.get(
        'view',
      ) ===
      'invited'
        ? 'invited'
        : 'all',
    );


  const [
    inviteForm,
    setInviteForm,
  ] =
    useState<InviteForm>(
      EMPTY_INVITE_FORM,
    );


  const [
    roleEditor,
    setRoleEditor,
  ] =
    useState<RoleEditor>(
      EMPTY_ROLE_EDITOR,
    );


  const [
    invitationAction,
    setInvitationAction,
  ] =
    useState<
      string | null
    >(
      null,
    );


  /*
   * Kept for future Category 7 member lifecycle controls.
   */
  void canManageUsers;


  /* ==============================================================
     QUERY PARAMETER
     ============================================================== */

  useEffect(
    () => {
      if (
        searchParams.get(
          'view',
        ) ===
        'invited'
      ) {
        setFilter(
          'invited',
        );
      }
    },

    [
      searchParams,
    ],
  );


  /* ==============================================================
     LOAD DIRECTORY
     ============================================================== */

  const loadAccessDirectory =
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
          const requests:
            Promise<void>[] =
            [];


          if (
            canViewUsers
          ) {
            requests.push(
              (
                async () => {
                  const response =
                    await fetch(
                      '/api/workspace/members',
                      {
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
                      'Workspace members could not be loaded.',
                    );
                  }


                  setMembers(
                    data.directory.members,
                  );
                }
              )(),
            );
          } else {
            setMembers(
              [],
            );
          }


          if (
            canViewInvitations
          ) {
            requests.push(
              (
                async () => {
                  const response =
                    await fetch(
                      '/api/workspace/invitations?status=all&limit=200',
                      {
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
                    !data?.success
                  ) {
                    throw new Error(
                      data?.error ||
                      'Workspace invitations could not be loaded.',
                    );
                  }


                  /*
                   * Accepted invitations have already crossed the
                   * membership boundary and are represented by
                   * tenant_users.
                   *
                   * Do not display the same person twice.
                   */
                  setInvitations(
                    (
                      data.invitations ||
                      []
                    ).filter(
                      invitation =>
                        invitation.status !==
                        'accepted',
                    ),
                  );
                }
              )(),
            );
          } else {
            setInvitations(
              [],
            );
          }


          await Promise.all(
            requests,
          );
        } catch (
          requestError
        ) {
          setError(
            requestError instanceof
              Error
              ? requestError.message
              : 'Workspace access could not be loaded.',
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

      [
        canViewUsers,
        canViewInvitations,
      ],
    );


  useEffect(
    () => {
      void loadAccessDirectory();
    },

    [
      loadAccessDirectory,
    ],
  );


  /* ==============================================================
     UNIFIED RECORDS
     ============================================================== */

  const records =
    useMemo<
      AccessRecord[]
    >(
      () => {
        const result:
          AccessRecord[] =
          [];


        for (
          const member
          of members
        ) {
          result.push({
            kind:
              'member',

            id:
              member.membershipId,

            email:
              member.email,

            name:
              memberName(
                member,
              ),

            memberType:
              member.memberType,

            status:
              memberStatus(
                member,
              ),

            roles:
              member.roles.map(
                role => ({
                  id:
                    role.id,

                  name:
                    role.name,
                }),
              ),

            companies:
              member.companies.map(
                company => ({
                  id:
                    company.id,

                  name:
                    company.name,

                  isDefault:
                    company.isDefault,
                }),
              ),

            date:
              member.lastActiveAt ||
              member.joinedAt,

            member,
          });
        }


        for (
          const invitation
          of invitations
        ) {
          result.push({
            kind:
              'invitation',

            id:
              invitation.id,

            email:
              invitation.email,

            name:
              invitation.email,

            memberType:
              invitation.memberType,

            status:
              invitationStatus(
                invitation,
              ),

            roles:
              invitation.roles.map(
                role => ({
                  id:
                    role.id,

                  name:
                    role.name,
                }),
              ),

            companies:
              invitation.companies.map(
                company => ({
                  id:
                    company.id,

                  name:
                    company.name,

                  isDefault:
                    company.isDefault,
                }),
              ),

            date:
              invitation.lastSentAt ||
              invitation.createdAt,

            invitation,
          });
        }


        return result;
      },

      [
        members,
        invitations,
      ],
    );


  const summary =
    useMemo(
      () => ({
        total:
          records.length,

        active:
          records.filter(
            record =>
              record.status ===
              'active',
          ).length,

        invited:
          records.filter(
            record =>
              record.status ===
              'invited',
          ).length,

        suspended:
          records.filter(
            record =>
              record.status ===
              'suspended',
          ).length,

        portal:
          records.filter(
            record =>
              record.memberType ===
              'portal',
          ).length,
      }),

      [
        records,
      ],
    );


  const filteredRecords =
    useMemo(
      () => {
        const query =
          normalize(
            search,
          );


        return records.filter(
          record => {
            if (
              filter ===
                'active' &&
              record.status !==
                'active'
            ) {
              return false;
            }


            if (
              filter ===
                'invited' &&
              record.status !==
                'invited'
            ) {
              return false;
            }


            if (
              filter ===
                'suspended' &&
              record.status !==
                'suspended'
            ) {
              return false;
            }


            if (
              filter ===
                'portal' &&
              record.memberType !==
                'portal'
            ) {
              return false;
            }


            if (
              filter ===
                'expired' &&
              record.status !==
                'expired'
            ) {
              return false;
            }


            if (
              filter ===
                'revoked' &&
              record.status !==
                'revoked'
            ) {
              return false;
            }


            if (
              !query
            ) {
              return true;
            }


            const roleText =
              record.roles
                .map(
                  role =>
                    role.name,
                )
                .join(
                  ' ',
                );


            const companyText =
              record.companies
                .map(
                  company =>
                    company.name,
                )
                .join(
                  ' ',
                );


            return normalize(
              [
                record.name,
                record.email,
                record.status,
                record.memberType,
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
        records,
        filter,
        search,
      ],
    );


  /* ==============================================================
     NEW USER / INVITATION
     ============================================================== */

  async function openInvite() {
    if (
      !canManageInvitations
    ) {
      return;
    }


    setInviteForm({
      ...EMPTY_INVITE_FORM,

      open:
        true,

      loading:
        true,
    });


    try {
      const response =
        await fetch(
          '/api/workspace/invitations/options',
          {
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
        await readJson<InvitationOptionsResponse>(
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


      const options =
        data.options;


      setInviteForm({
        ...EMPTY_INVITE_FORM,

        open:
          true,

        options,

        roleIds:
          options.defaultRoleId
            ? new Set([
                options.defaultRoleId,
              ])
            : new Set(),

        companyIds:
          options.defaultCompanyId
            ? new Set([
                options.defaultCompanyId,
              ])
            : new Set(),

        defaultCompanyId:
          options.defaultCompanyId,
      });
    } catch (
      requestError
    ) {
      setInviteForm(
        current => ({
          ...current,

          loading:
            false,

          error:
            requestError instanceof
              Error
              ? requestError.message
              : 'Invitation options could not be loaded.',
        }),
      );
    }
  }


  function closeInvite() {
    if (
      inviteForm.saving
    ) {
      return;
    }


    setInviteForm(
      EMPTY_INVITE_FORM,
    );
  }


  function toggleInviteRole(
    roleId:
      string,
  ) {
    setInviteForm(
      current => {
        const roleIds =
          new Set(
            current.roleIds,
          );


        if (
          roleIds.has(
            roleId,
          )
        ) {
          roleIds.delete(
            roleId,
          );
        } else {
          roleIds.add(
            roleId,
          );
        }


        return {
          ...current,
          roleIds,
        };
      },
    );
  }


  function toggleInviteCompany(
    companyId:
      string,
  ) {
    setInviteForm(
      current => {
        const companyIds =
          new Set(
            current.companyIds,
          );


        if (
          companyIds.has(
            companyId,
          )
        ) {
          companyIds.delete(
            companyId,
          );


          return {
            ...current,

            companyIds,

            defaultCompanyId:
              current.defaultCompanyId ===
              companyId
                ? (
                    [
                      ...companyIds,
                    ][0] ||
                    ''
                  )
                : current.defaultCompanyId,
          };
        }


        companyIds.add(
          companyId,
        );


        return {
          ...current,

          companyIds,

          defaultCompanyId:
            current.defaultCompanyId ||
            companyId,
        };
      },
    );
  }


  async function sendInvitation() {
    if (
      inviteForm.saving
    ) {
      return;
    }


    const email =
      inviteForm.email
        .trim()
        .toLowerCase();


    if (
      !email
    ) {
      setInviteForm(
        current => ({
          ...current,

          error:
            'Enter the user email address.',
        }),
      );

      return;
    }


    if (
      inviteForm.memberType ===
        'internal' &&
      inviteForm.roleIds.size ===
        0
    ) {
      setInviteForm(
        current => ({
          ...current,

          error:
            'An internal user must have at least one role.',
        }),
      );

      return;
    }


    if (
      inviteForm.companyIds.size ===
      0
    ) {
      setInviteForm(
        current => ({
          ...current,

          error:
            'Select at least one company.',
        }),
      );

      return;
    }


    if (
      !inviteForm.defaultCompanyId ||
      !inviteForm.companyIds.has(
        inviteForm.defaultCompanyId,
      )
    ) {
      setInviteForm(
        current => ({
          ...current,

          error:
            'Select a default company.',
        }),
      );

      return;
    }


    setInviteForm(
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
                  inviteForm.memberType,

                /*
                 * Portal access deliberately carries no internal
                 * roles.
                 */
                roleIds:
                  inviteForm.memberType ===
                    'internal'
                    ? [
                        ...inviteForm.roleIds,
                      ]
                    : [],

                companyIds: [
                  ...inviteForm.companyIds,
                ],

                defaultCompanyId:
                  inviteForm.defaultCompanyId,

                message:
                  inviteForm.message
                    .trim() ||
                  null,

                expiresInDays:
                  inviteForm.expiresInDays,
              }),
          },
        );


      const data =
        await readJson<InvitationsResponse>(
          response,
        );


      /*
       * 502 can still mean the invitation was successfully created
       * but email delivery failed.
       *
       * Keep the record visible rather than pretending creation
       * never happened.
       */
      if (
        !response.ok &&
        !data?.invitation
      ) {
        throw new Error(
          data?.error ||
          'The invitation could not be created.',
        );
      }


      setInviteForm(
        EMPTY_INVITE_FORM,
      );


      setSuccess(
        data?.emailSent ===
          false
          ? 'User invitation created. Email delivery is not currently available.'
          : 'Invitation sent successfully.',
      );


      await loadAccessDirectory(
        true,
      );
    } catch (
      requestError
    ) {
      setInviteForm(
        current => ({
          ...current,

          saving:
            false,

          error:
            requestError instanceof
              Error
              ? requestError.message
              : 'The invitation could not be created.',
        }),
      );
    }
  }


  /* ==============================================================
     INVITATION ACTIONS
     ============================================================== */

  async function invitationMutation(
    invitation:
      WorkspaceInvitation,

    action:
      'resend'
      | 'revoke',
  ) {
    if (
      !canManageInvitations ||
      invitationAction
    ) {
      return;
    }


    setInvitationAction(
      `${action}:${invitation.id}`,
    );


    setError(
      null,
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
                action,

                invitationId:
                  invitation.id,
              }),
          },
        );


      const data =
        await readJson<InvitationsResponse>(
          response,
        );


      if (
        !response.ok &&
        !data?.invitation
      ) {
        throw new Error(
          data?.error ||
          `Invitation could not be ${action === 'resend' ? 'resent' : 'revoked'}.`,
        );
      }


      setSuccess(
        action ===
          'resend'
          ? (
              data?.emailSent ===
                false
                ? 'Invitation refreshed, but email delivery is unavailable.'
                : 'Invitation resent successfully.'
            )
          : 'Invitation revoked.',
      );


      await loadAccessDirectory(
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
      setInvitationAction(
        null,
      );
    }
  }


  /* ==============================================================
     ROLE EDITOR
     ============================================================== */

  async function openRoleEditor(
    member:
      DirectoryMember,
  ) {
    if (
      !canManageRoles ||
      member.isOwner ||
      member.memberType !==
        'internal' ||
      member.membershipStatus !==
        'active' ||
      member.deletedAt
    ) {
      return;
    }


    setRoleEditor({
      ...EMPTY_ROLE_EDITOR,

      member,

      loading:
        true,
    });


    try {
      const response =
        await fetch(
          `/api/workspace/member-roles?userId=${encodeURIComponent(
            member.userId,
          )}`,
          {
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


  function toggleRole(
    roleId:
      string,
  ) {
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


  async function saveRoles() {
    if (
      !roleEditor.member ||
      roleEditor.saving ||
      setsEqual(
        roleEditor.selected,
        roleEditor.original,
      )
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
            'An active internal user must have at least one role.',
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
                  roleEditor.member.userId,

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
        'User access roles updated.',
      );


      await loadAccessDirectory(
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


  /* ==============================================================
     RENDER
     ============================================================== */

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
              canUseAi,

            filesEnabled:
              canViewFiles,

            notificationsEnabled:
              canViewNotifications,
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

          {/* HEADER */}

          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0B0E14]/95">

            <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">

              <button
                type="button"
                onClick={() =>
                  setSidebarOpen(
                    true,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">

                <h1 className="truncate text-sm font-bold">
                  Users
                </h1>

                <p className="hidden text-[11px] text-slate-400 sm:block">
                  Members, invitations and workspace access
                </p>

              </div>


              <div className="ml-auto flex items-center gap-2">

                <button
                  type="button"
                  onClick={() =>
                    void loadAccessDirectory(
                      true,
                    )
                  }
                  disabled={
                    refreshing
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5"
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


                {canManageInvitations && (
                  <button
                    type="button"
                    onClick={() =>
                      void openInvite()
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <UserPlus className="h-4 w-4" />

                    New User
                  </button>
                )}

              </div>

            </div>

          </header>


          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">

            {/* MESSAGES */}

            {error && (
              <Notice
                tone="error"
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
              <Notice
                tone="success"
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


            {/* SUMMARY */}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">

              <SummaryCard
                label="Total"
                value={
                  summary.total
                }
              />

              <SummaryCard
                label="Active"
                value={
                  summary.active
                }
              />

              <SummaryCard
                label="Invited"
                value={
                  summary.invited
                }
              />

              <SummaryCard
                label="Suspended"
                value={
                  summary.suspended
                }
              />

              <SummaryCard
                label="Portal"
                value={
                  summary.portal
                }
              />

            </div>


            {/* FILTER BAR */}

            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.035]">

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">

                <div className="relative min-w-0 flex-1">

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
                    placeholder="Search users, email, roles or companies"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />

                </div>


                <div className="flex gap-1 overflow-x-auto">

                  {(
                    [
                      'all',
                      'active',
                      'invited',
                      'suspended',
                      'portal',
                      'expired',
                      'revoked',
                    ] as FilterValue[]
                  ).map(
                    value => (
                      <button
                        key={
                          value
                        }
                        type="button"
                        onClick={() =>
                          setFilter(
                            value,
                          )
                        }
                        className={[
                          'shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold capitalize',

                          filter ===
                            value
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10',
                        ].join(
                          ' ',
                        )}
                      >
                        {value}
                      </button>
                    ),
                  )}

                </div>

              </div>

            </section>


            {/* DIRECTORY */}

            <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">

              {loading ? (
                <div className="flex min-h-[280px] items-center justify-center">

                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />

                </div>
              ) : filteredRecords.length ===
                0 ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">

                  <UsersRound className="h-8 w-8 text-slate-300" />

                  <p className="mt-3 text-sm font-semibold">
                    No matching users
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    No members or invitations match the current filter.
                  </p>

                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/10">

                  {filteredRecords.map(
                    record => (
                      <AccessRow
                        key={
                          `${record.kind}:${record.id}`
                        }

                        record={
                          record
                        }

                        canManageRoles={
                          canManageRoles
                        }

                        canManageInvitations={
                          canManageInvitations
                        }

                        invitationAction={
                          invitationAction
                        }

                        onEditRoles={
                          openRoleEditor
                        }

                        onResend={
                          invitation =>
                            void invitationMutation(
                              invitation,
                              'resend',
                            )
                        }

                        onRevoke={
                          invitation =>
                            void invitationMutation(
                              invitation,
                              'revoke',
                            )
                        }
                      />
                    ),
                  )}

                </div>
              )}

            </section>


            {canViewRoles && (
              <p className="mt-4 text-[11px] text-slate-400">
                Application visibility is derived from each user's assigned role permissions. Invitations do not maintain a separate app-access list.
              </p>
            )}

          </div>

        </div>

      </div>


      {/* ========================================================
          INVITE DRAWER
          ======================================================== */}

      {inviteForm.open && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/30">

          <button
            type="button"
            aria-label="Close"
            onClick={
              closeInvite
            }
            className="absolute inset-0"
          />


          <aside className="relative z-10 h-full w-full max-w-[540px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">

            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">

              <div>

                <h2 className="text-sm font-bold">
                  New User
                </h2>

                <p className="text-[11px] text-slate-400">
                  Configure access and send an invitation
                </p>

              </div>


              <button
                type="button"
                onClick={
                  closeInvite
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>

            </div>


            {inviteForm.loading ? (
              <div className="flex min-h-[350px] items-center justify-center">

                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />

              </div>
            ) : (
              <div className="space-y-6 p-5">

                {inviteForm.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    {inviteForm.error}
                  </div>
                )}


                <Field
                  label="Email"
                >
                  <input
                    type="email"
                    value={
                      inviteForm.email
                    }
                    onChange={
                      event =>
                        setInviteForm(
                          current => ({
                            ...current,

                            email:
                              event.target.value,
                          }),
                        )
                    }
                    placeholder="name@company.com"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </Field>


                <Field
                  label="User type"
                >
                  <div className="grid grid-cols-2 gap-2">

                    {(
                      [
                        'internal',
                        'portal',
                      ] as const
                    ).map(
                      type => (
                        <button
                          key={
                            type
                          }
                          type="button"
                          onClick={() =>
                            setInviteForm(
                              current => ({
                                ...current,

                                memberType:
                                  type,

                                roleIds:
                                  type ===
                                    'portal'
                                    ? new Set()
                                    : current.roleIds,
                              }),
                            )
                          }
                          className={[
                            'rounded-lg border px-3 py-3 text-left text-xs',

                            inviteForm.memberType ===
                              type
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30'
                              : 'border-slate-200 dark:border-white/10',
                          ].join(
                            ' ',
                          )}
                        >
                          <p className="font-semibold capitalize">
                            {type}
                          </p>

                          <p className="mt-1 text-[10px] text-slate-400">
                            {type ===
                              'internal'
                              ? 'Uses the internal SaMi workspace.'
                              : 'Restricted external/portal access.'}
                          </p>
                        </button>
                      ),
                    )}

                  </div>
                </Field>


                {inviteForm.memberType ===
                  'internal' && (
                  <Field
                    label="Roles"
                  >
                    <div className="space-y-2">

                      {inviteForm.options?.roles.map(
                        role => (
                          <CheckRow
                            key={
                              role.id
                            }
                            checked={
                              inviteForm.roleIds.has(
                                role.id,
                              )
                            }
                            title={
                              role.name
                            }
                            description={
                              role.description ||
                              `${role.permissionCount} permissions`
                            }
                            onClick={() =>
                              toggleInviteRole(
                                role.id,
                              )
                            }
                          />
                        ),
                      )}

                    </div>
                  </Field>
                )}


                <Field
                  label="Companies"
                >
                  <div className="space-y-2">

                    {inviteForm.options?.companies.map(
                      company => (
                        <div
                          key={
                            company.id
                          }
                          className="rounded-lg border border-slate-200 p-3 dark:border-white/10"
                        >

                          <div className="flex items-center gap-3">

                            <button
                              type="button"
                              onClick={() =>
                                toggleInviteCompany(
                                  company.id,
                                )
                              }
                              className={[
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border',

                                inviteForm.companyIds.has(
                                  company.id,
                                )
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-300',
                              ].join(
                                ' ',
                              )}
                            >
                              {inviteForm.companyIds.has(
                                company.id,
                              ) && (
                                <Check className="h-3 w-3" />
                              )}
                            </button>


                            <div className="min-w-0 flex-1">

                              <p className="truncate text-xs font-semibold">
                                {company.name}
                              </p>

                            </div>


                            {inviteForm.companyIds.has(
                              company.id,
                            ) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setInviteForm(
                                    current => ({
                                      ...current,

                                      defaultCompanyId:
                                        company.id,
                                    }),
                                  )
                                }
                                className={[
                                  'rounded-md px-2 py-1 text-[9px] font-semibold',

                                  inviteForm.defaultCompanyId ===
                                    company.id
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                                    : 'bg-slate-100 text-slate-500 dark:bg-white/10',
                                ].join(
                                  ' ',
                                )}
                              >
                                {inviteForm.defaultCompanyId ===
                                  company.id
                                  ? 'Default'
                                  : 'Set default'}
                              </button>
                            )}

                          </div>

                        </div>
                      ),
                    )}

                  </div>
                </Field>


                <Field
                  label="Message"
                >
                  <textarea
                    value={
                      inviteForm.message
                    }
                    onChange={
                      event =>
                        setInviteForm(
                          current => ({
                            ...current,

                            message:
                              event.target.value,
                          }),
                        )
                    }
                    rows={
                      3
                    }
                    placeholder="Optional message"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5"
                  />
                </Field>


                <Field
                  label="Invitation validity"
                >
                  <select
                    value={
                      inviteForm.expiresInDays
                    }
                    onChange={
                      event =>
                        setInviteForm(
                          current => ({
                            ...current,

                            expiresInDays:
                              Number(
                                event.target.value,
                              ),
                          }),
                        )
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-white/10 dark:bg-[#11151D]"
                  >
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
                </Field>


                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">

                  <button
                    type="button"
                    onClick={
                      closeInvite
                    }
                    className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500"
                  >
                    Cancel
                  </button>


                  <button
                    type="button"
                    disabled={
                      inviteForm.saving
                    }
                    onClick={() =>
                      void sendInvitation()
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {inviteForm.saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}

                    Send Invitation
                  </button>

                </div>

              </div>
            )}

          </aside>

        </div>
      )}


      {/* ========================================================
          ROLE EDITOR
          ======================================================== */}

      {roleEditor.member && (
        <div className="fixed inset-0 z-[130] flex justify-end bg-black/30">

          <button
            type="button"
            className="absolute inset-0"
            onClick={() =>
              !roleEditor.saving &&
              setRoleEditor(
                EMPTY_ROLE_EDITOR,
              )
            }
          />


          <aside className="relative z-10 h-full w-full max-w-[480px] overflow-y-auto bg-white p-5 shadow-2xl dark:bg-[#11151D]">

            <div className="flex items-start justify-between">

              <div>

                <h2 className="text-sm font-bold">
                  Roles
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  {memberName(
                    roleEditor.member,
                  )}
                </p>

              </div>


              <button
                type="button"
                onClick={() =>
                  !roleEditor.saving &&
                  setRoleEditor(
                    EMPTY_ROLE_EDITOR,
                  )
                }
              >
                <X className="h-4 w-4" />
              </button>

            </div>


            {roleEditor.loading ? (
              <div className="flex min-h-[240px] items-center justify-center">

                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />

              </div>
            ) : (
              <div className="mt-6">

                {roleEditor.error && (
                  <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    {roleEditor.error}
                  </div>
                )}


                <div className="space-y-2">

                  {roleEditor.roles.map(
                    role => (
                      <CheckRow
                        key={
                          role.id
                        }
                        checked={
                          roleEditor.selected.has(
                            role.id,
                          )
                        }
                        title={
                          role.name
                        }
                        description={
                          role.description
                        }
                        onClick={() =>
                          toggleRole(
                            role.id,
                          )
                        }
                      />
                    ),
                  )}

                </div>


                <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">

                  <button
                    type="button"
                    onClick={() =>
                      setRoleEditor(
                        EMPTY_ROLE_EDITOR,
                      )
                    }
                    className="h-9 px-4 text-xs font-semibold text-slate-500"
                  >
                    Cancel
                  </button>


                  <button
                    type="button"
                    disabled={
                      roleEditor.saving ||
                      setsEqual(
                        roleEditor.selected,
                        roleEditor.original,
                      )
                    }
                    onClick={() =>
                      void saveRoles()
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {roleEditor.saving && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}

                    Save Roles
                  </button>

                </div>

              </div>
            )}

          </aside>

        </div>
      )}

    </main>
  );
}


/* ================================================================
   ACCESS ROW
   ================================================================ */

function AccessRow({
  record,
  canManageRoles,
  canManageInvitations,
  invitationAction,
  onEditRoles,
  onResend,
  onRevoke,
}: {
  record:
    AccessRecord;

  canManageRoles:
    boolean;

  canManageInvitations:
    boolean;

  invitationAction:
    string | null;

  onEditRoles:
    (
      member:
        DirectoryMember,
    ) => void;

  onResend:
    (
      invitation:
        WorkspaceInvitation,
    ) => void;

  onRevoke:
    (
      invitation:
        WorkspaceInvitation,
    ) => void;
}) {
  return (
    <div className="grid gap-3 px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.02] lg:grid-cols-[minmax(220px,1.5fr)_120px_minmax(160px,1fr)_minmax(160px,1fr)_120px_120px] lg:items-center">

      {/* USER */}

      <div className="flex min-w-0 items-center gap-3">

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">

          {record.kind ===
            'member' &&
          record.member.isOwner ? (
            <Crown className="h-4 w-4" />
          ) : record.kind ===
              'invitation' ? (
            <Mail className="h-4 w-4" />
          ) : (
            <UserRound className="h-4 w-4" />
          )}

        </div>


        <div className="min-w-0">

          <p className="truncate text-xs font-semibold">
            {record.name}
          </p>

          <p className="mt-0.5 truncate text-[10px] text-slate-400">
            {record.email}
          </p>

        </div>

      </div>


      {/* TYPE */}

      <div>

        <span className="text-[10px] font-semibold capitalize text-slate-500">
          {record.memberType}
        </span>

      </div>


      {/* ROLES */}

      <div className="min-w-0">

        <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">
          {record.roles.length >
            0
            ? record.roles
                .map(
                  role =>
                    role.name,
                )
                .join(
                  ', ',
                )
            : 'No internal roles'}
        </p>

      </div>


      {/* COMPANIES */}

      <div className="min-w-0">

        <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">
          {record.companies.length >
            0
            ? record.companies
                .map(
                  company =>
                    company.isDefault
                      ? `${company.name} · Default`
                      : company.name,
                )
                .join(
                  ', ',
                )
            : 'No companies'}
        </p>

      </div>


      {/* STATUS */}

      <div>

        <StatusBadge
          status={
            record.status
          }
        />

      </div>


      {/* ACTION */}

      <div className="flex items-center justify-end gap-1">

        {record.kind ===
          'member' &&
          canManageRoles &&
          record.member.memberType ===
            'internal' &&
          record.member.membershipStatus ===
            'active' &&
          !record.member.deletedAt &&
          !record.member.isOwner && (
          <button
            type="button"
            onClick={() =>
              onEditRoles(
                record.member,
              )
            }
            title="Edit roles"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}


        {record.kind ===
          'invitation' &&
          record.invitation.status ===
            'pending' &&
          canManageInvitations && (
          <>
            <button
              type="button"
              disabled={
                invitationAction !==
                null
              }
              onClick={() =>
                onResend(
                  record.invitation,
                )
              }
              title="Resend invitation"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30"
            >
              {invitationAction ===
              `resend:${record.invitation.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>


            <button
              type="button"
              disabled={
                invitationAction !==
                null
              }
              onClick={() =>
                onRevoke(
                  record.invitation,
                )
              }
              title="Revoke invitation"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {invitationAction ===
              `revoke:${record.invitation.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
            </button>
          </>
        )}

      </div>

    </div>
  );
}


/* ================================================================
   STATUS
   ================================================================ */

function StatusBadge({
  status,
}: {
  status:
    AccessRecord[
      'status'
    ];
}) {
  const classes =
    status ===
      'active'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
      : status ===
          'invited'
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
        : status ===
            'suspended'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
          : status ===
              'expired'
            ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
            : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300';


  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-[9px] font-semibold capitalize ${classes}`}>
      {status}
    </span>
  );
}


/* ================================================================
   SUMMARY
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]">

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-bold">
        {value}
      </p>

    </div>
  );
}


/* ================================================================
   FIELD
   ================================================================ */

function Field({
  label,
  children,
}: {
  label:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <div>

      <p className="mb-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </p>

      {children}

    </div>
  );
}


/* ================================================================
   CHECK ROW
   ================================================================ */

function CheckRow({
  checked,
  title,
  description,
  onClick,
}: {
  checked:
    boolean;

  title:
    string;

  description:
    string | null;

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
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left',

        checked
          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
          : 'border-slate-200 dark:border-white/10',
      ].join(
        ' ',
      )}
    >

      <div
        className={[
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',

          checked
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-300',
        ].join(
          ' ',
        )}
      >
        {checked && (
          <Check className="h-3 w-3" />
        )}
      </div>


      <div>

        <p className="text-xs font-semibold">
          {title}
        </p>

        {description && (
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            {description}
          </p>
        )}

      </div>

    </button>
  );
}


/* ================================================================
   NOTICE
   ================================================================ */

function Notice({
  tone,
  text,
  onClose,
}: {
  tone:
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
        'mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs',

        tone ===
          'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300',
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