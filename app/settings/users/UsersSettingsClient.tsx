'use client';

import {
  ArchiveRestore,
  Ban,
  Building2,
  Check,
  Clock3,
  Crown,
  Filter,
  Loader2,
  Mail,
  Menu,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  UserCheck,
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
  type ReactNode,
} from 'react';

import {
  useSearchParams,
} from 'next/navigation';

import WorkspaceSidebar from '@/app/components/workspace/WorkspaceSidebar';

import UserAvatar from '@/app/components/account/UserAvatar';


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

  permissionCount?:
    number;
};


type MemberRoleState = {
  roles:
    {
      id:
        string;

      key:
        string;

      name:
        string;

      description:
        string | null;
    }[];
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
   INVITE FORM
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
   LIFECYCLE
   ================================================================ */

type LifecycleAction =
  | 'suspend'
  | 'reactivate'
  | 'remove'
  | 'restore';


type LifecycleDialog = {
  open:
    boolean;

  member:
    DirectoryMember | null;

  action:
    LifecycleAction | null;

  reason:
    string;

  saving:
    boolean;

  error:
    string | null;
};


const EMPTY_LIFECYCLE_DIALOG:
  LifecycleDialog = {
  open:
    false,

  member:
    null,

  action:
    null,

  reason:
    '',

  saving:
    false,

  error:
    null,
};


/* ================================================================
   UNIFIED ACCESS RECORD
   ================================================================ */

type AccessStatus =
  | 'active'
  | 'suspended'
  | 'removed'
  | 'invited'
  | 'expired'
  | 'revoked';


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
  | 'removed'
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
  ).format(
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


function memberInitials(
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


  const initials =
    `${first || ''}${last || ''}`
      .trim();


  if (
    initials
  ) {
    return initials
      .toUpperCase();
  }


  return member.email
    .charAt(
      0,
    )
    .toUpperCase();
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


function actionTitle(
  action:
    LifecycleAction,
) {
  switch (
    action
  ) {
    case 'suspend':
      return 'Suspend employee';

    case 'reactivate':
      return 'Reactivate employee';

    case 'remove':
      return 'Remove employee';

    case 'restore':
      return 'Restore employee';
  }
}


function actionDescription(
  action:
    LifecycleAction,
) {
  switch (
    action
  ) {
    case 'suspend':
      return [
        'This person will immediately lose access to this workspace.',
        'Their roles and company assignments remain stored so access can be restored later.',
      ].join(
        ' ',
      );


    case 'reactivate':
      return [
        'This person will regain workspace access using their retained roles',
        'and company assignments.',
      ].join(
        ' ',
      );


    case 'remove':
      return [
        'The membership will be soft-removed from this workspace.',
        'The SaMi account itself is not deleted and the historical record remains available.',
      ].join(
        ' ',
      );


    case 'restore':
      return [
        'The removed workspace membership will be restored.',
        'Existing retained roles and company assignments become usable again.',
      ].join(
        ' ',
      );
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


  const initialView =
    searchParams.get(
      'view',
    );


  const [
    filter,
    setFilter,
  ] =
    useState<FilterValue>(
      initialView ===
        'active' ||
      initialView ===
        'invited' ||
      initialView ===
        'suspended' ||
      initialView ===
        'removed' ||
      initialView ===
        'portal' ||
      initialView ===
        'expired' ||
      initialView ===
        'revoked'
        ? initialView
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
    lifecycle,
    setLifecycle,
  ] =
    useState<LifecycleDialog>(
      EMPTY_LIFECYCLE_DIALOG,
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


  const [
    selectedRecord,
    setSelectedRecord,
  ] =
    useState<
      AccessRecord | null
    >(
      null,
    );


  /* ==============================================================
     QUERY PARAMETER
     ============================================================== */

  useEffect(
    () => {
      const value =
        searchParams.get(
          'view',
        );


      if (
        value ===
          'active' ||
        value ===
          'invited' ||
        value ===
          'suspended' ||
        value ===
          'removed' ||
        value ===
          'portal' ||
        value ===
          'expired' ||
        value ===
          'revoked'
      ) {
        setFilter(
          value,
        );
      }
    },

    [
      searchParams,
    ],
  );


  /* ==============================================================
     LOAD PEOPLE + INVITATIONS
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
                      'Workspace employees could not be loaded.',
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
              : 'People & Access could not be loaded.',
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
              member.joinedAt ||
              member.suspendedAt ||
              member.deletedAt,

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


        const order:
          Record<
            AccessStatus,
            number
          > = {
          active:
            0,

          invited:
            1,

          suspended:
            2,

          removed:
            3,

          expired:
            4,

          revoked:
            5,
        };


        result.sort(
          (
            first,
            second,
          ) => {
            if (
              first.kind ===
                'member' &&
              first.member.isOwner
            ) {
              return -1;
            }


            if (
              second.kind ===
                'member' &&
              second.member.isOwner
            ) {
              return 1;
            }


            const statusDifference =
              order[
                first.status
              ] -
              order[
                second.status
              ];


            if (
              statusDifference !==
              0
            ) {
              return statusDifference;
            }


            return first.name.localeCompare(
              second.name,
            );
          },
        );


        return result;
      },

      [
        members,
        invitations,
      ],
    );


  /* ==============================================================
     SUMMARY
     ============================================================== */

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

        removed:
          records.filter(
            record =>
              record.status ===
              'removed',
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


  /* ==============================================================
     FILTER
     ============================================================== */

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
                'removed' &&
              record.status !==
                'removed'
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
     INVITE OPTIONS
     ============================================================== */

  async function loadInviteForm(
    source?:
      WorkspaceInvitation,
  ) {
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

      email:
        source?.email ||
        '',

      memberType:
        source?.memberType ||
        'internal',

      message:
        source?.message ||
        '',
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


      const availableRoleIds =
        new Set(
          options.roles.map(
            role =>
              role.id,
          ),
        );


      const availableCompanyIds =
        new Set(
          options.companies.map(
            company =>
              company.id,
          ),
        );


      const sourceRoleIds =
        source
          ?.roles
          .map(
            role =>
              role.id,
          )
          .filter(
            roleId =>
              availableRoleIds.has(
                roleId,
              ),
          ) ||
        [];


      const sourceCompanyIds =
        source
          ?.companies
          .map(
            company =>
              company.id,
          )
          .filter(
            companyId =>
              availableCompanyIds.has(
                companyId,
              ),
          ) ||
        [];


      const roleIds =
        source?.memberType ===
          'portal'
          ? new Set<string>()
          : new Set<string>(
              sourceRoleIds.length >
                0
                ? sourceRoleIds
                : options.defaultRoleId
                  ? [
                      options.defaultRoleId,
                    ]
                  : [],
            );


      const companyIds =
        new Set<string>(
          sourceCompanyIds.length >
            0
            ? sourceCompanyIds
            : options.defaultCompanyId
              ? [
                  options.defaultCompanyId,
                ]
              : [],
        );


      const defaultCompanyId =
        source?.defaultCompanyId &&
        companyIds.has(
          source.defaultCompanyId,
        )
          ? source.defaultCompanyId
          : options.defaultCompanyId &&
              companyIds.has(
                options.defaultCompanyId,
              )
            ? options.defaultCompanyId
            : [
                ...companyIds,
              ][0] ||
              '';


      setInviteForm({
        ...EMPTY_INVITE_FORM,

        open:
          true,

        options,

        email:
          source?.email ||
          '',

        memberType:
          source?.memberType ||
          'internal',

        roleIds,

        companyIds,

        defaultCompanyId,

        message:
          source?.message ||
          '',

        expiresInDays:
          7,
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
        } else {
          companyIds.add(
            companyId,
          );
        }


        let defaultCompanyId =
          current.defaultCompanyId;


        if (
          !companyIds.has(
            defaultCompanyId,
          )
        ) {
          defaultCompanyId =
            [
              ...companyIds,
            ][0] ||
            '';
        }


        return {
          ...current,

          companyIds,

          defaultCompanyId,
        };
      },
    );
  }


  /* ==============================================================
     SEND INVITATION
     ============================================================== */

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
            'An internal employee must have at least one role.',
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
       * Email delivery failure can occur after the invitation
       * record was successfully created.
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
          ? 'Invitation created. Email delivery is not currently available.'
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
     INVITATION MUTATIONS
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
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          `Invitation could not be ${action === 'resend' ? 'resent' : 'revoked'}.`,
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


      setSelectedRecord(
        null,
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
          : 'Invitation could not be updated.',
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


    setSelectedRecord(
      null,
    );


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
        !data.roles ||
        !data.member
      ) {
        throw new Error(
          data?.error ||
          'Employee roles could not be loaded.',
        );
      }


      const original =
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
          new Set(
            original,
          ),

        original,

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
              : 'Employee roles could not be loaded.',
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
      roleEditor.saving
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
            'An active internal employee must have at least one role.',
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
          'Employee roles could not be updated.',
        );
      }


      setRoleEditor(
        EMPTY_ROLE_EDITOR,
      );


      setSuccess(
        'Employee roles updated.',
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
              : 'Employee roles could not be updated.',
        }),
      );
    }
  }


  /* ==============================================================
     LIFECYCLE
     ============================================================== */

  function openLifecycleAction(
    member:
      DirectoryMember,

    action:
      LifecycleAction,
  ) {
    if (
      !canManageUsers ||
      member.isOwner ||
      member.userId ===
        user.id
    ) {
      return;
    }


    setSelectedRecord(
      null,
    );


    setLifecycle({
      open:
        true,

      member,

      action,

      reason:
        '',

      saving:
        false,

      error:
        null,
    });
  }


  async function runLifecycleAction() {
    if (
      !lifecycle.member ||
      !lifecycle.action ||
      lifecycle.saving
    ) {
      return;
    }


    const reason =
      lifecycle.reason
        .trim();


    if (
      (
        lifecycle.action ===
          'suspend' ||
        lifecycle.action ===
          'remove'
      ) &&
      !reason
    ) {
      setLifecycle(
        current => ({
          ...current,

          error:
            'Enter an administrative reason for this action.',
        }),
      );

      return;
    }


    setLifecycle(
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
          '/api/workspace/members/lifecycle',
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
                action:
                  lifecycle.action,

                userId:
                  lifecycle.member.userId,

                reason:
                  reason ||
                  null,
              }),
          },
        );


      const data =
        await readJson<{
          success?:
            boolean;

          code?:
            string;

          error?:
            string;

          message?:
            string;
        }>(
          response,
        );


      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
          'Employee access could not be updated.',
        );
      }


      setLifecycle(
        EMPTY_LIFECYCLE_DIALOG,
      );


      setSuccess(
        data.message ||
        'Employee access updated.',
      );


      await loadAccessDirectory(
        true,
      );
    } catch (
      requestError
    ) {
      setLifecycle(
        current => ({
          ...current,

          saving:
            false,

          error:
            requestError instanceof
              Error
              ? requestError.message
              : 'Employee access could not be updated.',
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>


              <div className="min-w-0">

                <p className="truncate text-sm font-bold">
                  People & Access
                </p>

                <p className="hidden truncate text-[10px] text-slate-400 sm:block">
                  Employees, invitations, roles and workspace access
                </p>

              </div>


              {tenant && (
                <div className="ml-2 hidden min-w-0 border-l border-slate-200 pl-4 md:block dark:border-white/10">

                  <p className="max-w-[260px] truncate text-xs text-slate-400">
                    {tenant.name}
                  </p>

                </div>
              )}


              <div className="ml-auto flex items-center gap-2">

                <button
                  type="button"
                  disabled={
                    refreshing
                  }
                  onClick={() =>
                    void loadAccessDirectory(
                      true,
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  title="Refresh"
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
                      void loadInviteForm()
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <UserPlus className="h-4 w-4" />

                    <span className="hidden sm:inline">
                      Invite user
                    </span>
                  </button>
                )}

              </div>

            </div>

          </header>


          {/* ====================================================
              CONTENT
              ==================================================== */}

          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">

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


            {/* ==================================================
                TITLE
                ================================================== */}

            <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

              <div>

                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Workspace access
                </p>


                <h1 className="mt-1 text-2xl font-bold tracking-tight">
                  People & Access
                </h1>


                <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Manage active employees, pending invitations, suspended access, removed memberships, roles and company visibility from one workspace.
                </p>

              </div>

            </section>


            {/* ==================================================
                SUMMARY
                ================================================== */}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

              <SummaryCard
                label="Total"
                value={
                  summary.total
                }
                active={
                  filter ===
                  'all'
                }
                onClick={() =>
                  setFilter(
                    'all',
                  )
                }
              />


              <SummaryCard
                label="Active"
                value={
                  summary.active
                }
                active={
                  filter ===
                  'active'
                }
                onClick={() =>
                  setFilter(
                    'active',
                  )
                }
                tone="success"
              />


              <SummaryCard
                label="Invited"
                value={
                  summary.invited
                }
                active={
                  filter ===
                  'invited'
                }
                onClick={() =>
                  setFilter(
                    'invited',
                  )
                }
                tone="info"
              />


              <SummaryCard
                label="Suspended"
                value={
                  summary.suspended
                }
                active={
                  filter ===
                  'suspended'
                }
                onClick={() =>
                  setFilter(
                    'suspended',
                  )
                }
                tone="warning"
              />


              <SummaryCard
                label="Removed"
                value={
                  summary.removed
                }
                active={
                  filter ===
                  'removed'
                }
                onClick={() =>
                  setFilter(
                    'removed',
                  )
                }
                tone="danger"
              />


              <SummaryCard
                label="Portal"
                value={
                  summary.portal
                }
                active={
                  filter ===
                  'portal'
                }
                onClick={() =>
                  setFilter(
                    'portal',
                  )
                }
              />

            </div>


            {/* ==================================================
                DIRECTORY
                ================================================== */}

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">

              {/* TOOLBAR */}

              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/10 lg:flex-row lg:items-center">

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
                    placeholder="Search name, email, role, company or status"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                  />

                </div>


                <div className="flex items-center gap-2 overflow-x-auto">

                  <Filter className="h-4 w-4 shrink-0 text-slate-400" />


                  {(
                    [
                      'all',
                      'active',
                      'invited',
                      'suspended',
                      'removed',
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
                          'shrink-0 rounded-lg px-3 py-2 text-[10px] font-semibold capitalize transition',

                          filter ===
                            value
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10',
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


              {/* DESKTOP COLUMN HEADER */}

              <div className="hidden border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:border-white/10 dark:bg-white/[0.025] lg:grid lg:grid-cols-[minmax(240px,1.5fr)_90px_minmax(160px,1fr)_minmax(150px,1fr)_110px_120px_150px] lg:gap-3">

                <span>
                  Person
                </span>

                <span>
                  Type
                </span>

                <span>
                  Roles
                </span>

                <span>
                  Companies
                </span>

                <span>
                  Status
                </span>

                <span>
                  Activity
                </span>

                <span className="text-right">
                  Actions
                </span>

              </div>


              {/* DATA */}

              {loading ? (
                <div className="flex min-h-[320px] items-center justify-center">

                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />

                </div>
              ) : filteredRecords.length ===
                0 ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">

                  <UsersRound className="h-9 w-9 text-slate-300" />

                  <p className="mt-3 text-sm font-semibold">
                    No matching people
                  </p>

                  <p className="mt-1 max-w-md text-xs text-slate-400">
                    No employees or invitations match the current search and filter.
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

                        currentUserId={
                          user.id
                        }

                        canManageUsers={
                          canManageUsers
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

                        onDetails={
                          setSelectedRecord
                        }

                        onEditRoles={
                          openRoleEditor
                        }

                        onLifecycle={
                          openLifecycleAction
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

                        onInviteAgain={
                          invitation =>
                            void loadInviteForm(
                              invitation,
                            )
                        }
                      />
                    ),
                  )}

                </div>
              )}

            </section>


            <div className="mt-4 grid gap-3 md:grid-cols-2">

              <AccessPrinciple
                icon={
                  Shield
                }
                title="Roles control capability"
                text="Business app visibility and actions are derived from each employee's effective role permissions."
              />


              <AccessPrinciple
                icon={
                  Building2
                }
                title="Companies control scope"
                text="An employee only works inside companies assigned to their workspace membership."
              />

            </div>

          </div>

        </div>

      </div>


      {/* ========================================================
          DETAILS DRAWER
          ======================================================== */}

      {selectedRecord && (
        <div className="fixed inset-0 z-[115] flex justify-end bg-black/30">

          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0"
            onClick={() =>
              setSelectedRecord(
                null,
              )
            }
          />


          <aside className="relative z-10 h-full w-full max-w-[500px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">

            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">

              <div>

                <h2 className="text-sm font-bold">
                  Access details
                </h2>

                <p className="text-[10px] text-slate-400">
                  Workspace membership and authorization
                </p>

              </div>


              <button
                type="button"
                onClick={() =>
                  setSelectedRecord(
                    null,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>

            </div>


            <div className="space-y-5 p-5">

              <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">

                <div className="flex items-center gap-3">

                  {selectedRecord.kind ===
                    'member' ? (
                    <UserAvatar
                      avatarFileId={
                        selectedRecord.member.avatarFileId
                      }
                      displayName={
                        selectedRecord.name
                      }
                      initials={
                        memberInitials(
                          selectedRecord.member,
                        )
                      }
                      size="md"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30">
                      <Mail className="h-4 w-4" />
                    </div>
                  )}


                  <div className="min-w-0 flex-1">

                    <p className="truncate text-sm font-semibold">
                      {selectedRecord.name}
                    </p>

                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {selectedRecord.email}
                    </p>

                  </div>


                  <StatusBadge
                    status={
                      selectedRecord.status
                    }
                  />

                </div>

              </div>


              <DetailSection
                title="Workspace access"
              >

                <DetailRow
                  label="Type"
                  value={
                    selectedRecord.memberType ===
                      'internal'
                      ? 'Internal user'
                      : 'Portal user'
                  }
                />


                <DetailRow
                  label={
                    selectedRecord.kind ===
                      'member'
                      ? 'Last activity'
                      : 'Invitation activity'
                  }
                  value={
                    formatDate(
                      selectedRecord.date,
                    )
                  }
                />


                {selectedRecord.kind ===
                  'member' && (
                  <DetailRow
                    label="Can enter workspace"
                    value={
                      selectedRecord.member.canEnterWorkspace
                        ? 'Yes'
                        : 'No'
                    }
                  />
                )}

              </DetailSection>


              <DetailSection
                title="Roles"
              >

                {selectedRecord.roles.length >
                  0 ? (
                  <div className="flex flex-wrap gap-2">

                    {selectedRecord.roles.map(
                      role => (
                        <span
                          key={
                            role.id
                          }
                          className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                        >
                          {role.name}
                        </span>
                      ),
                    )}

                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No internal roles assigned.
                  </p>
                )}

              </DetailSection>


              <DetailSection
                title="Companies"
              >

                {selectedRecord.companies.length >
                  0 ? (
                  <div className="space-y-2">

                    {selectedRecord.companies.map(
                      company => (
                        <div
                          key={
                            company.id
                          }
                          className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-white/10"
                        >

                          <span className="text-xs font-medium">
                            {company.name}
                          </span>


                          {company.isDefault && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                              Default
                            </span>
                          )}

                        </div>
                      ),
                    )}

                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No company assignments.
                  </p>
                )}

              </DetailSection>


              <div className="border-t border-slate-200 pt-5 dark:border-white/10">

                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Actions
                </p>


                <div className="flex flex-wrap gap-2">

                  {selectedRecord.kind ===
                    'member' &&
                    canManageRoles &&
                    selectedRecord.member.memberType ===
                      'internal' &&
                    selectedRecord.status ===
                      'active' &&
                    !selectedRecord.member.isOwner && (
                    <button
                      type="button"
                      onClick={() =>
                        void openRoleEditor(
                          selectedRecord.member,
                        )
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10"
                    >
                      <Pencil className="h-4 w-4" />

                      Edit roles
                    </button>
                  )}


                  {selectedRecord.kind ===
                    'member' &&
                    canManageUsers &&
                    !selectedRecord.member.isOwner &&
                    selectedRecord.member.userId !==
                      user.id &&
                    selectedRecord.status ===
                      'active' && (
                    <button
                      type="button"
                      onClick={() =>
                        openLifecycleAction(
                          selectedRecord.member,
                          'suspend',
                        )
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
                    >
                      <PauseCircle className="h-4 w-4" />

                      Suspend
                    </button>
                  )}


                  {selectedRecord.kind ===
                    'member' &&
                    canManageUsers &&
                    !selectedRecord.member.isOwner &&
                    selectedRecord.member.userId !==
                      user.id &&
                    selectedRecord.status ===
                      'suspended' && (
                    <button
                      type="button"
                      onClick={() =>
                        openLifecycleAction(
                          selectedRecord.member,
                          'reactivate',
                        )
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                    >
                      <PlayCircle className="h-4 w-4" />

                      Reactivate
                    </button>
                  )}


                  {selectedRecord.kind ===
                    'member' &&
                    canManageUsers &&
                    !selectedRecord.member.isOwner &&
                    selectedRecord.member.userId !==
                      user.id &&
                    selectedRecord.status !==
                      'removed' && (
                    <button
                      type="button"
                      onClick={() =>
                        openLifecycleAction(
                          selectedRecord.member,
                          'remove',
                        )
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />

                      Remove
                    </button>
                  )}


                  {selectedRecord.kind ===
                    'member' &&
                    canManageUsers &&
                    !selectedRecord.member.isOwner &&
                    selectedRecord.member.userId !==
                      user.id &&
                    selectedRecord.status ===
                      'removed' && (
                    <button
                      type="button"
                      onClick={() =>
                        openLifecycleAction(
                          selectedRecord.member,
                          'restore',
                        )
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300"
                    >
                      <ArchiveRestore className="h-4 w-4" />

                      Restore
                    </button>
                  )}


                  {selectedRecord.kind ===
                    'invitation' &&
                    selectedRecord.invitation.status ===
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
                          void invitationMutation(
                            selectedRecord.invitation,
                            'resend',
                          )
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold dark:border-white/10"
                      >
                        <RefreshCw className="h-4 w-4" />

                        Resend
                      </button>


                      <button
                        type="button"
                        disabled={
                          invitationAction !==
                          null
                        }
                        onClick={() =>
                          void invitationMutation(
                            selectedRecord.invitation,
                            'revoke',
                          )
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 dark:border-red-900/40 dark:text-red-300"
                      >
                        <Ban className="h-4 w-4" />

                        Revoke
                      </button>
                    </>
                  )}


                  {selectedRecord.kind ===
                    'invitation' &&
                    (
                      selectedRecord.status ===
                        'expired' ||
                      selectedRecord.status ===
                        'revoked'
                    ) &&
                    canManageInvitations && (
                    <button
                      type="button"
                      onClick={() => {
                        const invitation =
                          selectedRecord.invitation;

                        setSelectedRecord(
                          null,
                        );

                        void loadInviteForm(
                          invitation,
                        );
                      }}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white"
                    >
                      <Send className="h-4 w-4" />

                      Invite again
                    </button>
                  )}

                </div>

              </div>

            </div>

          </aside>

        </div>
      )}


      {/* ========================================================
          INVITE DRAWER
          ======================================================== */}

      {inviteForm.open && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/30">

          <button
            type="button"
            aria-label="Close invitation form"
            onClick={
              closeInvite
            }
            className="absolute inset-0"
          />


          <aside className="relative z-10 h-full w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">

            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">

              <div>

                <h2 className="text-sm font-bold">
                  Invite user
                </h2>

                <p className="text-[11px] text-slate-400">
                  Configure role and company access before sending
                </p>

              </div>


              <button
                type="button"
                disabled={
                  inviteForm.saving
                }
                onClick={
                  closeInvite
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>

            </div>


            {inviteForm.loading ? (
              <div className="flex min-h-[400px] items-center justify-center">

                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />

              </div>
            ) : (
              <div className="space-y-6 p-5">

                {inviteForm.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    {inviteForm.error}
                  </div>
                )}


                <Field
                  label="Email address"
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
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
                  />

                </Field>


                <Field
                  label="Access type"
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
                            'rounded-xl border p-3 text-left transition',

                            inviteForm.memberType ===
                              type
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                              : 'border-slate-200 hover:border-slate-300 dark:border-white/10',
                          ].join(
                            ' ',
                          )}
                        >

                          <p className="text-xs font-semibold capitalize">
                            {type}
                          </p>

                          <p className="mt-1 text-[10px] leading-4 text-slate-400">
                            {type ===
                              'internal'
                              ? 'Employee or internal workspace user.'
                              : 'Restricted external portal access.'}
                          </p>

                        </button>
                      ),
                    )}

                  </div>

                </Field>


                {inviteForm.memberType ===
                  'internal' && (
                  <Field
                    label="Business roles"
                  >

                    {inviteForm.options?.roles.length ? (
                      <div className="space-y-2">

                        {inviteForm.options.roles.map(
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
                                `${role.permissionCount} effective permissions`
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
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                        No assignable roles are available. Create or configure a role before inviting an internal employee.
                      </div>
                    )}

                  </Field>
                )}


                <Field
                  label="Company access"
                >

                  <div className="space-y-2">

                    {inviteForm.options?.companies.map(
                      company => {
                        const checked =
                          inviteForm.companyIds.has(
                            company.id,
                          );


                        return (
                          <div
                            key={
                              company.id
                            }
                            className={[
                              'rounded-xl border p-3',

                              checked
                                ? 'border-blue-300 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/15'
                                : 'border-slate-200 dark:border-white/10',
                            ].join(
                              ' ',
                            )}
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

                                  checked
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 dark:border-slate-600',
                                ].join(
                                  ' ',
                                )}
                              >
                                {checked && (
                                  <Check className="h-3 w-3" />
                                )}
                              </button>


                              <div className="min-w-0 flex-1">

                                <p className="truncate text-xs font-semibold">
                                  {company.name}
                                </p>

                                <p className="mt-0.5 truncate text-[9px] text-slate-400">
                                  {company.currency}
                                  {' · '}
                                  {company.timezone}
                                </p>

                              </div>


                              {checked && (
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
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
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
                        );
                      },
                    )}

                  </div>

                </Field>


                <Field
                  label="Invitation message"
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
                    placeholder="Optional welcome or access instructions"
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
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
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none dark:border-white/10 dark:bg-[#11151D]"
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
                    disabled={
                      inviteForm.saving
                    }
                    onClick={
                      closeInvite
                    }
                    className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
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
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >

                    {inviteForm.saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}

                    Send invitation

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
            aria-label="Close role editor"
            className="absolute inset-0"
            onClick={() =>
              !roleEditor.saving &&
              setRoleEditor(
                EMPTY_ROLE_EDITOR,
              )
            }
          />


          <aside className="relative z-10 h-full w-full max-w-[500px] overflow-y-auto bg-white shadow-2xl dark:bg-[#11151D]">

            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-white/10 dark:bg-[#11151D]">

              <div>

                <h2 className="text-sm font-bold">
                  Employee roles
                </h2>

                <p className="mt-0.5 text-[11px] text-slate-400">
                  {memberName(
                    roleEditor.member,
                  )}
                </p>

              </div>


              <button
                type="button"
                disabled={
                  roleEditor.saving
                }
                onClick={() =>
                  setRoleEditor(
                    EMPTY_ROLE_EDITOR,
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>

            </div>


            {roleEditor.loading ? (
              <div className="flex min-h-[300px] items-center justify-center">

                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />

              </div>
            ) : (
              <div className="p-5">

                {roleEditor.error && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                    {roleEditor.error}
                  </div>
                )}


                <div className="mb-5 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/20">

                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Effective access
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-blue-600/80 dark:text-blue-300/70">
                    Roles are additive. The employee receives the combined permissions of every selected role. Workspace ownership is not granted through roles.
                  </p>

                </div>


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
                          role.description ||
                          (
                            typeof role.permissionCount ===
                              'number'
                              ? `${role.permissionCount} permissions`
                              : null
                          )
                        }
                        disabled={
                          role.assignable ===
                          false
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
                    disabled={
                      roleEditor.saving
                    }
                    onClick={() =>
                      setRoleEditor(
                        EMPTY_ROLE_EDITOR,
                      )
                    }
                    className="h-9 rounded-lg px-4 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>


                  <button
                    type="button"
                    disabled={
                      roleEditor.saving ||
                      roleEditor.selected.size ===
                        0 ||
                      setsEqual(
                        roleEditor.selected,
                        roleEditor.original,
                      )
                    }
                    onClick={() =>
                      void saveRoles()
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >

                    {roleEditor.saving && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}

                    Save roles

                  </button>

                </div>

              </div>
            )}

          </aside>

        </div>
      )}


      {/* ========================================================
          LIFECYCLE CONFIRMATION
          ======================================================== */}

      {lifecycle.open &&
        lifecycle.member &&
        lifecycle.action && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5">

          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0"
            onClick={() =>
              !lifecycle.saving &&
              setLifecycle(
                EMPTY_LIFECYCLE_DIALOG,
              )
            }
          />


          <div className="relative z-10 w-full rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#15181F] sm:max-w-[480px] sm:rounded-2xl sm:p-6">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-600 dark:text-blue-400">
                  Employee lifecycle
                </p>


                <h2 className="mt-1 text-lg font-semibold">
                  {actionTitle(
                    lifecycle.action,
                  )}
                </h2>

              </div>


              <button
                type="button"
                disabled={
                  lifecycle.saving
                }
                onClick={() =>
                  setLifecycle(
                    EMPTY_LIFECYCLE_DIALOG,
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>

            </div>


            <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-white/5">

              <div className="flex items-center gap-3">

                <UserAvatar
                  avatarFileId={
                    lifecycle.member.avatarFileId
                  }
                  displayName={
                    memberName(
                      lifecycle.member,
                    )
                  }
                  initials={
                    memberInitials(
                      lifecycle.member,
                    )
                  }
                  size="md"
                />


                <div className="min-w-0">

                  <p className="truncate text-sm font-semibold">
                    {memberName(
                      lifecycle.member,
                    )}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {lifecycle.member.email}
                  </p>

                </div>

              </div>

            </div>


            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {actionDescription(
                lifecycle.action,
              )}
            </p>


            <label className="mt-5 block">

              <span className="text-xs font-semibold">
                {lifecycle.action ===
                    'suspend' ||
                  lifecycle.action ===
                    'remove'
                  ? 'Administrative reason'
                  : 'Reason / note'}
              </span>


              <textarea
                rows={
                  3
                }
                maxLength={
                  500
                }
                value={
                  lifecycle.reason
                }
                onChange={
                  event =>
                    setLifecycle(
                      current => ({
                        ...current,

                        reason:
                          event.target.value,
                      }),
                    )
                }
                placeholder={
                  lifecycle.action ===
                      'suspend' ||
                    lifecycle.action ===
                      'remove'
                    ? 'Required'
                    : 'Optional'
                }
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5"
              />


              <p className="mt-1 text-right text-[9px] text-slate-400">
                {lifecycle.reason.length}/500
              </p>

            </label>


            {lifecycle.error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                {lifecycle.error}
              </div>
            )}


            <div className="mt-6 flex justify-end gap-2">

              <button
                type="button"
                disabled={
                  lifecycle.saving
                }
                onClick={() =>
                  setLifecycle(
                    EMPTY_LIFECYCLE_DIALOG,
                  )
                }
                className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>


              <button
                type="button"
                disabled={
                  lifecycle.saving
                }
                onClick={() =>
                  void runLifecycleAction()
                }
                className={[
                  'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50',

                  lifecycle.action ===
                    'remove'
                    ? 'bg-red-600 hover:bg-red-700'
                    : lifecycle.action ===
                        'suspend'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : lifecycle.action ===
                          'reactivate'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-blue-600 hover:bg-blue-700',
                ].join(
                  ' ',
                )}
              >

                {lifecycle.saving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                Confirm

              </button>

            </div>

          </div>

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
  currentUserId,
  canManageUsers,
  canManageRoles,
  canManageInvitations,
  invitationAction,
  onDetails,
  onEditRoles,
  onLifecycle,
  onResend,
  onRevoke,
  onInviteAgain,
}: {
  record:
    AccessRecord;

  currentUserId:
    string;

  canManageUsers:
    boolean;

  canManageRoles:
    boolean;

  canManageInvitations:
    boolean;

  invitationAction:
    string | null;

  onDetails:
    (
      record:
        AccessRecord,
    ) => void;

  onEditRoles:
    (
      member:
        DirectoryMember,
    ) => void;

  onLifecycle:
    (
      member:
        DirectoryMember,

      action:
        LifecycleAction,
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

  onInviteAgain:
    (
      invitation:
        WorkspaceInvitation,
    ) => void;
}) {
  const protectedMember =
    record.kind ===
      'member' &&
    (
      record.member.isOwner ||
      record.member.userId ===
        currentUserId
    );


  return (
    <div className="grid gap-3 px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.02] lg:grid-cols-[minmax(240px,1.5fr)_90px_minmax(160px,1fr)_minmax(150px,1fr)_110px_120px_150px] lg:items-center">

      {/* PERSON */}

      <button
        type="button"
        onClick={() =>
          onDetails(
            record,
          )
        }
        className="flex min-w-0 items-center gap-3 text-left"
      >

        {record.kind ===
          'member' ? (
          <UserAvatar
            avatarFileId={
              record.member.avatarFileId
            }
            displayName={
              record.name
            }
            initials={
              memberInitials(
                record.member,
              )
            }
            size="sm"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
            <Mail className="h-4 w-4" />
          </div>
        )}


        <div className="min-w-0">

          <div className="flex items-center gap-1.5">

            <p className="truncate text-xs font-semibold">
              {record.name}
            </p>


            {record.kind ===
              'member' &&
              record.member.isOwner && (
              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}


            {record.kind ===
              'member' &&
              record.member.userId ===
                currentUserId && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-500 dark:bg-white/10">
                You
              </span>
            )}

          </div>


          <p className="mt-0.5 truncate text-[10px] text-slate-400">
            {record.email}
          </p>

        </div>

      </button>


      {/* TYPE */}

      <div>

        <span className="text-[10px] font-semibold capitalize text-slate-500 dark:text-slate-400">
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
            : record.kind ===
                'member' &&
              record.member.isOwner
              ? 'Workspace Owner'
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


      {/* ACTIVITY */}

      <div>

        <p className="truncate text-[10px] text-slate-400">
          {formatDate(
            record.date,
          )}
        </p>

      </div>


      {/* ACTIONS */}

      <div className="flex items-center justify-end gap-1">

        <button
          type="button"
          title="View details"
          onClick={() =>
            onDetails(
              record,
            )
          }
          className="flex h-8 items-center justify-center rounded-lg px-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        >
          Details
        </button>


        {record.kind ===
          'member' &&
          canManageRoles &&
          record.member.memberType ===
            'internal' &&
          record.status ===
            'active' &&
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
          'member' &&
          canManageUsers &&
          !protectedMember &&
          record.status ===
            'active' && (
          <button
            type="button"
            title="Suspend access"
            onClick={() =>
              onLifecycle(
                record.member,
                'suspend',
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            <PauseCircle className="h-3.5 w-3.5" />
          </button>
        )}


        {record.kind ===
          'member' &&
          canManageUsers &&
          !protectedMember &&
          record.status ===
            'suspended' && (
          <button
            type="button"
            title="Reactivate access"
            onClick={() =>
              onLifecycle(
                record.member,
                'reactivate',
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          >
            <PlayCircle className="h-3.5 w-3.5" />
          </button>
        )}


        {record.kind ===
          'member' &&
          canManageUsers &&
          !protectedMember &&
          record.status ===
            'removed' && (
          <button
            type="button"
            title="Restore employee"
            onClick={() =>
              onLifecycle(
                record.member,
                'restore',
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
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
              className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/30"
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
              className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
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


        {record.kind ===
          'invitation' &&
          (
            record.status ===
              'expired' ||
            record.status ===
              'revoked'
          ) &&
          canManageInvitations && (
          <button
            type="button"
            onClick={() =>
              onInviteAgain(
                record.invitation,
              )
            }
            title="Invite again"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
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
    AccessStatus;
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
              'removed'
            ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
            : status ===
                'expired'
              ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';


  return (
    <span
      className={[
        'inline-flex rounded-md px-2 py-1 text-[9px] font-semibold capitalize',

        classes,
      ].join(
        ' ',
      )}
    >
      {status}
    </span>
  );
}


/* ================================================================
   SUMMARY CARD
   ================================================================ */

function SummaryCard({
  label,
  value,
  active,
  onClick,
  tone =
    'neutral',
}: {
  label:
    string;

  value:
    number;

  active:
    boolean;

  onClick:
    () => void;

  tone?:
    'neutral'
    | 'success'
    | 'info'
    | 'warning'
    | 'danger';
}) {
  const numberClass =
    tone ===
      'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone ===
          'info'
        ? 'text-blue-600 dark:text-blue-400'
        : tone ===
            'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : tone ===
              'danger'
            ? 'text-red-600 dark:text-red-400'
            : 'text-slate-950 dark:text-white';


  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'rounded-xl border bg-white p-4 text-left transition dark:bg-white/[0.035]',

        active
          ? 'border-blue-500 ring-2 ring-blue-500/10 dark:border-blue-500'
          : 'border-slate-200 hover:border-slate-300 dark:border-white/10',
      ].join(
        ' ',
      )}
    >

      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>


      <p
        className={[
          'mt-2 text-xl font-bold',

          numberClass,
        ].join(
          ' ',
        )}
      >
        {value}
      </p>

    </button>
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
    ReactNode;
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
  disabled =
    false,
  onClick,
}: {
  checked:
    boolean;

  title:
    string;

  description:
    string | null;

  disabled?:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      disabled={
        disabled
      }
      onClick={
        onClick
      }
      className={[
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',

        checked
          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20'
          : 'border-slate-200 hover:border-slate-300 dark:border-white/10',
      ].join(
        ' ',
      )}
    >

      <div
        className={[
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',

          checked
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-slate-300 dark:border-slate-600',
        ].join(
          ' ',
        )}
      >
        {checked && (
          <Check className="h-3 w-3" />
        )}
      </div>


      <div className="min-w-0">

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
   DETAIL SECTION
   ================================================================ */

function DetailSection({
  title,
  children,
}: {
  title:
    string;

  children:
    ReactNode;
}) {
  return (
    <section>

      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {title}
      </p>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
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
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0 dark:border-white/10">

      <span className="text-[10px] font-medium text-slate-400">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-xs font-semibold">
        {value}
      </span>

    </div>
  );
}


/* ================================================================
   ACCESS PRINCIPLE
   ================================================================ */

function AccessPrinciple({
  icon:
    Icon,
  title,
  text,
}: {
  icon:
    typeof Shield;

  title:
    string;

  text:
    string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]">

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
        <Icon className="h-4 w-4" />
      </div>


      <div>

        <p className="text-xs font-semibold">
          {title}
        </p>

        <p className="mt-1 text-[10px] leading-4 text-slate-400">
          {text}
        </p>

      </div>

    </div>
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