import 'server-only';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

export type SamiDeveloperScopeDefinition = {
  key: string;
  name: string;
  description: string;
  operation:
    'read' |
    'write';
  requiredPermissions:
    string[];
};

export const SAMI_DEVELOPER_SCOPES:
  readonly SamiDeveloperScopeDefinition[] = [
    {
      key:
        'context.read',
      name:
        'Workspace context',
      description:
        'Read the authenticated workspace and company context for this API credential.',
      operation:
        'read',
      requiredPermissions: [
        SAMI_PERMISSIONS
          .WORKSPACE_VIEW,
      ],
    },
    {
      key:
        'apps.read',
      name:
        'Business app records',
      description:
        'Read bounded, company-scoped records from explicitly allowed installed SaMi apps.',
      operation:
        'read',
      requiredPermissions:
        [],
    },
    {
      key:
        'files.read',
      name:
        'Files metadata',
      description:
        'Read company-scoped file metadata through future registered developer endpoints.',
      operation:
        'read',
      requiredPermissions: [
        SAMI_PERMISSIONS
          .FILES_VIEW,
      ],
    },
    {
      key:
        'audit.read',
      name:
        'Audit metadata',
      description:
        'Read company audit metadata through future registered developer endpoints.',
      operation:
        'read',
      requiredPermissions: [
        SAMI_PERMISSIONS
          .AUDIT_VIEW,
      ],
    },
    {
      key:
        'integrations.read',
      name:
        'Integration metadata',
      description:
        'Read company integration metadata through future registered developer endpoints.',
      operation:
        'read',
      requiredPermissions: [
        SAMI_PERMISSIONS
          .INTEGRATIONS_VIEW,
      ],
    },
  ] as const;

type ScopeRuntime = {
  isOwner:
    boolean;
  permissionSet:
    ReadonlySet<string>;
};

export function getDeveloperScope(
  key:
    string,
) {
  return SAMI_DEVELOPER_SCOPES
    .find(
      scope =>
        scope.key ===
        key,
    ) ||
    null;
}

export function getAccessibleDeveloperScopes(
  runtime:
    ScopeRuntime,
) {
  return SAMI_DEVELOPER_SCOPES
    .filter(
      scope =>
        runtime.isOwner ||
        scope.requiredPermissions
          .every(
            permission =>
              runtime.permissionSet
                .has(
                  permission,
                ),
          ),
    );
}
