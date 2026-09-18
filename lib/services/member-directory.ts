import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getWorkspaceMembershipSummary,
  listWorkspaceMembers,
  type WorkspaceMemberType,
  type WorkspaceMembershipStatus,
} from '@/lib/services/membership';


/* ================================================================
   SaMi MEMBER DIRECTORY SERVICE
   ================================================================

   Category 7.7 — Member Directory

   PURPOSE

   Build one safe administrative read model containing:

   - user identity
   - workspace membership
   - internal / portal type
   - membership status
   - ownership
   - role summary
   - company access
   - default company
   - activity information

   IMPORTANT

   This service is READ-ONLY.

   Mutations remain separated:

   Category 7.3
       membership lifecycle

   Category 7.5
       company access

   Category 8
       roles and permissions

   Category 9
       invitations

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export interface MemberDirectoryRole {
  id:
    string;

  key:
    string | null;

  name:
    string;
}


export interface MemberDirectoryCompany {
  id:
    string;

  name:
    string;

  isDefault:
    boolean;
}


export interface MemberDirectoryMember {
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
    WorkspaceMemberType;

  membershipStatus:
    WorkspaceMembershipStatus;

  accessState:
    string;

  canEnterWorkspace:
    boolean;

  isOwner:
    boolean;

  defaultCompanyId:
    string | null;

  roles:
    MemberDirectoryRole[];

  companies:
    MemberDirectoryCompany[];

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
}


export interface MemberDirectorySummary {
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
}


export interface WorkspaceMemberDirectory {
  tenantId:
    string;

  workspaceName:
    string;

  generatedAt:
    string;

  summary:
    MemberDirectorySummary;

  members:
    MemberDirectoryMember[];
}


/* ================================================================
   INTERNAL TYPES
   ================================================================ */

type RoleRow = {
  user_id:
    string;

  role_id:
    string;

  role_key:
    string | null;

  role_name:
    string;
};


type CompanyRow = {
  user_id:
    string;

  company_id:
    string;

  company_name:
    string;

  company_is_active:
    boolean;

  company_archived_at:
    Date | string | null;

  access_status:
    string;

  access_is_default:
    boolean;
};


/* ================================================================
   ROLE MAP
   ================================================================ */

async function loadRoleMap(
  tenantId:
    string,

  userIds:
    string[],
): Promise<
  Map<
    string,
    MemberDirectoryRole[]
  >
> {
  const roleMap =
    new Map<
      string,
      MemberDirectoryRole[]
    >();


  if (
    userIds.length ===
      0
  ) {
    return roleMap;
  }


  /*
   * queryControl() is intentionally not generic in lib/db/control.ts.
   *
   * Therefore we execute normally and narrow result.rows after the
   * database call instead of writing queryControl<RoleRow>().
   */
  const result =
    await queryControl(
      `
        SELECT
          ur.user_id,

          r.id
            AS role_id,

          r.key
            AS role_key,

          r.name
            AS role_name

        FROM user_roles ur

        INNER JOIN roles r
          ON r.id =
             ur.role_id

        WHERE ur.tenant_id = $1

          AND ur.user_id =
              ANY(
                $2::UUID[]
              )

          AND ur.deleted_at
              IS NULL

          AND r.deleted_at
              IS NULL

        ORDER BY
          ur.user_id ASC,

          CASE
            WHEN LOWER(
              COALESCE(
                r.key,
                r.name,
                ''
              )
            ) LIKE '%admin%'
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            r.name
          ) ASC,

          ur.created_at ASC
      `,
      [
        tenantId,
        userIds,
      ],
    );


  const rows =
    result.rows as RoleRow[];


  for (
    const row
    of rows
  ) {
    const userId =
      String(
        row.user_id,
      );


    const current =
      roleMap.get(
        userId,
      ) ||
      [];


    current.push({
      id:
        String(
          row.role_id,
        ),

      key:
        typeof row.role_key ===
          'string'
          ? row.role_key
          : null,

      name:
        typeof row.role_name ===
          'string'
          ? row.role_name
          : '',
    });


    roleMap.set(
      userId,
      current,
    );
  }


  return roleMap;
}


/* ================================================================
   COMPANY MAP
   ================================================================ */

async function loadCompanyMap(
  tenantId:
    string,

  userIds:
    string[],

  defaultCompanyByUser:
    Map<
      string,
      string | null
    >,
): Promise<
  Map<
    string,
    MemberDirectoryCompany[]
  >
