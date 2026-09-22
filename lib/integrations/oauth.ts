import 'server-only';

import crypto from 'node:crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  currentIntegrationKeyVersion,
  hashIntegrationToken,
  isIntegrationEncryptionConfigured,
  openIntegrationSecret,
  sealIntegrationSecret,
  generateIntegrationToken,
} from '@/lib/integrations/crypto';

import {
  requireConfiguredOAuthProvider,
} from '@/lib/integrations/registry';

import type {
  SamiIntegrationCredentialPayload,
} from '@/lib/integrations/types';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

import {
  resolveWorkspaceIntegrationContext,
  WorkspaceIntegrationError,
} from '@/lib/services/workspace-integrations';

const OAUTH_STATE_TTL_MS =
  10 *
  60 *
  1000;

const TOKEN_TIMEOUT_MS =
  15_000;

function safeReturnPath(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string'
  ) {
    return '/integrations';
  }

  const path =
    value
      .trim()
      .slice(
        0,
        500,
      );

  if (
    !path.startsWith(
      '/',
    ) ||
    path.startsWith(
      '//',
    )
  ) {
    return '/integrations';
  }

  return path;
}

function publicOrigin(
  requestOrigin:
    string,
) {
  const configured =
    process.env
      .SAMI_PUBLIC_APP_URL
      ?.trim() ||
    process.env
      .NEXT_PUBLIC_APP_URL
      ?.trim();

  const value =
    configured ||
    requestOrigin;

  let url:
    URL;

  try {
    url =
      new URL(
        value,
      );
  } catch {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'SaMi public application URL is not configured correctly.',
    );
  }

  if (
    url.protocol !==
      'https:' &&
    !(
      url.protocol ===
        'http:' &&
      (
        url.hostname ===
          'localhost' ||
        url.hostname ===
          '127.0.0.1'
      )
    )
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'OAuth requires HTTPS outside local development.',
    );
  }

  return url.origin;
}

function oauthRedirectUri(
  origin:
    string,
  providerKey:
    string,
) {
  return (
    origin +
    '/api/workspace/integrations/oauth/' +
    encodeURIComponent(
      providerKey,
    ) +
    '/callback'
  );
}

function createPkce() {
  const verifier =
    generateIntegrationToken(
      48,
    );

  const challenge =
    crypto
      .createHash(
        'sha256',
      )
      .update(
        verifier,
        'utf8',
      )
      .digest(
        'base64url',
      );

  return {
    verifier,
    challenge,
  };
}

function decodeIdTokenClaims(
  token:
    unknown,
) {
  if (
    typeof token !==
      'string'
  ) {
    return {};
  }

  const parts =
    token.split(
      '.',
    );

  if (
    parts.length <
      2
  ) {
    return {};
  }

  try {
    const value =
      JSON.parse(
        Buffer.from(
          parts[1],
          'base64url',
        ).toString(
          'utf8',
        ),
      );

    return (
      value &&
      typeof value ===
        'object' &&
      !Array.isArray(
        value,
      )
        ? value
        : {}
    ) as
      Record<
        string,
        unknown
      >;
  } catch {
    return {};
  }
}

function normalizeScopes(
  value:
    unknown,
) {
  if (
    typeof value ===
      'string'
  ) {
    return Array.from(
      new Set(
        value
          .split(
            /[\s,]+/,
          )
          .map(
            item =>
              item
                .trim(),
          )
          .filter(
            Boolean,
          ),
      ),
    );
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return Array.from(
      new Set(
        value
          .filter(
            item =>
              typeof item ===
                'string',
          )
          .map(
            item =>
              item
                .trim(),
          )
          .filter(
            Boolean,
          ),
      ),
    );
  }

  return [];
}

