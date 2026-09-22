import 'server-only';

import crypto from 'node:crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  openIntegrationSecret,
} from '@/lib/integrations/crypto';

import {
  getIntegrationProvider,
} from '@/lib/integrations/registry';

import type {
  SamiIntegrationCredentialPayload,
  SamiIntegrationRuntimeContext,
} from '@/lib/integrations/types';

const REQUEST_TIMEOUT_MS =
  12_000;

type HealthResult = {
  healthy:
    boolean;
  status:
    'healthy' |
    'degraded' |
    'unreachable' |
    'expired' |
    'revoked';
  externalAccountId?:
    string | null;
  externalAccountName?:
    string | null;
  externalAccountEmail?:
    string | null;
};

export type SamiIntegrationSyncHandler =
  (
    context:
      SamiIntegrationRuntimeContext,
    input: {
      connectionId:
        string;
      cursor:
        Record<
          string,
          unknown
        >;
    },
  ) => Promise<{
    cursor?:
      Record<
        string,
        unknown
      >;
    result?:
      Record<
        string,
        unknown
      >;
  }>;

const SYNC_HANDLERS =
  new Map<
    string,
    SamiIntegrationSyncHandler
  >();

function safeObject(
  value:
    unknown,
) {
  return value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
    ? value as
        Record<
          string,
          unknown
        >
    : {};
}

