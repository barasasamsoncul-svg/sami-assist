import 'server-only';

import {
  requireTenantContext,
  type TrustedTenantContext,
} from '@/lib/auth/tenant-context';


/* ================================================================
   SaMi WORKSPACE ACCESS GUARDS
   ================================================================

   Category 7.8 — Membership Guards

   IMPORTANT

   This file does NOT resolve authentication, membership or tenant
   database access itself.

   That responsibility remains exclusively in:

       lib/auth/tenant-context.ts

   This layer only answers:

       Is a valid internal workspace member enough?
       Does this operation require workspace admin?
       Does this operation require workspace owner?

   Category 8 will later introduce granular permissions such as:

       users.view
       users.manage
       roles.manage
       companies.manage
       billing.manage

   Until then SaMi safely uses:

       member
       admin
       owner

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type WorkspaceGuardLevel =
  | 'member'
  | 'admin'
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
   ================================================================

   requireTenantContext() already guarantees:

   - valid authenticated session
   - active account
   - active internal membership
   - active workspace
   - active tenant database

   Therefore no extra query is needed here.

   ================================================================ */

export async function requireWorkspaceMember():
  Promise<WorkspaceGuardContext> {
  return requireTenantContext();
}


/* ================================================================
   ADMIN
   ================================================================

   Workspace owner automatically satisfies admin access.

   Category 8 will eventually change this to permission-driven
   authorization rather than the current broad admin role.

   ================================================================ */

export async function requireWorkspaceAdmin():
  Promise<WorkspaceGuardContext> {
  const context =
    await requireTenantContext();


  if (
    !context.isAdmin &&
    !context.isOwner
  ) {
    throw new WorkspaceGuardError(
      'WORKSPACE_ADMIN_REQUIRED',
      'Workspace administrator access is required.',
    );
  }


  return context;
}


/* ================================================================
   OWNER
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
   BOOLEAN HELPERS
   ================================================================

   These are useful when UI/server rendering needs capability
   information without triggering authorization exceptions.

   ================================================================ */

export function canAdminWorkspace(
  context:
    Pick<
      TrustedTenantContext,
      'isOwner' | 'isAdmin'
    >,
): boolean {
  return (
    context.isOwner ===
      true ||
    context.isAdmin ===
      true
  );
}


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
   ASSERT EXISTING CONTEXT
   ================================================================

   Use these when trusted context has already been resolved and we
   do NOT want another requireTenantContext() call.

   ================================================================ */

export function assertWorkspaceAdmin(
  context:
    WorkspaceGuardContext,
): void {
  if (
    !context.isAdmin &&
    !context.isOwner
  ) {
    throw new WorkspaceGuardError(
      'WORKSPACE_ADMIN_REQUIRED',
      'Workspace administrator access is required.',
    );
  }
}


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