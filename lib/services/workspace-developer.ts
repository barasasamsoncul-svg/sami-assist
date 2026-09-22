import 'server-only';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getSamiPlanPolicy,
} from '@/lib/billing/plan-policy';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

import {
  getSession,
} from '@/lib/auth/session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  developerKeyHint,
  formatDeveloperApiKey,
  generateDeveloperPublicId,
  generateDeveloperSecret,
  hashDeveloperSecret,
} from '@/lib/developer/credentials';

import {
  getAccessibleDeveloperScopes,
} from '@/lib/developer/scopes';

import {
  requireCompanyAccess,
} from '@/lib/services/company-access';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceDeveloperErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'API_VIEW_REQUIRED'
  | 'API_MANAGE_REQUIRED'
  | 'API_PLAN_REQUIRED'
  | 'INVALID_API_CREDENTIAL'
  | 'API_CREDENTIAL_NOT_FOUND'
  | 'API_SCOPE_NOT_ALLOWED'
  | 'API_CREDENTIAL_INACTIVE';

export class WorkspaceDeveloperError
  extends Error {
  constructor(
    public readonly code:
      WorkspaceDeveloperErrorCode,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceDeveloperError';
  }
}

type DeveloperWorkspaceContext = {
  userId:
    string;
  sessionId:
    string;
  tenantId:
    string;
  companyId:
    string;
  isOwner:
    boolean;
  permissionSet:
    ReadonlySet<string>;
  accessibleApps:
    {
      key:
        string;
      name:
        string;
    }[];
  canManage:
    boolean;
};

function cleanText(
  value:
    unknown,
  limit:
    number,
) {
  return typeof value ===
    'string'
    ? value
        .replace(
          /[\u0000-\u001f\u007f]/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()
        .slice(
          0,
          limit,
        )
    : '';
}

function stringArray(
  value:
    unknown,
) {
  return Array.isArray(
    value,
  )
    ? Array.from(
        new Set(
          value
            .filter(
              (
                item:
                  unknown,
              ) =>
                typeof item ===
                  'string',
            )
            .map(
              (
                item:
                  string,
              ) =>
                item
                  .trim()
                  .toLowerCase(),
            )
            .filter(
              Boolean,
            ),
        ),
      )
    : [];
}

function requireUuid(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string' ||
    !UUID_RE.test(
      value,
    )
  ) {
    throw new WorkspaceDeveloperError(
      'INVALID_API_CREDENTIAL',
      'A valid API credential ID is required.',
    );
  }

  return value;
}

async function resolveWorkspaceDeveloperContext(
  required:
    'view' |
    'manage' =
    'view',
): Promise<DeveloperWorkspaceContext> {
  const [
    permissions,
    session,
  ] =
    await Promise.all([
      getPermissionContext(),
      getSession(),
    ]);

  if (
    !session
  ) {
    throw new WorkspaceDeveloperError(
      'UNAUTHENTICATED',
      'Sign in to use Developer Access.',
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
    throw new WorkspaceDeveloperError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const companyId =
    session.currentCompanyId;

  if (
    !companyId
  ) {
    throw new WorkspaceDeveloperError(
      'COMPANY_REQUIRED',
      'Select a company before using Developer Access.',
    );
  }

  try {
    await requireCompanyAccess(
      permissions.tenantId,
      permissions.userId,
      companyId,
    );
  } catch {
    if (
      !permissions.isOwner
    ) {
      throw new WorkspaceDeveloperError(
        'COMPANY_ACCESS_DENIED',
        'You do not have access to the selected company.',
      );
    }
  }

  const canView =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .API_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .API_MANAGE,
    );

  const canManage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .API_MANAGE,
    );

  if (
    !canView
  ) {
    throw new WorkspaceDeveloperError(
      'API_VIEW_REQUIRED',
      'You do not have permission to view Developer Access.',
    );
  }

  if (
    required ===
      'manage' &&
    !canManage
  ) {
    throw new WorkspaceDeveloperError(
      'API_MANAGE_REQUIRED',
      'You do not have permission to manage API credentials.',
    );
  }

  const account =
    await getAccountContextForUser(
      permissions.userId,
      permissions.tenantId,
    );

  const [
    planPolicy,
    subscriptionAccess,
  ] =
    await Promise.all([
      Promise.resolve(
        getSamiPlanPolicy(
          account.subscription
            ?.planKey,
        ),
      ),
      getWorkspaceSubscriptionAccessState(
        permissions.tenantId,
      ),
    ]);

  if (
    !account.subscription ||
    !subscriptionAccess
      .entitled ||
    planPolicy
      ?.developerApi
      .enabled !==
      true
  ) {
    throw new WorkspaceDeveloperError(
      'API_PLAN_REQUIRED',
      'Developer API access requires an active Custom subscription.',
    );
  }

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    });

  return {
    userId:
      permissions.userId,
    sessionId:
      permissions.sessionId,
    tenantId:
      permissions.tenantId,
    companyId,
    isOwner:
      permissions.isOwner,
    permissionSet:
      permissions.permissionSet,
    accessibleApps:
      shell.accessibleModules
        .map(
          module => ({
            key:
              String(
                module.key,
              )
                .trim()
                .toLowerCase(),
            name:
              String(
                module.name ||
                module.key,
              ),
          }),
        ),
    canManage,
  };
}