function cleanProviderMetadata(
  providerKey:
    string,
  data:
    Record<
      string,
      unknown
    >,
) {
  if (
    providerKey ===
      'slack'
  ) {
    const team =
      data.team &&
      typeof data.team ===
        'object' &&
      !Array.isArray(
        data.team,
      )
        ? data.team as
            Record<
              string,
              unknown
            >
        : {};

    const authedUser =
      data.authed_user &&
      typeof data.authed_user ===
        'object' &&
      !Array.isArray(
        data.authed_user,
      )
        ? data.authed_user as
            Record<
              string,
              unknown
            >
        : {};

    return {
      teamId:
        typeof team.id ===
          'string'
          ? team.id
          : null,
      teamName:
        typeof team.name ===
          'string'
          ? team.name
          : null,
      authedUserId:
        typeof authedUser.id ===
          'string'
          ? authedUser.id
          : null,
    };
  }

  return {};
}

function externalIdentity(
  providerKey:
    string,
  data:
    Record<
      string,
      unknown
    >,
) {
  if (
    providerKey ===
      'slack'
  ) {
    const metadata =
      cleanProviderMetadata(
        providerKey,
        data,
      );

    return {
      id:
        typeof metadata.teamId ===
          'string'
          ? metadata.teamId
          : null,
      name:
        typeof metadata.teamName ===
          'string'
          ? metadata.teamName
          : null,
      email:
        null,
    };
  }

  const claims =
    decodeIdTokenClaims(
      data.id_token,
    );

  const id =
    typeof claims.sub ===
      'string'
      ? claims.sub
      : typeof claims.oid ===
          'string'
        ? claims.oid
        : null;

  const name =
    typeof claims.name ===
      'string'
      ? claims.name
      : null;

  const email =
    typeof claims.email ===
      'string'
      ? claims.email
      : typeof claims.preferred_username ===
          'string'
        ? claims.preferred_username
        : null;

  return {
    id,
    name,
    email,
  };
}