> {
  const companyMap =
    new Map<
      string,
      MemberDirectoryCompany[]
    >();


  if (
    userIds.length ===
      0
  ) {
    return companyMap;
  }


  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );


  const result =
    await pool.query<CompanyRow>(
      `
        SELECT
          cu.user_id,

          c.id
            AS company_id,

          c.name
            AS company_name,

          c.is_active
            AS company_is_active,

          c.archived_at
            AS company_archived_at,

          cu.status
            AS access_status,

          cu.is_default
            AS access_is_default

        FROM company_users cu

        INNER JOIN companies c
          ON c.id =
             cu.company_id

        WHERE cu.user_id =
              ANY(
                $1::UUID[]
              )

          AND LOWER(
            COALESCE(
              cu.status,
              ''
            )
          ) = 'active'

          AND c.is_active =
              TRUE

          AND c.archived_at
              IS NULL

        ORDER BY
          cu.user_id ASC,

          CASE
            WHEN cu.is_default =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            c.name
          ) ASC,

          c.created_at ASC
      `,
      [
        userIds,
      ],
    );


  for (
    const row
    of result.rows
  ) {
    const userId =
      String(
        row.user_id,
      );


    const companyId =
      String(
        row.company_id,
      );


    const current =
      companyMap.get(
        userId,
      ) ||
      [];


    const authoritativeDefault =
      defaultCompanyByUser.get(
        userId,
      );


    current.push({
      id:
        companyId,

      name:
        typeof row.company_name ===
          'string'
          ? row.company_name
          : '',

      isDefault:
        authoritativeDefault
          ? authoritativeDefault ===
              companyId
          : row.access_is_default ===
              true,
    });


    companyMap.set(
      userId,
      current,
    );
  }


  return companyMap;
}


/* ================================================================
   BUILD DIRECTORY
   ================================================================ */

export async function buildWorkspaceMemberDirectory(
  tenantId:
    string,
): Promise<WorkspaceMemberDirectory> {
  /*
   * Include removed memberships because this is an administrative
   * directory rather than merely an active-user selector.
   */
  const [
    memberships,
    summary,
  ] =
    await Promise.all([
      listWorkspaceMembers(
        tenantId,
        {
          includeRemoved:
            true,
        },
      ),

      getWorkspaceMembershipSummary(
        tenantId,
      ),
    ]);


  const userIds =
    [
      ...new Set(
        memberships.map(
          membership =>
            membership.userId,
        ),
      ),
    ];


  const defaultCompanyByUser =
    new Map<
      string,
      string | null
    >(
      memberships.map(
        membership => [
          membership.userId,
          membership
            .defaultCompanyId,
        ],
      ),
    );


  const [
    roleMap,
    companyMap,
  ] =
    await Promise.all([
      loadRoleMap(
        tenantId,
        userIds,
      ),

      loadCompanyMap(
        tenantId,
        userIds,
        defaultCompanyByUser,
      ),
    ]);


  const members:
    MemberDirectoryMember[] =
    memberships.map(
      membership => ({
        membershipId:
          membership.id,

        userId:
          membership.userId,

        email:
          membership.email,

        firstName:
          membership.firstName,

        lastName:
          membership.lastName,

        fullName:
          membership.fullName,

        avatarFileId:
          membership.avatarFileId,

        accountStatus:
          membership.userStatus,

        memberType:
          membership.memberType,

        membershipStatus:
          membership.status,

        accessState:
          membership.accessState,

        canEnterWorkspace:
          membership.canEnterWorkspace,

        isOwner:
          membership.isOwner,

        defaultCompanyId:
          membership.defaultCompanyId,

        roles:
          roleMap.get(
            membership.userId,
          ) ||
          [],

        companies:
          companyMap.get(
            membership.userId,
          ) ||
          [],

        invitedAt:
          membership.invitedAt,

        joinedAt:
          membership.joinedAt,

        lastActiveAt:
          membership.lastActiveAt,

        suspendedAt:
          membership.suspendedAt,

        deletedAt:
          membership.deletedAt,
      }),
    );


  return {
    tenantId,

    workspaceName:
      memberships[0]
        ?.workspaceName ||
      '',

    generatedAt:
      new Date()
        .toISOString(),

    summary,

    members,
  };
}