async function auditDeveloper(
  context:
    DeveloperWorkspaceContext,
  input: {
    action:
      string;
    resourceId?:
      string | null;
    summary:
      string;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      actorType:
        'human',
      action:
        input.action,
      eventType:
        input.action,
      category:
        'activity',
      severity:
        'info',
      result:
        'success',
      resourceType:
        'api_credential',
      resourceId:
        input.resourceId ||
        undefined,
      entityType:
        'api_credential',
      entityId:
        input.resourceId ||
        undefined,
      module:
        'developer',
      summary:
        input.summary,
      metadata:
        input.metadata ||
        {},
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Developer] Audit write failed:',
      error,
    );
  }
}

function rowToCredential(
  tenantId:
    string,
  row:
    Record<
      string,
      unknown
    >,
) {
  const publicId =
    String(
      row.public_id,
    );

  return {
    id:
      String(
        row.id,
      ),
    name:
      String(
        row.name,
      ),
    status:
      String(
        row.status,
      ),
    keyHint:
      String(
        row.key_hint ||
        '',
      ),
    displayKey:
      'sami_live_' +
      tenantId.slice(
        0,
        8,
      ) +
      '…_' +
      publicId.slice(
        0,
        8,
      ) +
      '…' +
      String(
        row.key_hint ||
        '',
      ),
    scopes:
      stringArray(
        row.scopes,
      ),
    allowedAppKeys:
      stringArray(
        row.allowed_app_keys,
      ),
    rateLimitPerMinute:
      Number(
        row.rate_limit_per_minute ||
        60,
      ),
    expiresAt:
      row.expires_at ||
      null,
    lastUsedAt:
      row.last_used_at ||
      null,
    rotatedAt:
      row.rotated_at ||
      null,
    revokedAt:
      row.revoked_at ||
      null,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

export async function getWorkspaceDeveloperState() {
  const context =
    await resolveWorkspaceDeveloperContext(
      'view',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const [
    credentials,
    requests,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT
            id,
            name,
            public_id,
            key_hint,
            scopes,
            allowed_app_keys,
            rate_limit_per_minute,
            CASE
              WHEN status = 'active'
               AND expires_at IS NOT NULL
               AND expires_at <= NOW()
              THEN 'expired'
              ELSE status
            END
              AS status,
            expires_at,
            last_used_at,
            rotated_at,
            revoked_at,
            created_at,
            updated_at
          FROM api_credentials
          WHERE company_id = $1
          ORDER BY
            created_at DESC,
            id DESC
        `,
        [
          context.companyId,
        ],
      ),

      pool.query(
        `
          SELECT
            l.id,
            l.request_id,
            l.route_key,
            l.method,
            l.status_code,
            l.outcome,
            l.duration_ms,
            l.rate_limited,
            l.created_at,
            k.name
              AS credential_name
          FROM api_request_logs l
          LEFT JOIN api_credentials k
            ON k.id =
               l.credential_id
          WHERE l.company_id = $1
          ORDER BY
            l.created_at DESC,
            l.id DESC
          LIMIT 50
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  return {
    canManage:
      context.canManage,

    scopes:
      getAccessibleDeveloperScopes({
        isOwner:
          context.isOwner,
        permissionSet:
          context.permissionSet,
      }),

    apps:
      context.accessibleApps,

    credentials:
      credentials.rows.map(
        row =>
          rowToCredential(
            context.tenantId,
            row,
          ),
      ),

    requests:
      requests.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          requestId:
            String(
              row.request_id,
            ),
          credentialName:
            row.credential_name
              ? String(
                  row.credential_name,
                )
              : 'Revoked credential',
          routeKey:
            String(
              row.route_key,
            ),
          method:
            String(
              row.method,
            ),
          statusCode:
            Number(
              row.status_code,
            ),
          outcome:
            String(
              row.outcome,
            ),
          durationMs:
            Number(
              row.duration_ms ||
              0,
            ),
          rateLimited:
            row.rate_limited ===
              true,
          createdAt:
            row.created_at,
        }),
      ),
  };
}

export async function createWorkspaceApiCredential(
  input: {
    name?:
      unknown;
    scopes?:
      unknown;
    allowedAppKeys?:
      unknown;
    rateLimitPerMinute?:
      unknown;
    expiresInDays?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceDeveloperContext(
      'manage',
    );

  const name =
    cleanText(
      input.name,
      200,
    );

  if (
    !name
  ) {
    throw new WorkspaceDeveloperError(
      'INVALID_API_CREDENTIAL',
      'API credential name is required.',
    );
  }

  const availableScopes =
    getAccessibleDeveloperScopes({
      isOwner:
        context.isOwner,
      permissionSet:
        context.permissionSet,
    });

  const allowedScopeSet =
    new Set(
      availableScopes.map(
        scope =>
          scope.key,
      ),
    );

  const scopes =
    stringArray(
      input.scopes,
    );

  if (
    scopes.length ===
      0 ||
    scopes.some(
      scope =>
        !allowedScopeSet.has(
          scope,
        ),
    )
  ) {
    throw new WorkspaceDeveloperError(
      'API_SCOPE_NOT_ALLOWED',
      'Choose at least one API scope that your current access allows.',
    );
  }

  const accessibleAppSet =
    new Set(
      context.accessibleApps
        .map(
          app =>
            app.key,
        ),
    );

  const allowedAppKeys =
    stringArray(
      input.allowedAppKeys,
    );

  if (
    allowedAppKeys.some(
      key =>
        !accessibleAppSet.has(
          key,
        ),
    )
  ) {
    throw new WorkspaceDeveloperError(
      'API_SCOPE_NOT_ALLOWED',
      'An API credential cannot be granted an app you cannot currently access.',
    );
  }

  const rateLimitPerMinute =
    Math.max(
      1,
      Math.min(
        600,
        Number.isFinite(
          Number(
            input.rateLimitPerMinute,
          ),
        )
          ? Math.round(
              Number(
                input.rateLimitPerMinute,
              ),
            )
          : 60,
      ),
    );

  const expiresInDays =
    Number(
      input.expiresInDays ||
      0,
    );

  const allowedExpiry =
    new Set([
      0,
      30,
      90,
      365,
    ]);

  if (
    !allowedExpiry.has(
      expiresInDays,
    )
  ) {
    throw new WorkspaceDeveloperError(
      'INVALID_API_CREDENTIAL',
      'Choose a supported API credential expiry.',
    );
  }

  const expiresAt =
    expiresInDays >
      0
      ? new Date(
          Date.now() +
            expiresInDays *
              24 *
              60 *
              60 *
              1000,
        )
      : null;

  const publicId =
    generateDeveloperPublicId();

  const secret =
    generateDeveloperSecret();

  const secretHash =
    hashDeveloperSecret(
      secret,
    );

  const keyHint =
    developerKeyHint(
      secret,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        INSERT INTO api_credentials (
          company_id,
          public_id,
          name,
          secret_hash,
          key_hint,
          scopes,
          allowed_app_keys,
          rate_limit_per_minute,
          status,
          expires_at,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7::jsonb,
          $8,
          'active',
          $9,
          $10,
          $10
        )
        RETURNING
          id,
          name,
          public_id,
          key_hint,
          scopes,
          allowed_app_keys,
          rate_limit_per_minute,
          status,
          expires_at,
          last_used_at,
          rotated_at,
          revoked_at,
          created_at,
          updated_at
      `,
      [
        context.companyId,
        publicId,
        name,
        secretHash,
        keyHint,
        JSON.stringify(
          scopes,
        ),
        JSON.stringify(
          allowedAppKeys,
        ),
        rateLimitPerMinute,
        expiresAt,
        context.userId,
      ],
    );

  const credential =
    rowToCredential(
      context.tenantId,
      result.rows[0],
    );

  await auditDeveloper(
    context,
    {
      action:
        'api.credential.created',
      resourceId:
        credential.id,
      summary:
        `Created API credential "${name}".`,
      metadata: {
        scopes,
        allowedAppKeys,
        rateLimitPerMinute,
        expiresInDays,
      },
    },
  );

  return {
    credential,
    apiKey:
      formatDeveloperApiKey(
        context.tenantId,
        publicId,
        secret,
      ),
  };
}

export async function manageWorkspaceApiCredential(
  credentialId:
    unknown,
  input: {
    operation?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceDeveloperContext(
      'manage',
    );

  const id =
    requireUuid(
      credentialId,
    );

  const operation =
    typeof input.operation ===
      'string'
      ? input.operation
          .trim()
          .toLowerCase()
      : '';

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const existing =
    await pool.query(
      `
        SELECT
          id,
          name,
          public_id,
          status,
          expires_at
        FROM api_credentials
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [
        id,
        context.companyId,
      ],
    );

  if (
    existing.rows.length !==
      1
  ) {
    throw new WorkspaceDeveloperError(
      'API_CREDENTIAL_NOT_FOUND',
      'API credential could not be found in the current company.',
    );
  }

  const row =
    existing.rows[0];

  if (
    operation ===
      'rotate'
  ) {
    if (
      String(
        row.status,
      ) !==
        'active' ||
      (
        row.expires_at &&
        new Date(
          row.expires_at,
        ).getTime() <=
          Date.now()
      )
    ) {
      throw new WorkspaceDeveloperError(
        'API_CREDENTIAL_INACTIVE',
        'Only an active API credential can be rotated.',
      );
    }

    const secret =
      generateDeveloperSecret();

    const secretHash =
      hashDeveloperSecret(
        secret,
      );

    const keyHint =
      developerKeyHint(
        secret,
      );

    const updated =
      await pool.query(
        `
          UPDATE api_credentials
          SET
            secret_hash = $3,
            key_hint = $4,
            rotated_at =
              NOW(),
            updated_by = $5,
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
          RETURNING
            id,
            name,
            public_id,
            key_hint,
            scopes,
            allowed_app_keys,
            rate_limit_per_minute,
            status,
            expires_at,
            last_used_at,
            rotated_at,
            revoked_at,
            created_at,
            updated_at
        `,
        [
          id,
          context.companyId,
          secretHash,
          keyHint,
          context.userId,
        ],
      );

    const credential =
      rowToCredential(
        context.tenantId,
        updated.rows[0],
      );

    await auditDeveloper(
      context,
      {
        action:
          'api.credential.rotated',
        resourceId:
          id,
        summary:
          `Rotated API credential "${String(
            row.name,
          )}".`,
      },
    );

    return {
      credential,
      apiKey:
        formatDeveloperApiKey(
          context.tenantId,
          String(
            row.public_id,
          ),
          secret,
        ),
    };
  }

  if (
    operation ===
      'revoke'
  ) {
    const tombstone =
      hashDeveloperSecret(
        generateDeveloperSecret(),
      );

    const updated =
      await pool.query(
        `
          UPDATE api_credentials
          SET
            status =
              'revoked',
            secret_hash = $3,
            revoked_at =
              COALESCE(
                revoked_at,
                NOW()
              ),
            updated_by = $4,
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
          RETURNING
            id,
            name,
            public_id,
            key_hint,
            scopes,
            allowed_app_keys,
            rate_limit_per_minute,
            status,
            expires_at,
            last_used_at,
            rotated_at,
            revoked_at,
            created_at,
            updated_at
        `,
        [
          id,
          context.companyId,
          tombstone,
          context.userId,
        ],
      );

    const credential =
      rowToCredential(
        context.tenantId,
        updated.rows[0],
      );

    await auditDeveloper(
      context,
      {
        action:
          'api.credential.revoked',
        resourceId:
          id,
        summary:
          `Revoked API credential "${String(
            row.name,
          )}".`,
      },
    );

    return {
      credential,
    };
  }

  throw new WorkspaceDeveloperError(
    'INVALID_API_CREDENTIAL',
    'Choose a supported API credential operation.',
  );
}
