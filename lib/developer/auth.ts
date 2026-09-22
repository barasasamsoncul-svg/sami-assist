import 'server-only';

import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  developerSecretMatches,
} from '@/lib/developer/credentials';

import {
  getDeveloperScope,
} from '@/lib/developer/scopes';

const TOKEN_RE =
  /^sami_live_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([A-Za-z0-9_-]{16,64})_([A-Za-z0-9_-]{32,128})$/i;

export type DeveloperApiErrorCode =
  | 'API_AUTH_REQUIRED'
  | 'API_KEY_INVALID'
  | 'API_KEY_INACTIVE'
  | 'API_SCOPE_REQUIRED'
  | 'API_RATE_LIMITED'
  | 'API_REQUEST_FAILED';

export class DeveloperApiError
  extends Error {
  constructor(
    public readonly code:
      DeveloperApiErrorCode,
    public readonly status:
      number,
    message:
      string,
    public readonly requestId:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'DeveloperApiError';
  }
}

export type DeveloperApiContext = {
  requestId:
    string;
  tenantId:
    string;
  companyId:
    string;
  companyName:
    string;
  credentialId:
    string;
  credentialName:
    string;
  publicId:
    string;
  scopes:
    string[];
  allowedAppKeys:
    string[];
  rateLimit:
    number;
  rateLimitRemaining:
    number;
};

function bearerToken(
  request:
    NextRequest,
) {
  const value =
    request.headers
      .get(
        'authorization',
      )
      ?.trim() ||
    '';

  const match =
    /^Bearer\s+(.+)$/i.exec(
      value,
    );

  return match?.[1]
    ?.trim() ||
    '';
}

