import 'server-only';

import {
  requireTenantContext,
  type TrustedTenantContext,
} from '@/lib/auth/tenant-context';


/* ================================================================
   SaMi WORKSPACE STRUCTURAL GUARDS
   ================================================================

   Category 7.8 / Category 8.7

   PURPOSE

   This file now deals with STRUCTURAL workspace relationships:

       member
       owner

   Granular authorization belongs to:

       lib/auth/permission-guards.ts

   Use:

       requirePermission('users.view')
       requirePermission('users.manage')
       requirePermission('roles.manage')
       ...

   instead of broad Admin checks.

   ================================================================ */


export type WorkspaceGuardLevel =
  | 'member'
  | 'owner';


export type WorkspaceGuardContext =
  TrustedTenantContext;


/* ================================================================
   ERROR
   ================================================================ */

export class WorkspaceGuardError
  extends Error {
  readonly code:
    | 'WORKSPACE_ADMIN_REQUIRED'
    | 'WORKSPACE_OWNER_REQUIRED';


  constructor(
    code:
      | 'WORKSPACE_ADMIN_REQUIRED'
      | 'WORKSPACE_OWNER_REQUIRED',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceGuardError';

    this.code =
      code;
  }
}


/* ================================================================
   MEMBER
   ================================================================ */

export async function requireWorkspaceMember():
  Promise<WorkspaceGuardContext> {
  return requireTenantContext();
}


/* ================================================================
   OWNER
   ================================================================

   Ownership is structural:

       tenant_users.is_owner

   It is deliberately separate from RBAC.
   ================================================================ */

export async function requireWorkspaceOwner():
  Promise<WorkspaceGuardContext> {
  const context =
    await requireTenantContext();


  if (
    !context.isOwner
  ) {
    throw new WorkspaceGuardError(
      'WORKSPACE_OWNER_REQUIRED',
      'Workspace owner access is required.',
    );
  }


  return context;
}


/* ================================================================
   OWNER BOOLEAN
   ================================================================ */

export function isWorkspaceOwner(
  context:
    Pick<
      TrustedTenantContext,
      'isOwner'
    >,
): boolean {
  return context.isOwner ===
    true;
}


/* ================================================================
   OWNER ASSERTION
   ================================================================ */

export function assertWorkspaceOwner(
  context:
    WorkspaceGuardContext,
): void {
  if (
    !context.isOwner
  ) {
    throw new WorkspaceGuardError(
      'WORKSPACE_OWNER_REQUIRED',
      'Workspace owner access is required.',
    );
  }
}


/* ================================================================
   LEGACY ADMIN COMPATIBILITY
   ================================================================

   DEPRECATED.

   New feature authorization must NOT use these functions.

   They remain temporarily to protect older call sites while
   Category 8 migration completes.

   isAdmin now means ONLY:

       exact protected system Admin role
       OR
       structural workspace owner

   There is no role-name guessing anymore.

   ================================================================ */

/**
 * @deprecated
 * Use requirePermission() from permission-guards.ts.
 */
export async function requireWorkspaceAdmin():
  Promise<WorkspaceGuardContext> {
  const context =
    await requireTenantContext();


  if (
    !context.isAdmin
  ) {
    throw new WorkspaceGuardError(
      'WORKSPACE_ADMIN_REQUIRED',
      'Workspace administrator access is required.',
    );
  }


  return context;
}


/**
 * @deprecated
 * Use can() from permission-guards.ts.
 */
export function canAdminWorkspace(
  context:
    Pick<
      TrustedTenantContext,
      'isAdmin'
    >,
): boolean {
  return context.isAdmin ===
    true;
}


/**
 * @deprecated
 * Use assertPermission() from permission-guards.ts.
 */
export function assertWorkspaceAdmin(
  context:
    WorkspaceGuardContext,
): void {
  if (
    !context.isAdmin
  ) {
    throw new WorkspaceGuardError(
      'WORKSPACE_ADMIN_REQUIRED',
      'Workspace administrator access is required.',
    );
  }
}