async function tokenExchange(
  input: {
    tokenUrl:
      string;
    clientId:
      string;
    clientSecret:
      string;
    code:
      string;
    redirectUri:
      string;
    verifier?:
      string | null;
  },
) {
  const body =
    new URLSearchParams();

  body.set(
    'grant_type',
    'authorization_code',
  );

  body.set(
    'client_id',
    input.clientId,
  );

  body.set(
    'client_secret',
    input.clientSecret,
  );

  body.set(
    'code',
    input.code,
  );

  body.set(
    'redirect_uri',
    input.redirectUri,
  );

  if (
    input.verifier
  ) {
    body.set(
      'code_verifier',
      input.verifier,
    );
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      TOKEN_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        input.tokenUrl,
        {
          method:
            'POST',
          headers: {
            Accept:
              'application/json',
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
          body,
          cache:
            'no-store',
          signal:
            controller.signal,
        },
      );

    const data:
      unknown =
      await response.json()
        .catch(
          () => ({}),
        );

    const object =
      data &&
      typeof data ===
        'object' &&
      !Array.isArray(
        data,
      )
        ? data as
            Record<
              string,
              unknown
            >
        : {};

    if (
      !response.ok ||
      object.ok ===
        false ||
      typeof object.access_token !==
        'string'
    ) {
      const providerError =
        typeof object.error_description ===
          'string'
          ? object.error_description
          : typeof object.error ===
              'string'
            ? object.error
            : 'OAuth token exchange failed.';

      throw new WorkspaceIntegrationError(
        'INVALID_INTEGRATION',
        providerError
          .replace(
            /[\u0000-\u001f\u007f]/g,
            ' ',
          )
          .slice(
            0,
            500,
          ),
      );
    }

    return object;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

export async function beginWorkspaceIntegrationOAuth(
  input: {
    providerKey:
      string;
    requestOrigin:
      string;
    returnPath?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  if (
    !isIntegrationEncryptionConfigured()
  ) {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_PROVIDER_UNAVAILABLE',
      'SaMi integration credential encryption is not configured on this deployment.',
    );
  }

  let configured;

  try {
    configured =
      requireConfiguredOAuthProvider(
        input.providerKey,
      );
  } catch {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_PROVIDER_UNAVAILABLE',
      'This integration provider is not configured on this SaMi deployment.',
    );
  }

  const {
    provider,
    oauth,
    clientId,
  } =
    configured;

  const origin =
    publicOrigin(
      input.requestOrigin,
    );

  const redirectUri =
    oauthRedirectUri(
      origin,
      provider.key,
    );

  const state =
    generateIntegrationToken(
      32,
    );

  const stateHash =
    hashIntegrationToken(
      state,
    );

  const pkce =
    oauth.usePkce
      ? createPkce()
      : null;

  const sealedVerifier =
    pkce
      ? sealIntegrationSecret({
          verifier:
            pkce.verifier,
        })
      : null;

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  await pool.query(
    `
      INSERT INTO integration_oauth_states (
        company_id,
        provider_key,
        user_id,
        state_hash,
        redirect_uri,
        code_verifier_sealed,
        key_version,
        requested_scopes,
        return_path,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9,
        $10
      )
    `,
    [
      context.runtime
        .companyId,
      provider.key,
      context.runtime
        .userId,
      stateHash,
      redirectUri,
      sealedVerifier
        ?.sealed ||
        null,
      sealedVerifier
        ?.version ||
        null,
      JSON.stringify(
        oauth.scopes,
      ),
      safeReturnPath(
        input.returnPath,
      ),
      new Date(
        Date.now() +
        OAUTH_STATE_TTL_MS,
      ),
    ],
  );

  const url =
    new URL(
      oauth.authorizationUrl,
    );

  url.searchParams.set(
    'response_type',
    'code',
  );

  url.searchParams.set(
    'client_id',
    clientId,
  );

  url.searchParams.set(
    'redirect_uri',
    redirectUri,
  );

  url.searchParams.set(
    'state',
    state,
  );

  if (
    oauth.scopes.length >
      0
  ) {
    url.searchParams.set(
      'scope',
      oauth.scopes.join(
        ' ',
      ),
    );
  }

  if (
    pkce
  ) {
    url.searchParams.set(
      'code_challenge',
      pkce.challenge,
    );

    url.searchParams.set(
      'code_challenge_method',
      'S256',
    );
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(
      oauth.extraAuthorizationParams ||
      {},
    )
  ) {
    url.searchParams.set(
      key,
      value,
    );
  }

  return {
    providerKey:
      provider.key,
    authorizationUrl:
      url.toString(),
  };
}

export async function completeWorkspaceIntegrationOAuth(
  input: {
    providerKey:
      string;
    requestOrigin:
      string;
    state:
      unknown;
    code:
      unknown;
    providerError?:
      unknown;
  },
) {
  const context =
    await resolveWorkspaceIntegrationContext(
      'manage',
    );

  const state =
    typeof input.state ===
      'string'
      ? input.state
          .trim()
      : '';

  const code =
    typeof input.code ===
      'string'
      ? input.code
          .trim()
      : '';

  if (
    !state
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'OAuth state is missing.',
    );
  }

  if (
    typeof input.providerError ===
      'string' &&
    input.providerError
      .trim()
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'The external provider denied or cancelled the connection.',
    );
  }

  if (
    !code
  ) {
    throw new WorkspaceIntegrationError(
      'INVALID_INTEGRATION',
      'OAuth authorization code is missing.',
    );
  }

  if (
    !isIntegrationEncryptionConfigured()
  ) {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_PROVIDER_UNAVAILABLE',
      'SaMi integration credential encryption is not configured on this deployment.',
    );
  }

  let configured;

  try {
    configured =
      requireConfiguredOAuthProvider(
        input.providerKey,
      );
  } catch {
    throw new WorkspaceIntegrationError(
      'INTEGRATION_PROVIDER_UNAVAILABLE',
      'This integration provider is not configured on this SaMi deployment.',
    );
  }

  const {
    provider,
    oauth,
    clientId,
    clientSecret,
  } =
    configured;

  const expectedRedirect =
    oauthRedirectUri(
      publicOrigin(
        input.requestOrigin,
      ),
      provider.key,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.runtime
        .tenantId,
    );

  const client =
    await pool.connect();

  let verifier:
    string | null =
    null;

  let returnPath =
    '/integrations';

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            id,
            redirect_uri,
            code_verifier_sealed,
            return_path,
            expires_at,
            consumed_at
          FROM integration_oauth_states
          WHERE company_id = $1
            AND user_id = $2
            AND provider_key = $3
            AND state_hash = $4
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.runtime
            .companyId,
          context.runtime
            .userId,
          provider.key,
          hashIntegrationToken(
            state,
          ),
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new WorkspaceIntegrationError(
        'INVALID_INTEGRATION',
        'OAuth state could not be verified.',
      );
    }

    const row =
      result.rows[0];

    if (
      row.consumed_at
    ) {
      throw new WorkspaceIntegrationError(
        'INVALID_INTEGRATION',
        'This OAuth request has already been used.',
      );
    }

    if (
      new Date(
        row.expires_at,
      ).getTime() <=
        Date.now()
    ) {
      throw new WorkspaceIntegrationError(
        'INVALID_INTEGRATION',
        'This OAuth request has expired. Start the connection again.',
      );
    }

    if (
      String(
        row.redirect_uri,
      ) !==
      expectedRedirect
    ) {
      throw new WorkspaceIntegrationError(
        'INVALID_INTEGRATION',
        'OAuth redirect context changed.',
      );
    }

    if (
      row.code_verifier_sealed
    ) {
      const decoded =
        openIntegrationSecret<{
          verifier?:
            string;
        }>(
          String(
            row.code_verifier_sealed,
          ),
        );

      verifier =
        typeof decoded.verifier ===
          'string'
          ? decoded.verifier
          : null;
    }

    returnPath =
      safeReturnPath(
        row.return_path,
      );

    await client.query(
      `
        UPDATE integration_oauth_states
        SET consumed_at =
              NOW()
        WHERE id = $1
      `,
      [
        row.id,
      ],
    );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }

  const tokenData =
    await tokenExchange({
      tokenUrl:
        oauth.tokenUrl,
      clientId,
      clientSecret,
      code,
      redirectUri:
        expectedRedirect,
      verifier,
    });

  const expiresIn =
    Number(
      tokenData.expires_in,
    );

  const expiresAt =
    Number.isFinite(
      expiresIn,
    ) &&
    expiresIn >
      0
      ? new Date(
          Date.now() +
          expiresIn *
          1000,
        )
          .toISOString()
      : null;

  const scopes =
    normalizeScopes(
      tokenData.scope,
    );

  const identity =
    externalIdentity(
      provider.key,
      tokenData,
    );

  const credential:
    SamiIntegrationCredentialPayload = {
    accessToken:
      String(
        tokenData.access_token,
      ),
    refreshToken:
      typeof tokenData.refresh_token ===
        'string'
        ? tokenData.refresh_token
        : undefined,
    tokenType:
      typeof tokenData.token_type ===
        'string'
        ? tokenData.token_type
        : undefined,
    scope:
      scopes.join(
        ' ',
      ),
    expiresAt,
    providerData:
      cleanProviderMetadata(
        provider.key,
        tokenData,
      ),
  };

  const sealed =
    sealIntegrationSecret(
      credential,
    );

  const connectionName =
    (
      identity.name ||
      identity.email ||
      provider.name
    )
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
        180,
      ) +
    ' · ' +
    provider.name;

  const save =
    await pool.connect();

  let connectionId =
    '';

  try {
    await save.query(
      'BEGIN',
    );

    const existing =
      identity.id
        ? await save.query(
            `
              SELECT id
              FROM integration_connections
              WHERE company_id = $1
                AND provider_key = $2
                AND external_account_id = $3
                AND archived_at
                    IS NULL
              ORDER BY
                updated_at DESC
              LIMIT 1
              FOR UPDATE
            `,
            [
              context.runtime
                .companyId,
              provider.key,
              identity.id,
            ],
          )
        : {
            rows: [],
          };

    if (
      existing.rows.length >
        0
    ) {
      connectionId =
        String(
          existing.rows[0]
            .id,
        );

      await save.query(
        `
          UPDATE integration_connections
          SET
            name = $3,
            status =
              'connected',
            owner_user_id =
              $4,
            external_account_name =
              $5,
            external_account_email =
              $6,
            scopes =
              $7::jsonb,
            capabilities =
              $8::jsonb,
            health_status =
              'healthy',
            connected_at =
              NOW(),
            disconnected_at =
              NULL,
            updated_by =
              $4,
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          connectionId,
          context.runtime
            .companyId,
          connectionName,
          context.runtime
            .userId,
          identity.name,
          identity.email,
          JSON.stringify(
            scopes,
          ),
          JSON.stringify(
            provider.capabilities,
          ),
        ],
      );
    } else {
      const created =
        await save.query(
          `
            INSERT INTO integration_connections (
              company_id,
              provider_key,
              connection_type,
              name,
              status,
              owner_user_id,
              external_account_id,
              external_account_name,
              external_account_email,
              scopes,
              capabilities,
              settings,
              health_status,
              connected_at,
              created_by,
              updated_by
            )
            VALUES (
              $1,
              $2,
              'oauth2',
              $3,
              'connected',
              $4,
              $5,
              $6,
              $7,
              $8::jsonb,
              $9::jsonb,
              '{}'::jsonb,
              'healthy',
              NOW(),
              $4,
              $4
            )
            RETURNING id
          `,
          [
            context.runtime
              .companyId,
            provider.key,
            connectionName,
            context.runtime
              .userId,
            identity.id,
            identity.name,
            identity.email,
            JSON.stringify(
              scopes,
            ),
            JSON.stringify(
              provider.capabilities,
            ),
          ],
        );

      connectionId =
        String(
          created.rows[0]
            .id,
        );
    }

    await save.query(
      `
        INSERT INTO integration_credentials (
          connection_id,
          credential_type,
          sealed_payload,
          key_version,
          expires_at,
          rotated_at
        )
        VALUES (
          $1,
          'oauth2',
          $2,
          $3,
          $4,
          NOW()
        )
        ON CONFLICT (
          connection_id
        )
        DO UPDATE SET
          credential_type =
            EXCLUDED.credential_type,
          sealed_payload =
            EXCLUDED.sealed_payload,
          key_version =
            EXCLUDED.key_version,
          expires_at =
            EXCLUDED.expires_at,
          rotated_at =
            NOW(),
          updated_at =
            NOW()
      `,
      [
        connectionId,
        sealed.sealed,
        sealed.version,
        expiresAt,
      ],
    );

    await save.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    await save.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    save.release();
  }

  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        context.runtime
          .tenantId,
      companyId:
        context.runtime
          .companyId,
      userId:
        context.runtime
          .userId,
      actorType:
        'human',
      action:
        'integration.oauth.connected',
      eventType:
        'integration.oauth.connected',
      category:
        'activity',
      severity:
        'info',
      result:
        'success',
      resourceType:
        'integration_connection',
      resourceId:
        connectionId,
      entityType:
        'integration_connection',
      entityId:
        connectionId,
      module:
        'integrations',
      summary:
        `Connected ${provider.name}.`,
      metadata: {
        providerKey:
          provider.key,
        scopes,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Integrations] OAuth audit write failed:',
      error,
    );
  }

  return {
    providerKey:
      provider.key,
    connectionId,
    returnPath,
  };
}