async function fetchJson(
  url:
    string,
  accessToken:
    string,
  method =
    'GET',
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        url,
        {
          method,
          headers: {
            Accept:
              'application/json',
            Authorization:
              'Bearer ' +
              accessToken,
          },
          cache:
            'no-store',
          signal:
            controller.signal,
        },
      );

    const payload =
      safeObject(
        await response.json()
          .catch(
            () => ({}),
          ),
      );

    return {
      response,
      payload,
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function credentialExpired(
  credential:
    SamiIntegrationCredentialPayload,
) {
  if (
    !credential.expiresAt
  ) {
    return false;
  }

  const time =
    new Date(
      credential.expiresAt,
    ).getTime();

  return (
    Number.isFinite(
      time,
    ) &&
    time <=
      Date.now()
  );
}

async function loadCredential(
  input: {
    tenantId:
      string;
    companyId:
      string;
    connectionId:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          c.id,
          c.provider_key,
          c.status,
          c.connection_type,
          cr.sealed_payload
        FROM integration_connections c
        LEFT JOIN integration_credentials cr
          ON cr.connection_id =
             c.id
        WHERE c.id = $1
          AND c.company_id = $2
          AND c.archived_at
              IS NULL
        LIMIT 1
      `,
      [
        input.connectionId,
        input.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new Error(
      'Integration connection could not be found.',
    );
  }

  const row =
    result.rows[0];

  if (
    row.status ===
      'revoked'
  ) {
    return {
      providerKey:
        String(
          row.provider_key,
        ),
      connectionType:
        String(
          row.connection_type,
        ),
      credential:
        null,
      revoked:
        true,
    };
  }

  if (
    !row.sealed_payload
  ) {
    return {
      providerKey:
        String(
          row.provider_key,
        ),
      connectionType:
        String(
          row.connection_type,
        ),
      credential:
        null,
      revoked:
        false,
    };
  }

  return {
    providerKey:
      String(
        row.provider_key,
      ),
    connectionType:
      String(
        row.connection_type,
      ),
    credential:
      openIntegrationSecret<
        SamiIntegrationCredentialPayload
      >(
        String(
          row.sealed_payload,
        ),
      ),
    revoked:
      false,
  };
}

async function testOAuthProvider(
  providerKey:
    string,
  accessToken:
    string,
): Promise<HealthResult> {
  if (
    providerKey ===
      'google_workspace'
  ) {
    const {
      response,
      payload,
    } =
      await fetchJson(
        'https://openidconnect.googleapis.com/v1/userinfo',
        accessToken,
      );

    if (
      response.status ===
        401 ||
      response.status ===
        403
    ) {
      return {
        healthy:
          false,
        status:
          'expired',
      };
    }

    if (
      !response.ok
    ) {
      return {
        healthy:
          false,
        status:
          'unreachable',
      };
    }

    return {
      healthy:
        true,
      status:
        'healthy',
      externalAccountId:
        typeof payload.sub ===
          'string'
          ? payload.sub
          : null,
      externalAccountName:
        typeof payload.name ===
          'string'
          ? payload.name
          : null,
      externalAccountEmail:
        typeof payload.email ===
          'string'
          ? payload.email
          : null,
    };
  }

  if (
    providerKey ===
      'microsoft_365'
  ) {
    const {
      response,
      payload,
    } =
      await fetchJson(
        'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
        accessToken,
      );

    if (
      response.status ===
        401 ||
      response.status ===
        403
    ) {
      return {
        healthy:
          false,
        status:
          'expired',
      };
    }

    if (
      !response.ok
    ) {
      return {
        healthy:
          false,
        status:
          'unreachable',
      };
    }

    return {
      healthy:
        true,
      status:
        'healthy',
      externalAccountId:
        typeof payload.id ===
          'string'
          ? payload.id
          : null,
      externalAccountName:
        typeof payload.displayName ===
          'string'
          ? payload.displayName
          : null,
      externalAccountEmail:
        typeof payload.mail ===
          'string'
          ? payload.mail
          : typeof payload.userPrincipalName ===
              'string'
            ? payload.userPrincipalName
            : null,
    };
  }

  if (
    providerKey ===
      'slack'
  ) {
    const {
      response,
      payload,
    } =
      await fetchJson(
        'https://slack.com/api/auth.test',
        accessToken,
        'POST',
      );

    if (
      response.status ===
        401 ||
      response.status ===
        403 ||
      payload.ok ===
        false
    ) {
      return {
        healthy:
          false,
        status:
          'expired',
      };
    }

    if (
      !response.ok
    ) {
      return {
        healthy:
          false,
        status:
          'unreachable',
      };
    }

    return {
      healthy:
        true,
      status:
        'healthy',
      externalAccountId:
        typeof payload.team_id ===
          'string'
          ? payload.team_id
          : null,
      externalAccountName:
        typeof payload.team ===
          'string'
          ? payload.team
          : null,
      externalAccountEmail:
        null,
    };
  }

  return {
    healthy:
      false,
    status:
      'degraded',
  };
}

export async function checkIntegrationConnectionHealth(
  runtime:
    SamiIntegrationRuntimeContext,
  connectionId:
    string,
) {
  const loaded =
    await loadCredential({
      tenantId:
        runtime.tenantId,
      companyId:
        runtime.companyId,
      connectionId,
    });

  const provider =
    getIntegrationProvider(
      loaded.providerKey,
    );

  if (
    !provider
  ) {
    throw new Error(
      'Integration provider is not registered.',
    );
  }

  let health:
    HealthResult;

  if (
    loaded.revoked
  ) {
    health = {
      healthy:
        false,
      status:
        'revoked',
    };
  } else if (
    provider.connectionType ===
      'webhook'
  ) {
    health = {
      healthy:
        true,
      status:
        'healthy',
    };
  } else if (
    provider.connectionType ===
      'external_app'
  ) {
    health = {
      healthy:
        true,
      status:
        'healthy',
    };
  } else if (
    !loaded.credential ||
    !loaded.credential
      .accessToken
  ) {
    health = {
      healthy:
        false,
      status:
        'degraded',
    };
  } else if (
    credentialExpired(
      loaded.credential,
    )
  ) {
    health = {
      healthy:
        false,
      status:
        'expired',
    };
  } else {
    health =
      await testOAuthProvider(
        loaded.providerKey,
        loaded.credential
          .accessToken,
      );
  }

  const pool =
    await getTenantPoolByTenantId(
      runtime.tenantId,
    );

  await pool.query(
    `
      UPDATE integration_connections
      SET
        health_status = $3,
        status =
          CASE
            WHEN $3 = 'healthy'
            THEN 'connected'
            WHEN $3 = 'revoked'
            THEN 'revoked'
            WHEN $3 = 'expired'
            THEN 'expired'
            ELSE 'degraded'
          END,
        last_health_check_at =
          NOW(),
        external_account_id =
          COALESCE(
            $4,
            external_account_id
          ),
        external_account_name =
          COALESCE(
            $5,
            external_account_name
          ),
        external_account_email =
          COALESCE(
            $6,
            external_account_email
          ),
        updated_by = $7,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND archived_at
            IS NULL
    `,
    [
      connectionId,
      runtime.companyId,
      health.status,
      health.externalAccountId ||
        null,
      health.externalAccountName ||
        null,
      health.externalAccountEmail ||
        null,
      runtime.userId,
    ],
  );

  return health;
}

export function getIntegrationSyncHandler(
  providerKey:
    string,
) {
  return (
    SYNC_HANDLERS.get(
      providerKey
        .trim()
        .toLowerCase(),
    ) ||
    null
  );
}

export async function runIntegrationSync(
  runtime:
    SamiIntegrationRuntimeContext,
  connectionId:
    string,
) {
  const loaded =
    await loadCredential({
      tenantId:
        runtime.tenantId,
      companyId:
        runtime.companyId,
      connectionId,
    });

  const handler =
    getIntegrationSyncHandler(
      loaded.providerKey,
    );

  if (
    !handler
  ) {
    throw new Error(
      'This integration does not currently register a SaMi sync handler.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      runtime.tenantId,
    );

  const jobId =
    crypto.randomUUID();

  const correlationId =
    crypto.randomUUID();

  await pool.query(
    `
      INSERT INTO integration_sync_jobs (
        id,
        connection_id,
        company_id,
        run_as_user_id,
        direction,
        job_type,
        status,
        attempt,
        max_attempts,
        correlation_id,
        started_at,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'bidirectional',
        'manual',
        'running',
        1,
        3,
        $5,
        NOW(),
        NOW()
      )
    `,
    [
      jobId,
      connectionId,
      runtime.companyId,
      runtime.userId,
      correlationId,
    ],
  );

  try {
    const output =
      await handler(
        runtime,
        {
          connectionId,
          cursor: {},
        },
      );

    await pool.query(
      `
        UPDATE integration_sync_jobs
        SET
          status =
            'succeeded',
          cursor =
            $2::jsonb,
          result =
            $3::jsonb,
          completed_at =
            NOW()
        WHERE id = $1
      `,
      [
        jobId,
        JSON.stringify(
          output.cursor ||
          {},
        ),
        JSON.stringify(
          output.result ||
          {},
        ),
      ],
    );

    await pool.query(
      `
        UPDATE integration_connections
        SET
          last_sync_at =
            NOW(),
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        connectionId,
        runtime.companyId,
        runtime.userId,
      ],
    );

    return {
      jobId,
      correlationId,
      status:
        'succeeded',
    };
  } catch (
    error
  ) {
    const message =
      error instanceof
        Error
        ? error.message
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
              800,
            )
        : 'Integration sync failed.';

    await pool.query(
      `
        UPDATE integration_sync_jobs
        SET
          status =
            'failed',
          error_code =
            'SYNC_FAILED',
          error_message =
            $2,
          completed_at =
            NOW()
        WHERE id = $1
      `,
      [
        jobId,
        message,
      ],
    );

    throw error;
  }
}
