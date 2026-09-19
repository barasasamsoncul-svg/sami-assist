import 'server-only';

import {
  getPermissionContext,
  permissionContextHas,
  permissionContextHasAll,
  permissionContextHasAny,
  type PermissionContext,
} from '@/lib/auth/permission-context';


/* ================================================================
   SaMi PERMISSION GUARDS
   ================================================================

   Category 8.6

   PURPOSE

   Turn the Category 8 permission resolver into reusable
   authorization guards for:

   - APIs
   - server actions
   - server components
   - services
   - future module routes

   TRUST CHAIN

       authenticated session
              ↓
       trusted workspace context
              ↓
       active internal membership
              ↓
       effective role permissions
              ↓
       exact permission guard

   Example:

       await requirePermission(
         'users.view'
       );

   instead of:

       await requireWorkspaceAdmin();

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type PermissionGuardContext =
  PermissionContext;


export type PermissionGuardCode =
  | 'INVALID_PERMISSION'
  | 'PERMISSION_REQUIRED'
  | 'ANY_PERMISSION_REQUIRED'
  | 'ALL_PERMISSIONS_REQUIRED';


/* ================================================================
   ERROR
   ================================================================ */

export class PermissionGuardError
  extends Error {
  readonly code:
    PermissionGuardCode;

  readonly permissions:
    string[];


  constructor(
    code:
      PermissionGuardCode,

    message:
      string,

    permissions:
      string[] =
        [],
  ) {
    super(
      message,
    );

    this.name =
      'PermissionGuardError';

    this.code =
      code;

    this.permissions =
      permissions;
  }
}


/* ================================================================
   NORMALIZE PERMISSION
   ================================================================ */

function normalizePermission(
  value:
    string,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new PermissionGuardError(
      'INVALID_PERMISSION',
      'A valid permission key is required.',
    );
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    !normalized
  ) {
    throw new PermissionGuardError(
      'INVALID_PERMISSION',
      'A valid permission key is required.',
    );
  }


  return normalized;
}


/* ================================================================
   NORMALIZE PERMISSION LIST
   ================================================================ */

function normalizePermissions(
  permissions:
    readonly string[],
): string[] {
  if (
    !Array.isArray(
      permissions,
    )
  ) {
    throw new PermissionGuardError(
      'INVALID_PERMISSION',
      'Permission keys must be provided as an array.',
    );
  }


  const normalized =
    permissions.map(
      normalizePermission,
    );


  return [
    ...new Set(
      normalized,
    ),
  ];
}


/* ================================================================
   ASSERT ONE PERMISSION
   ================================================================ */

export function assertPermission(
  context:
    PermissionContext,

  permission:
    string,
): void {
  const normalized =
    normalizePermission(
      permission,
    );


  if (
    !permissionContextHas(
      context,
      normalized,
    )
  ) {
    throw new PermissionGuardError(
      'PERMISSION_REQUIRED',
      'You do not have permission to perform this action.',
      [
        normalized,
      ],
    );
  }
}


/* ================================================================
   ASSERT ANY PERMISSION
   ================================================================ */

export function assertAnyPermission(
  context:
    PermissionContext,

  permissions:
    readonly string[],
): void {
  const normalized =
    normalizePermissions(
      permissions,
    );


  if (
    normalized.length ===
      0
  ) {
    throw new PermissionGuardError(
      'INVALID_PERMISSION',
      'At least one permission is required.',
    );
  }


  if (
    !permissionContextHasAny(
      context,
      normalized,
    )
  ) {
    throw new PermissionGuardError(
      'ANY_PERMISSION_REQUIRED',
      'You do not have permission to perform this action.',
      normalized,
    );
  }
}


/* ================================================================
   ASSERT ALL PERMISSIONS
   ================================================================ */

export function assertAllPermissions(
  context:
    PermissionContext,

  permissions:
    readonly string[],
): void {
  const normalized =
    normalizePermissions(
      permissions,
    );


  if (
    normalized.length ===
      0
  ) {
    throw new PermissionGuardError(
      'INVALID_PERMISSION',
      'At least one permission is required.',
    );
  }


  if (
    !permissionContextHasAll(
      context,
      normalized,
    )
  ) {
    throw new PermissionGuardError(
      'ALL_PERMISSIONS_REQUIRED',
      'You do not have all permissions required to perform this action.',
      normalized,
    );
  }
}


/* ================================================================
   REQUIRE ONE PERMISSION
   ================================================================ */

export async function requirePermission(
  permission:
    string,
): Promise<PermissionGuardContext> {
  const context =
    await getPermissionContext();


  assertPermission(
    context,
    permission,
  );


  return context;
}


/* ================================================================
   REQUIRE ANY PERMISSION
   ================================================================ */

export async function requireAnyPermission(
  permissions:
    readonly string[],
): Promise<PermissionGuardContext> {
  const context =
    await getPermissionContext();


  assertAnyPermission(
    context,
    permissions,
  );


  return context;
}


/* ================================================================
   REQUIRE ALL PERMISSIONS
   ================================================================ */

export async function requireAllPermissions(
  permissions:
    readonly string[],
): Promise<PermissionGuardContext> {
  const context =
    await getPermissionContext();


  assertAllPermissions(
    context,
    permissions,
  );


  return context;
}


/* ================================================================
   BOOLEAN HELPERS

   For server-rendered UI where we want to show/hide controls
   instead of throwing an authorization error.
   ================================================================ */

export function can(
  context:
    PermissionContext,

  permission:
    string,
): boolean {
  try {
    const normalized =
      normalizePermission(
        permission,
      );


    return permissionContextHas(
      context,
      normalized,
    );
  } catch {
    return false;
  }
}


export function canAny(
  context:
    PermissionContext,

  permissions:
    readonly string[],
): boolean {
  try {
    const normalized =
      normalizePermissions(
        permissions,
      );


    if (
      normalized.length ===
        0
    ) {
      return false;
    }


    return permissionContextHasAny(
      context,
      normalized,
    );
  } catch {
    return false;
  }
}


export function canAll(
  context:
    PermissionContext,

  permissions:
    readonly string[],
): boolean {
  try {
    const normalized =
      normalizePermissions(
        permissions,
      );


    if (
      normalized.length ===
        0
    ) {
      return false;
    }


    return permissionContextHasAll(
      context,
      normalized,
    );
  } catch {
    return false;
  }
}