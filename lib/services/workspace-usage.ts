import 'server-only';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  getSession,
} from '@/lib/auth/session';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getWorkspaceUsageSnapshot,
  WorkspaceUsageError,
} from '@/lib/usage/entitlements';


export class WorkspaceUsageAccessError
  extends Error {
  readonly code:
    | 'UNAUTHENTICATED'
    | 'WORKSPACE_CONTEXT_CHANGED'
    | 'USAGE_VIEW_REQUIRED'
    | 'USAGE_UNAVAILABLE';

  constructor(
    code:
      WorkspaceUsageAccessError['code'],
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceUsageAccessError';

    this.code =
      code;
  }
}


export async function getWorkspaceUsageState() {
  const [
    session,
    permissions,
  ] =
    await Promise.all([
      getSession(),
      getPermissionContext(),
    ]);

  if (
    !session
  ) {
    throw new WorkspaceUsageAccessError(
      'UNAUTHENTICATED',
      'Sign in to view workspace usage.',
    );
  }

  if (
    session.sessionId !==
      permissions.sessionId ||
    session.user.id !==
      permissions.userId ||
    session.currentTenantId !==
      permissions.tenantId
  ) {
    throw new WorkspaceUsageAccessError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const canViewWorkspaceUsage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
    );

  if (
    !canViewWorkspaceUsage
  ) {
    throw new WorkspaceUsageAccessError(
      'USAGE_VIEW_REQUIRED',
      'You do not have access to workspace usage and entitlement information.',
    );
  }

  try {
    const snapshot =
      await getWorkspaceUsageSnapshot({
        tenantId:
          permissions.tenantId,
        userId:
          permissions.userId,
      });

    return {
      ...snapshot,
      viewer: {
        userId:
          permissions.userId,
        isOwner:
          permissions.isOwner,
      },
    };
  } catch (
    error
  ) {
    if (
      error instanceof
        WorkspaceUsageError
    ) {
      throw new WorkspaceUsageAccessError(
        'USAGE_UNAVAILABLE',
        error.message,
      );
    }

    throw error;
  }
}