function normalizedStringArray(
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

async function recordRateLimit(
  tenantId:
    string,
  credentialId:
    string,
) {
  let pool:
    Awaited<
      ReturnType<
        typeof getTenantPoolByTenantId
      >
    >;

  try {
    pool =
      await getTenantPoolByTenantId(
        tenantId,
      );
  } catch {
    throw new DeveloperApiError(
      'API_KEY_INVALID',
      401,
      'The API key is invalid.',
      requestId,
    );
  }

  const result =
    await pool.query(
      `
        INSERT INTO api_rate_limit_windows (
          credential_id,
          window_start,
          request_count,
          updated_at
        )
        VALUES (
          $1,
          date_trunc(
            'minute',
            NOW()
          ),
          1,
          NOW()
        )
        ON CONFLICT (
          credential_id,
          window_start
        )
        DO UPDATE
        SET
          request_count =
            api_rate_limit_windows.request_count +
            1,
          updated_at =
            NOW()
        RETURNING
          request_count
      `,
      [
        credentialId,
      ],
    );

  await pool.query(
    `
      DELETE FROM api_rate_limit_windows
      WHERE credential_id = $1
        AND window_start <
            NOW() -
            INTERVAL '1 day'
    `,
    [
      credentialId,
    ],
  );

  return Number(
    result.rows[0]
      ?.request_count ||
    1,
  );
}

export async function authenticateDeveloperRequest(
  request:
    NextRequest,
  requiredScope:
    string,
): Promise<DeveloperApiContext> {
  const requestId =
    crypto.randomUUID();

  const scope =
    getDeveloperScope(
      requiredScope,
    );

  if (
    !scope
  ) {
    throw new DeveloperApiError(
      'API_SCOPE_REQUIRED',
      403,
      'This API scope is not registered.',
      requestId,
    );
  }

  const token =
    bearerToken(
      request,
    );

  if (
    !token
  ) {
    throw new DeveloperApiError(
      'API_AUTH_REQUIRED',
      401,
      'Use an API key as a Bearer token.',
      requestId,
    );
  }

  const parsed =
    TOKEN_RE.exec(
      token,
    );

  if (
    !parsed
  ) {
    throw new DeveloperApiError(
      'API_KEY_INVALID',
      401,
      'The API key is invalid.',
      requestId,
    );
  }

  const [
    ,
    tenantId,
    publicId,
    secret,
  ] =
    parsed;

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          k.id,
          k.company_id,
          k.public_id,
          k.name,
          k.secret_hash,
          k.scopes,
          k.allowed_app_keys,
          k.rate_limit_per_minute,
          k.status,
          k.expires_at,
          c.name
            AS company_name
        FROM api_credentials k
        INNER JOIN companies c
          ON c.id =
             k.company_id
        WHERE k.public_id = $1
          AND c.is_active =
              TRUE
          AND c.archived_at
              IS NULL
        LIMIT 1
      `,
      [
        publicId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new DeveloperApiError(
      'API_KEY_INVALID',
      401,
      'The API key is invalid.',
      requestId,
    );
  }

  const row =
    result.rows[0];

  if (
    !developerSecretMatches(
      secret,
      String(
        row.secret_hash ||
        '',
      ),
    )
  ) {
    throw new DeveloperApiError(
      'API_KEY_INVALID',
      401,
      'The API key is invalid.',
      requestId,
    );
  }

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
    throw new DeveloperApiError(
      'API_KEY_INACTIVE',
      401,
      'The API key is inactive or expired.',
      requestId,
    );
  }

  const scopes =
    normalizedStringArray(
      row.scopes,
    );

  if (
    !scopes.includes(
      requiredScope,
    )
  ) {
    throw new DeveloperApiError(
      'API_SCOPE_REQUIRED',
      403,
      'The API key does not have the required scope.',
      requestId,
    );
  }

  const rateLimit =
    Math.max(
      1,
      Math.min(
        600,
        Number(
          row.rate_limit_per_minute ||
          60,
        ),
      ),
    );

  const used =
    await recordRateLimit(
      tenantId,
      String(
        row.id,
      ),
    );

  if (
    used >
    rateLimit
  ) {
    await pool.query(
      `
        INSERT INTO api_request_logs (
          company_id,
          credential_id,
          request_id,
          route_key,
          method,
          status_code,
          outcome,
          duration_ms,
          rate_limited,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          429,
          'rate_limited',
          0,
          TRUE,
          NOW()
        )
      `,
      [
        row.company_id,
        row.id,
        requestId,
        request.nextUrl
          .pathname,
        request.method,
      ],
    );

    throw new DeveloperApiError(
      'API_RATE_LIMITED',
      429,
      'API rate limit exceeded.',
      requestId,
    );
  }

  await pool.query(
    `
      UPDATE api_credentials
      SET
        last_used_at =
          NOW()
      WHERE id = $1
    `,
    [
      row.id,
    ],
  );

  return {
    requestId,
    tenantId,
    companyId:
      String(
        row.company_id,
      ),
    companyName:
      String(
        row.company_name ||
        'Company',
      ),
    credentialId:
      String(
        row.id,
      ),
    credentialName:
      String(
        row.name,
      ),
    publicId:
      String(
        row.public_id,
      ),
    scopes,
    allowedAppKeys:
      normalizedStringArray(
        row.allowed_app_keys,
      ),
    rateLimit,
    rateLimitRemaining:
      Math.max(
        0,
        rateLimit -
          used,
      ),
  };
}

export async function recordDeveloperRequest(
  context:
    DeveloperApiContext,
  input: {
    routeKey:
      string;
    method:
      string;
    statusCode:
      number;
    outcome:
      'success' |
      'failure';
    durationMs:
      number;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  await pool.query(
    `
      INSERT INTO api_request_logs (
        company_id,
        credential_id,
        request_id,
        route_key,
        method,
        status_code,
        outcome,
        duration_ms,
        rate_limited,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        FALSE,
        NOW()
      )
    `,
    [
      context.companyId,
      context.credentialId,
      context.requestId,
      input.routeKey
        .slice(
          0,
          200,
        ),
      input.method
        .slice(
          0,
          10,
        ),
      input.statusCode,
      input.outcome,
      Math.max(
        0,
        Math.round(
          input.durationMs,
        ),
      ),
    ],
  );

  await pool.query(
    `
      DELETE FROM api_request_logs
      WHERE company_id = $1
        AND created_at <
            NOW() -
            INTERVAL '90 days'
    `,
    [
      context.companyId,
    ],
  );
}

export function developerApiJson(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
  context?:
    DeveloperApiContext,
) {
  const headers:
    Record<
      string,
      string
    > = {
      'Cache-Control':
        'no-store, no-cache, must-revalidate',
      Pragma:
        'no-cache',
      'X-Content-Type-Options':
        'nosniff',
      'Referrer-Policy':
        'no-referrer',
    };

  if (
    context
  ) {
    headers[
      'X-Request-Id'
    ] =
      context.requestId;
    headers[
      'X-RateLimit-Limit'
    ] =
      String(
        context.rateLimit,
      );
    headers[
      'X-RateLimit-Remaining'
    ] =
      String(
        context.rateLimitRemaining,
      );
  }

  return NextResponse.json(
    body,
    {
      status,
      headers,
    },
  );
}

export function handleDeveloperApiError(
  error:
    unknown,
) {
  if (
    error instanceof
      DeveloperApiError
  ) {
    const response =
      developerApiJson(
        {
          success:
            false,
          code:
            error.code,
          error:
            error.message,
          requestId:
            error.requestId,
        },
        error.status,
      );

    response.headers.set(
      'X-Request-Id',
      error.requestId,
    );

    if (
      error.status ===
        401
    ) {
      response.headers.set(
        'WWW-Authenticate',
        'Bearer realm="SaMi API"',
      );
    }

    return response;
  }

  console.error(
    '[SaMi Developer API] Request failed:',
    error,
  );

  return developerApiJson(
    {
      success:
        false,
      code:
        'API_REQUEST_FAILED',
      error:
        'SaMi could not complete the API request.',
    },
    500,
  );
}
