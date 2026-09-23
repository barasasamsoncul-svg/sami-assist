import 'server-only';

import {
  getSamiAiProviderStatus,
} from '@/lib/ai/config';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';

import {
  capturePlatformIncident,
} from '@/lib/observability/platform-incidents';


type ServiceStatus =
  | 'active'
  | 'trial'
  | 'renewal_due'
  | 'payment_required'
  | 'quota_warning'
  | 'upgrade_recommended'
  | 'suspended'
  | 'expired'
  | 'cancelled'
  | 'not_configured'
  | 'unknown';


type ServiceRow = {
  id:
    string;
  service_key:
    string;
  provider:
    string;
  service_name:
    string;
  category:
    string;
  source:
    string;
  status:
    ServiceStatus;
  plan_name:
    string | null;
  billing_cycle:
    string | null;
  amount:
    string | number | null;
  currency:
    string | null;
  billing_period_start:
    Date | string | null;
  billing_period_end:
    Date | string | null;
  renewal_at:
    Date | string | null;
  expires_at:
    Date | string | null;
  auto_renew:
    boolean;
  quota_used:
    string | number | null;
  quota_limit:
    string | number | null;
  quota_unit:
    string | null;
  warning_threshold_percent:
    string | number;
  management_url:
    string | null;
  sync_adapter:
    string | null;
  sync_status:
    string;
  last_synced_at:
    Date | string | null;
  last_sync_error:
    string | null;
  metadata:
    Record<string, unknown> | null;
  updated_at:
    Date | string;
};


type SyncPatch = {
  provider?:
    string | null;
  serviceName?:
    string | null;
  planName?:
    string | null;
  status?:
    ServiceStatus;
  billingCycle?:
    string | null;
  amount?:
    number | null;
  currency?:
    string | null;
  billingPeriodStart?:
    Date | string | null;
  billingPeriodEnd?:
    Date | string | null;
  renewalAt?:
    Date | string | null;
  expiresAt?:
    Date | string | null;
  quotaUsed?:
    number | null;
  quotaLimit?:
    number | null;
  quotaUnit?:
    string | null;
  syncStatus:
    'ok' |
    'degraded' |
    'failed' |
    'not_supported';
  syncError?:
    string | null;
  metadata?:
    Record<string, unknown>;
  usageSnapshots?:
    Array<{
      metricKey:
        string;
      metricName:
        string;
      usedValue?:
        number | null;
      limitValue?:
        number | null;
      unit?:
        string | null;
      costAmount?:
        number | null;
      costCurrency?:
        string | null;
      periodStart?:
        Date | string | null;
      periodEnd?:
        Date | string | null;
      source?:
        string | null;
      metadata?:
        Record<string, unknown>;
    }>;
};


const DAY_MS =
  24 *
  60 *
  60 *
  1000;


function toIso(
  value:
    Date |
    string |
    null |
    undefined,
) {
  if (
    !value
  ) {
    return null;
  }

  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value,
        );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


function numberOrNull(
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}


function stringOrNull(
  value:
    unknown,
  max =
    500,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .slice(
          0,
          max,
        ) ||
      null
    : null;
}


function safeMetadata(
  value:
    unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    return {};
  }

  const output:
    Record<string, unknown> =
    {};

  for (
    const [
      key,
      nested,
    ]
    of Object.entries(
      value,
    ).slice(
      0,
      100,
    )
  ) {
    if (
      /(password|secret|token|authorization|cookie|api[_-]?key|credential|database[_-]?url)/i.test(
        key,
      )
    ) {
      output[
        key
      ] =
        '[redacted]';

      continue;
    }

    if (
      nested ===
        null ||
      typeof nested ===
        'boolean' ||
      typeof nested ===
        'number'
    ) {
      output[
        key
      ] =
        nested;

      continue;
    }

    if (
      typeof nested ===
        'string'
    ) {
      output[
        key
      ] =
        nested
          .replace(
            /([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,
            '$1[redacted]:[redacted]@',
          )
          .slice(
            0,
            2_000,
          );

      continue;
    }

    if (
      Array.isArray(
        nested,
      )
    ) {
      output[
        key
      ] =
        nested
          .slice(
            0,
            50,
          )
          .map(
            item =>
              typeof item ===
                'string'
                ? item.slice(
                    0,
                    500,
                  )
                : typeof item ===
                    'number' ||
                  typeof item ===
                    'boolean' ||
                  item ===
                    null
                  ? item
                  : '[object]',
          );

      continue;
    }

    output[
      key
    ] =
      '[object]';
  }

  return output;
}


function statusPriority(
  status:
    ServiceStatus,
) {
  const priorities:
    Record<
      ServiceStatus,
      number
    > = {
      expired:
        100,
      suspended:
        95,
      payment_required:
        90,
      upgrade_recommended:
        80,
      quota_warning:
        70,
      renewal_due:
        60,
      not_configured:
        50,
      cancelled:
        40,
      trial:
        30,
      active:
        20,
      unknown:
        10,
    };

  return priorities[
    status
  ];
}


function strongerStatus(
  current:
    ServiceStatus,
  candidate:
    ServiceStatus,
) {
  return statusPriority(
    candidate,
  ) >
    statusPriority(
      current,
    )
    ? candidate
    : current;
}


function evaluateServiceStatus(
  row:
    ServiceRow,
  patch:
    SyncPatch,
) {
  const derivedStatuses =
    new Set<ServiceStatus>([
      'renewal_due',
      'quota_warning',
      'upgrade_recommended',
      'expired',
    ]);

  let status:
    ServiceStatus =
    patch.status ||
    (
      derivedStatuses.has(
        row.status,
      )
        ? 'active'
        : row.status ||
          'unknown'
    );

  if (
    status ===
      'unknown' &&
    (
      row.plan_name ||
      row.renewal_at ||
      row.expires_at ||
      row.amount !==
        null
    )
  ) {
    status =
      'active';
  }

  const now =
    Date.now();

  const expiresAt =
    patch.expiresAt !==
      undefined
      ? toIso(
          patch.expiresAt,
        )
      : toIso(
          row.expires_at,
        );

  const renewalAt =
    patch.renewalAt !==
      undefined
      ? toIso(
          patch.renewalAt,
        )
      : toIso(
          row.renewal_at,
        );

  const periodEnd =
    patch.billingPeriodEnd !==
      undefined
      ? toIso(
          patch.billingPeriodEnd,
        )
      : toIso(
          row.billing_period_end,
        );

  const quotaUsed =
    patch.quotaUsed !==
      undefined
      ? patch.quotaUsed
      : numberOrNull(
          row.quota_used,
        );

  const quotaLimit =
    patch.quotaLimit !==
      undefined
      ? patch.quotaLimit
      : numberOrNull(
          row.quota_limit,
        );

  const warningThreshold =
    Math.min(
      100,
      Math.max(
        1,
        numberOrNull(
          row.warning_threshold_percent,
        ) ||
        80,
      ),
    );

  if (
    expiresAt
  ) {
    const expiresMs =
      new Date(
        expiresAt,
      ).getTime();

    if (
      Number.isFinite(
        expiresMs,
      ) &&
      expiresMs <=
        now
    ) {
      status =
        strongerStatus(
          status,
          'expired',
        );
    }
  }

  const renewalCandidate =
    renewalAt ||
    (
      !row.auto_renew
        ? periodEnd
        : null
    );

  if (
    renewalCandidate
  ) {
    const renewalMs =
      new Date(
        renewalCandidate,
      ).getTime();

    const days =
      (
        renewalMs -
        now
      ) /
      DAY_MS;

    if (
      Number.isFinite(
        days,
      ) &&
      days >=
        0 &&
      days <=
        14
    ) {
      status =
        strongerStatus(
          status,
          'renewal_due',
        );
    }
  }

  if (
    quotaUsed !==
      null &&
    quotaLimit !==
      null &&
    quotaLimit >
      0
  ) {
    const percent =
      (
        quotaUsed /
        quotaLimit
      ) *
      100;

    if (
      percent >=
        95
    ) {
      status =
        strongerStatus(
          status,
          'upgrade_recommended',
        );
    } else if (
      percent >=
        warningThreshold
    ) {
      status =
        strongerStatus(
          status,
          'quota_warning',
        );
    }
  }

  return status;
}


function parseJsonOrLines(
  text:
    string,
) {
  const trimmed =
    text.trim();

  if (
    !trimmed
  ) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(
        trimmed,
      );

    if (
      Array.isArray(
        parsed,
      )
    ) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed ===
        'object'
    ) {
      const object =
        parsed as
          Record<
            string,
            unknown
          >;

      for (
        const key
        of [
          'charges',
          'commitments',
          'result',
          'data',
        ]
      ) {
        if (
          Array.isArray(
            object[
              key
            ],
          )
        ) {
          return object[
            key
          ] as
            unknown[];
        }
      }

      return [
        object,
      ];
    }
  } catch {
    // NDJSON / JSONL below.
  }

  return trimmed
    .split(
      /\r?\n/,
    )
    .map(
      line =>
        line.trim(),
    )
    .filter(
      Boolean,
    )
    .flatMap(
      line => {
        try {
          return [
            JSON.parse(
              line,
            ),
          ];
        } catch {
          return [];
        }
      },
    );
}


function firstNumber(
  object:
    Record<
      string,
      unknown
    >,
  keys:
    string[],
) {
  for (
    const key
    of keys
  ) {
    const value =
      numberOrNull(
        object[
          key
        ],
      );

    if (
      value !==
        null
    ) {
      return value;
    }
  }

  return null;
}


function firstString(
  object:
    Record<
      string,
      unknown
    >,
  keys:
    string[],
) {
  for (
    const key
    of keys
  ) {
    const value =
      stringOrNull(
        object[
          key
        ],
      );

    if (
      value
    ) {
      return value;
    }
  }

  return null;
}


function firstDate(
  object:
    Record<
      string,
      unknown
    >,
  keys:
    string[],
) {
  for (
    const key
    of keys
  ) {
    const value =
      toIso(
        object[
          key
        ] as
          string |
          Date |
          null |
          undefined,
      );

    if (
      value
    ) {
      return value;
    }
  }

  return null;
}


async function loadServices() {
  const result =
    await queryControl(
      `
        SELECT *
        FROM platform_service_subscriptions
        WHERE deleted_at
              IS NULL
        ORDER BY
          CASE category
            WHEN 'hosting'
            THEN 0
            WHEN 'database'
            THEN 1
            WHEN 'storage'
            THEN 2
            WHEN 'domain'
            THEN 3
            WHEN 'ai'
            THEN 4
            ELSE 5
          END,
          service_name ASC
      `,
    );

  return result.rows as
    ServiceRow[];
}


async function syncVercel(
  row:
    ServiceRow,
): Promise<SyncPatch> {
  const token =
    process.env
      .SAMI_VERCEL_API_TOKEN
      ?.trim() ||
    process.env
      .VERCEL_TOKEN
      ?.trim() ||
    '';

  const teamId =
    process.env
      .SAMI_VERCEL_TEAM_ID
      ?.trim() ||
    process.env
      .VERCEL_ORG_ID
      ?.trim() ||
    '';

  const projectId =
    process.env
      .SAMI_VERCEL_PROJECT_ID
      ?.trim() ||
    process.env
      .VERCEL_PROJECT_ID
      ?.trim() ||
    '';

  if (
    !projectId
  ) {
    return {
      status:
        'not_configured',
      syncStatus:
        'degraded',
      syncError:
        'Vercel project identity is unavailable.',
      metadata: {
        projectIdConfigured:
          false,
      },
    };
  }

  if (
    !token ||
    !teamId
  ) {
    return {
      status:
        row.status ===
          'unknown'
          ? 'active'
          : row.status,
      syncStatus:
        'degraded',
      syncError:
        'Set SAMI_VERCEL_API_TOKEN and SAMI_VERCEL_TEAM_ID for billing sync.',
      metadata: {
        projectId,
        billingApiConfigured:
          false,
      },
    };
  }

  const now =
    new Date();

  const from =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1,
      ),
    );

  const chargesUrl =
    new URL(
      'https://api.vercel.com/v1/billing/charges',
    );

  chargesUrl
    .searchParams
    .set(
      'teamId',
      teamId,
    );

  chargesUrl
    .searchParams
    .set(
      'from',
      from.toISOString(),
    );

  chargesUrl
    .searchParams
    .set(
      'to',
      now.toISOString(),
    );

  const response =
    await fetch(
      chargesUrl,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
          Accept:
            'application/x-ndjson, application/json',
        },
        cache:
          'no-store',
      },
    );

  if (
    !response.ok
  ) {
    return {
      syncStatus:
        response.status ===
          403
          ? 'not_supported'
          : 'failed',
      syncError:
        `Vercel billing API returned HTTP ${response.status}.`,
      metadata: {
        projectId,
        teamIdConfigured:
          true,
        billingApiStatus:
          response.status,
      },
    };
  }

  const charges =
    parseJsonOrLines(
      await response.text(),
    )
      .filter(
        value =>
          value &&
          typeof value ===
            'object' &&
          !Array.isArray(
            value,
          ),
      )
      .map(
        value =>
          value as
            Record<
              string,
              unknown
            >,
      );

  let cost =
    0;

  let currency:
    string |
    null =
    null;

  const serviceCosts:
    Record<
      string,
      number
    > =
    {};

  for (
    const charge
    of charges
  ) {
    const billed =
      firstNumber(
        charge,
        [
          'BilledCost',
          'EffectiveCost',
          'ListCost',
          'ContractedCost',
        ],
      ) ||
      0;

    cost +=
      billed;

    currency =
      currency ||
      firstString(
        charge,
        [
          'BillingCurrency',
          'Currency',
        ],
      );

    const service =
      firstString(
        charge,
        [
          'ServiceName',
          'ServiceCategory',
          'ChargeDescription',
        ],
      ) ||
      'Other';

    serviceCosts[
      service
    ] =
      (
        serviceCosts[
          service
        ] ||
        0
      ) +
      billed;
  }

  let renewalAt:
    string |
    null =
    null;

  let periodEnd:
    string |
    null =
    null;

  try {
    const commitmentsUrl =
      new URL(
        'https://api.vercel.com/v1/billing/contract-commitments',
      );

    commitmentsUrl
      .searchParams
      .set(
        'teamId',
        teamId,
      );

    const commitmentsResponse =
      await fetch(
        commitmentsUrl,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
            Accept:
              'application/x-ndjson, application/json',
          },
          cache:
            'no-store',
        },
      );

    if (
      commitmentsResponse.ok
    ) {
      const commitments =
        parseJsonOrLines(
          await commitmentsResponse.text(),
        )
          .filter(
            value =>
              value &&
              typeof value ===
                'object' &&
              !Array.isArray(
                value,
              ),
          )
          .map(
            value =>
              value as
                Record<
                  string,
                  unknown
                >,
          );

      const dates =
        commitments
          .flatMap(
            commitment => [
              firstDate(
                commitment,
                [
                  'ContractPeriodEnd',
                  'PeriodEnd',
                  'commitment_period_end',
                  'end',
                  'endAt',
                ],
              ),
            ],
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(
                value,
              ),
          )
          .sort();

      periodEnd =
        dates[
          dates.length -
          1
        ] ||
        null;

      renewalAt =
        periodEnd;
    }
  } catch {
    // Charges are still useful when commitment API is unavailable.
  }

  return {
    status:
      'active',
    syncStatus:
      'ok',
    syncError:
      null,
    amount:
      cost,
    currency:
      currency ||
      row.currency ||
      null,
    billingPeriodStart:
      from,
    billingPeriodEnd:
      periodEnd,
    renewalAt,
    metadata: {
      projectId,
      charges:
        charges.length,
      serviceCosts,
      billingApiConfigured:
        true,
    },
    usageSnapshots: [
      {
        metricKey:
          'monthly_cost',
        metricName:
          'Current billing-period cost',
        costAmount:
          cost,
        costCurrency:
          currency ||
          row.currency ||
          null,
        periodStart:
          from,
        periodEnd:
          now,
        source:
          'vercel_billing_api',
        metadata: {
          chargeRows:
            charges.length,
        },
      },
    ],
  };
}


async function syncNeon(
  row:
    ServiceRow,
): Promise<SyncPatch> {
  const apiKey =
    process.env
      .SAMI_NEON_API_KEY
      ?.trim() ||
    process.env
      .NEON_API_KEY
      ?.trim() ||
    '';

  const projectId =
    process.env
      .SAMI_NEON_PROJECT_ID
      ?.trim() ||
    process.env
      .NEON_PROJECT_ID
      ?.trim() ||
    '';

  if (
    !apiKey ||
    !projectId
  ) {
    return {
      status:
        row.status ===
          'unknown'
          ? 'active'
          : row.status,
      syncStatus:
        'degraded',
      syncError:
        'Set SAMI_NEON_API_KEY and SAMI_NEON_PROJECT_ID for Neon project/usage sync.',
      metadata: {
        apiConfigured:
          false,
        projectIdConfigured:
          Boolean(
            projectId,
          ),
      },
    };
  }

  const response =
    await fetch(
      `https://console.neon.tech/api/v2/projects/${encodeURIComponent(
        projectId,
      )}`,
      {
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
          Accept:
            'application/json',
        },
        cache:
          'no-store',
      },
    );

  if (
    !response.ok
  ) {
    return {
      syncStatus:
        'failed',
      syncError:
        `Neon project API returned HTTP ${response.status}.`,
      metadata: {
        projectId,
        statusCode:
          response.status,
      },
    };
  }

  const payload =
    await response.json() as
      Record<
        string,
        unknown
      >;

  const project =
    payload.project &&
    typeof payload.project ===
      'object'
      ? payload.project as
          Record<
            string,
            unknown
          >
      : payload;

  const metrics =
    [
      [
        'synthetic_storage_size',
        'Synthetic storage',
        firstNumber(
          project,
          [
            'synthetic_storage_size',
            'synthetic_storage_size_bytes',
          ],
        ),
        'bytes',
      ],
      [
        'data_transfer',
        'Data transfer',
        firstNumber(
          project,
          [
            'data_transfer_bytes',
            'public_network_transfer_bytes',
          ],
        ),
        'bytes',
      ],
      [
        'written_data',
        'Written data',
        firstNumber(
          project,
          [
            'written_data_bytes',
          ],
        ),
        'bytes',
      ],
      [
        'compute_time',
        'Compute time',
        firstNumber(
          project,
          [
            'compute_time_seconds',
            'compute_unit_seconds',
          ],
        ),
        'seconds',
      ],
    ] as const;

  const available =
    metrics.filter(
      metric =>
        metric[2] !==
        null,
    );

  const primary =
    available[0];

  return {
    status:
      'active',
    syncStatus:
      'ok',
    syncError:
      null,
    quotaUsed:
      primary
        ? primary[2]
        : row.quota_used ===
            null
          ? null
          : numberOrNull(
              row.quota_used,
            ),
    quotaUnit:
      primary
        ? primary[3]
        : row.quota_unit,
    metadata: {
      projectId,
      projectName:
        firstString(
          project,
          [
            'name',
          ],
        ),
      regionId:
        firstString(
          project,
          [
            'region_id',
          ],
        ),
      pgVersion:
        project.pg_version ??
        null,
      apiConfigured:
        true,
    },
    usageSnapshots:
      available.map(
        metric => ({
          metricKey:
            metric[0],
          metricName:
            metric[1],
          usedValue:
            metric[2],
          unit:
            metric[3],
          source:
            'neon_project_api',
          metadata: {
            projectId,
          },
        }),
      ),
  };
}


async function syncCloudflareR2(
  row:
    ServiceRow,
): Promise<SyncPatch> {
  const token =
    process.env
      .SAMI_CLOUDFLARE_API_TOKEN
      ?.trim() ||
    process.env
      .CLOUDFLARE_API_TOKEN
      ?.trim() ||
    '';

  const endpoint =
    process.env
      .R2_ENDPOINT
      ?.trim() ||
    '';

  const endpointAccountId =
    endpoint.match(
      /^https?:\\/\\/([a-z0-9]+)\\.r2\\.cloudflarestorage\\.com/i,
    )
      ?.[1] ||
    '';

  const accountId =
    process.env
      .R2_ACCOUNT_ID
      ?.trim() ||
    process.env
      .CLOUDFLARE_ACCOUNT_ID
      ?.trim() ||
    endpointAccountId;

  if (
    !token ||
    !accountId
  ) {
    return {
      status:
        row.status ===
          'unknown'
          ? 'active'
          : row.status,
      syncStatus:
        'degraded',
      syncError:
        'Set SAMI_CLOUDFLARE_API_TOKEN and R2_ACCOUNT_ID for Cloudflare billing sync.',
      metadata: {
        billingApiConfigured:
          false,
        accountIdConfigured:
          Boolean(
            accountId,
          ),
      },
    };
  }

  const headers = {
    Authorization:
      `Bearer ${token}`,
    Accept:
      'application/json',
  };

  const infoResponse =
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        accountId,
      )}/billable-usage/info`,
      {
        headers,
        cache:
          'no-store',
      },
    );

  let renewalAt:
    string |
    null =
    null;

  let expiresAt:
    string |
    null =
    null;

  let status:
    ServiceStatus =
    'active';

  if (
    infoResponse.ok
  ) {
    const info =
      await infoResponse.json() as
        {
          result?:
            {
              covered?:
                boolean;
              subscriptions?:
                Array<
                  Record<
                    string,
                    unknown
                  >
                >;
            };
        };

    const subscriptions =
      info.result
        ?.subscriptions ||
      [];

    const anchors =
      subscriptions
        .map(
          item =>
            firstDate(
              item,
              [
                'billing_cycle_anchor_timestamp',
                'start_timestamp',
              ],
            ),
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(
              value,
            ),
        )
        .sort();

    renewalAt =
      anchors[
        anchors.length -
        1
      ] ||
      null;

    const ends =
      subscriptions
        .map(
          item =>
            firstDate(
              item,
              [
                'end_timestamp',
              ],
            ),
        )
        .filter(
          (
            value,
          ): value is string =>
              Boolean(
                value,
              ),
        )
        .sort();

    expiresAt =
      ends[
        ends.length -
        1
      ] ||
      null;

    if (
      expiresAt &&
      new Date(
        expiresAt,
      ).getTime() <=
        Date.now()
    ) {
      status =
        'expired';
    }
  }

  let billedCost =
    0;

  let currency:
    string |
    null =
    null;

  let r2Rows =
    0;

  try {
    const usageResponse =
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
          accountId,
        )}/billable-usage`,
        {
          headers,
          cache:
            'no-store',
        },
      );

    if (
      usageResponse.ok
    ) {
      const usage =
        await usageResponse.json() as
          {
            result?:
              Array<
                Record<
                  string,
                  unknown
                >
              >;
          };

      for (
        const charge
        of usage.result ||
        []
      ) {
        const product =
          (
            firstString(
              charge,
              [
                'x_ProductFamilyName',
                'ServiceName',
                'ServiceFamilyName',
              ],
            ) ||
            ''
          )
            .toLowerCase();

        if (
          !product.includes(
            'r2',
          )
        ) {
          continue;
        }

        r2Rows +=
          1;

        billedCost +=
          firstNumber(
            charge,
            [
              'BilledCost',
              'ContractedCost',
            ],
          ) ||
          0;

        currency =
          currency ||
          firstString(
            charge,
            [
              'BillingCurrency',
            ],
          );
      }
    }
  } catch {
    // Subscription/renewal status is still useful.
  }

  return {
    status,
    syncStatus:
      infoResponse.ok
        ? 'ok'
        : 'degraded',
    syncError:
      infoResponse.ok
        ? null
        : `Cloudflare billing info API returned HTTP ${infoResponse.status}.`,
    amount:
      billedCost,
    currency:
      currency ||
      row.currency ||
      null,
    renewalAt,
    expiresAt,
    metadata: {
      accountIdConfigured:
        true,
      billingApiConfigured:
        true,
      r2BillingRows:
        r2Rows,
    },
    usageSnapshots: [
      {
        metricKey:
          'monthly_cost',
        metricName:
          'R2 billable cost',
        costAmount:
          billedCost,
        costCurrency:
          currency ||
          row.currency ||
          null,
        source:
          'cloudflare_billing_api',
        metadata: {
          r2Rows,
        },
      },
    ],
  };
}


async function syncEnvironmentService(
  row:
    ServiceRow,
): Promise<SyncPatch> {
  if (
    row.service_key ===
      'ai-primary'
  ) {
    const status =
      getSamiAiProviderStatus();

    return {
      provider:
        status.provider ||
        row.provider,
      planName:
        status.model ||
        row.plan_name,
      status:
        status.configured
          ? 'active'
          : 'not_configured',
      syncStatus:
        status.configured
          ? 'ok'
          : 'degraded',
      syncError:
        status.error ||
        null,
      metadata: {
        provider:
          status.provider,
        model:
          status.model,
      },
    };
  }

  if (
    row.service_key ===
      'email-primary'
  ) {
    const configured =
      Boolean(
        process.env
          .SMTP_HOST
          ?.trim() &&
        process.env
          .SMTP_USER
          ?.trim(),
      );

    return {
      status:
        configured
          ? 'active'
          : 'not_configured',
      syncStatus:
        configured
          ? 'ok'
          : 'degraded',
      syncError:
        configured
          ? null
          : 'SMTP is not fully configured.',
      metadata: {
        configured,
        host:
          configured
            ? process.env
                .SMTP_HOST
                ?.trim()
            : null,
      },
    };
  }

  if (
    row.service_key ===
      'sms-primary'
  ) {
    const provider =
      process.env
        .SAMI_SMS_PROVIDER
        ?.trim()
        .toLowerCase() ||
      '';

    const configured =
      provider ===
        'africastalking'
        ? Boolean(
            process.env
              .AFRICASTALKING_USERNAME
              ?.trim() &&
            process.env
              .AFRICASTALKING_API_KEY
              ?.trim(),
          )
        : Boolean(
            provider,
          );

    return {
      provider:
        provider ||
        row.provider,
      status:
        configured
          ? 'active'
          : 'not_configured',
      syncStatus:
        configured
          ? 'ok'
          : 'degraded',
      syncError:
        configured
          ? null
          : 'SMS provider is not fully configured.',
      metadata: {
        provider:
          provider ||
          null,
        configured,
      },
    };
  }

  return {
    syncStatus:
      'not_supported',
    syncError:
      'This service is maintained manually.',
  };
}


async function syncService(
  row:
    ServiceRow,
): Promise<SyncPatch> {
  switch (
    row.sync_adapter
  ) {
    case 'vercel':
      return syncVercel(
        row,
      );

    case 'neon':
      return syncNeon(
        row,
      );

    case 'cloudflare_r2':
      return syncCloudflareR2(
        row,
      );

    case 'ai':
    case 'email':
    case 'sms':
      return syncEnvironmentService(
        row,
      );

    default:
      return {
        syncStatus:
          'not_supported',
        syncError:
          null,
      };
  }
}


async function insertUsageSnapshots(
  serviceId:
    string,
  snapshots:
    SyncPatch['usageSnapshots'],
) {
  for (
    const snapshot
    of snapshots ||
    []
  ) {
    await queryControl(
      `
        INSERT INTO platform_service_usage_snapshots (
          subscription_id,
          metric_key,
          metric_name,
          used_value,
          limit_value,
          unit,
          cost_amount,
          cost_currency,
          period_start,
          period_end,
          source,
          metadata,
          captured_at,
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
          $9,
          $10,
          $11,
          $12::jsonb,
          NOW(),
          NOW()
        )
      `,
      [
        serviceId,
        snapshot.metricKey
          .trim()
          .slice(
            0,
            120,
          ),
        snapshot.metricName
          .trim()
          .slice(
            0,
            160,
          ),
        snapshot.usedValue ??
        null,
        snapshot.limitValue ??
        null,
        snapshot.unit
          ?.trim()
          .slice(
            0,
            80,
          ) ||
        null,
        snapshot.costAmount ??
        null,
        snapshot.costCurrency
          ?.trim()
          .toUpperCase()
          .slice(
            0,
            3,
          ) ||
        null,
        snapshot.periodStart
          ? toIso(
              snapshot.periodStart,
            )
          : null,
        snapshot.periodEnd
          ? toIso(
              snapshot.periodEnd,
            )
          : null,
        snapshot.source
          ?.trim()
          .slice(
            0,
            40,
          ) ||
        null,
        JSON.stringify(
          safeMetadata(
            snapshot.metadata,
          ),
        ),
      ],
    );
  }
}


async function recordServiceEvent(
  row:
    ServiceRow,
  status:
    ServiceStatus,
  previousStatus:
    ServiceStatus,
) {
  if (
    status ===
      previousStatus
  ) {
    return;
  }

  const important =
    [
      'renewal_due',
      'payment_required',
      'quota_warning',
      'upgrade_recommended',
      'suspended',
      'expired',
    ].includes(
      status,
    );

  const severity =
    status ===
        'expired' ||
      status ===
        'suspended' ||
      status ===
        'payment_required'
      ? 'critical'
      : status ===
          'upgrade_recommended'
        ? 'error'
        : 'warning';

  const title =
    `${row.service_name}: ${status.replace(
      /_/g,
      ' ',
    )}`;

  let incidentId:
    string |
    null =
    null;

  if (
    important
  ) {
    const incident =
      await capturePlatformIncident({
        source:
          'platform_service_monitor',
        provider:
          row.provider,
        category:
          'platform_service_subscription',
        title,
        severity:
          severity as
            'warning' |
            'error' |
            'critical',
        operation:
          row.service_key,
        error:
          new Error(
            `Platform dependency "${row.service_name}" changed from ${previousStatus} to ${status}.`,
          ),
        metadata: {
          serviceKey:
            row.service_key,
          category:
            row.category,
          previousStatus,
          status,
          renewalAt:
            toIso(
              row.renewal_at,
            ),
          expiresAt:
            toIso(
              row.expires_at,
            ),
          quotaUsed:
            numberOrNull(
              row.quota_used,
            ),
          quotaLimit:
            numberOrNull(
              row.quota_limit,
            ),
          quotaUnit:
            row.quota_unit,
        },
      });

    incidentId =
      incident
        ?.incidentId ||
      null;
  }

  await queryControl(
    `
      INSERT INTO platform_service_events (
        subscription_id,
        event_type,
        severity,
        title,
        message,
        effective_at,
        incident_id,
        metadata,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW(),
        $6,
        $7::jsonb,
        NOW()
      )
    `,
    [
      row.id,
      `status.${status}`,
      severity,
      title,
      `Status changed from ${previousStatus} to ${status}.`,
      incidentId,
      JSON.stringify({
        previousStatus,
        status,
      }),
    ],
  );
}


async function applySyncPatch(
  row:
    ServiceRow,
  patch:
    SyncPatch,
) {
  const evaluatedStatus =
    evaluateServiceStatus(
      row,
      patch,
    );

  const previousStatus =
    row.status;

  const result =
    await queryControl(
      `
        UPDATE platform_service_subscriptions
        SET
          provider =
            COALESCE(
              $2,
              provider
            ),
          service_name =
            COALESCE(
              $3,
              service_name
            ),
          status =
            $4,
          plan_name =
            CASE
              WHEN $5::boolean
              THEN $6
              ELSE plan_name
            END,
          billing_cycle =
            CASE
              WHEN $7::boolean
              THEN $8
              ELSE billing_cycle
            END,
          amount =
            CASE
              WHEN $9::boolean
              THEN $10
              ELSE amount
            END,
          currency =
            CASE
              WHEN $11::boolean
              THEN $12
              ELSE currency
            END,
          billing_period_start =
            CASE
              WHEN $13::boolean
              THEN $14
              ELSE billing_period_start
            END,
          billing_period_end =
            CASE
              WHEN $15::boolean
              THEN $16
              ELSE billing_period_end
            END,
          renewal_at =
            CASE
              WHEN $17::boolean
              THEN $18
              ELSE renewal_at
            END,
          expires_at =
            CASE
              WHEN $19::boolean
              THEN $20
              ELSE expires_at
            END,
          quota_used =
            CASE
              WHEN $21::boolean
              THEN $22
              ELSE quota_used
            END,
          quota_limit =
            CASE
              WHEN $23::boolean
              THEN $24
              ELSE quota_limit
            END,
          quota_unit =
            CASE
              WHEN $25::boolean
              THEN $26
              ELSE quota_unit
            END,
          sync_status =
            $27,
          last_synced_at =
            NOW(),
          last_sync_error =
            $28,
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            $29::jsonb,
          updated_at =
            NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        row.id,
        patch.provider ??
        null,
        patch.serviceName ??
        null,
        evaluatedStatus,
        Object.prototype.hasOwnProperty.call(
          patch,
          'planName',
        ),
        patch.planName ??
        null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'billingCycle',
        ),
        patch.billingCycle ??
        null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'amount',
        ),
        patch.amount ??
        null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'currency',
        ),
        patch.currency
          ?.toUpperCase() ??
        null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'billingPeriodStart',
        ),
        patch.billingPeriodStart
          ? toIso(
              patch.billingPeriodStart,
            )
          : null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'billingPeriodEnd',
        ),
        patch.billingPeriodEnd
          ? toIso(
              patch.billingPeriodEnd,
            )
          : null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'renewalAt',
        ),
        patch.renewalAt
          ? toIso(
              patch.renewalAt,
            )
          : null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'expiresAt',
        ),
        patch.expiresAt
          ? toIso(
              patch.expiresAt,
            )
          : null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'quotaUsed',
        ),
        patch.quotaUsed ??
        null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'quotaLimit',
        ),
        patch.quotaLimit ??
        null,
        Object.prototype.hasOwnProperty.call(
          patch,
          'quotaUnit',
        ),
        patch.quotaUnit ??
        null,
        patch.syncStatus,
        patch.syncError ??
        null,
        JSON.stringify(
          safeMetadata(
            patch.metadata,
          ),
        ),
      ],
    );

  const updated =
    result.rows[0] as
      ServiceRow;

  await insertUsageSnapshots(
    row.id,
    patch.usageSnapshots,
  );

  await recordServiceEvent(
    updated,
    evaluatedStatus,
    previousStatus,
  );

  return updated;
}


export async function syncPlatformServiceSubscriptions() {
  const services =
    await loadServices();

  const results:
    Array<{
      serviceKey:
        string;
      status:
        string;
      syncStatus:
        string;
      error:
        string |
        null;
    }> =
    [];

  for (
    const service
    of services
  ) {
    try {
      const patch =
        await syncService(
          service,
        );

      const updated =
        await applySyncPatch(
          service,
          patch,
        );

      results.push({
        serviceKey:
          service.service_key,
        status:
          updated.status,
        syncStatus:
          updated.sync_status,
        error:
          updated.last_sync_error,
      });
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : 'Unknown service sync failure';

      try {
        await queryControl(
          `
            UPDATE platform_service_subscriptions
            SET
              sync_status =
                'failed',
              last_synced_at =
                NOW(),
              last_sync_error =
                $2,
              updated_at =
                NOW()
            WHERE id = $1
          `,
          [
            service.id,
            message.slice(
              0,
              2_000,
            ),
          ],
        );
      } catch {
        // Monitoring must remain fail-open.
      }

      await capturePlatformIncident({
        source:
          'platform_service_monitor',
        provider:
          service.provider,
        category:
          'platform_service_sync_failed',
        title:
          `${service.service_name} monitoring failed`,
        severity:
          'warning',
        operation:
          service.service_key,
        error,
        metadata: {
          serviceKey:
            service.service_key,
        },
      });

      results.push({
        serviceKey:
          service.service_key,
        status:
          service.status,
        syncStatus:
          'failed',
        error:
          message,
      });
    }
  }

  return {
    checkedAt:
      new Date()
        .toISOString(),
    services:
      results,
  };
}


export async function listPlatformServiceSubscriptions() {
  const services =
    await loadServices();

  return services.map(
    row => {
      const used =
        numberOrNull(
          row.quota_used,
        );

      const limit =
        numberOrNull(
          row.quota_limit,
        );

      return {
        id:
          row.id,
        serviceKey:
          row.service_key,
        provider:
          row.provider,
        serviceName:
          row.service_name,
        category:
          row.category,
        source:
          row.source,
        status:
          row.status,
        planName:
          row.plan_name,
        billingCycle:
          row.billing_cycle,
        amount:
          numberOrNull(
            row.amount,
          ),
        currency:
          row.currency,
        billingPeriodStart:
          toIso(
            row.billing_period_start,
          ),
        billingPeriodEnd:
          toIso(
            row.billing_period_end,
          ),
        renewalAt:
          toIso(
            row.renewal_at,
          ),
        expiresAt:
          toIso(
            row.expires_at,
          ),
        autoRenew:
          row.auto_renew ===
          true,
        quotaUsed:
          used,
        quotaLimit:
          limit,
        quotaUnit:
          row.quota_unit,
        quotaPercent:
          used !==
              null &&
            limit !==
              null &&
            limit >
              0
            ? (
                used /
                limit
              ) *
              100
            : null,
        warningThresholdPercent:
          numberOrNull(
            row.warning_threshold_percent,
          ) ||
          80,
        managementUrl:
          row.management_url,
        syncAdapter:
          row.sync_adapter,
        syncStatus:
          row.sync_status,
        lastSyncedAt:
          toIso(
            row.last_synced_at,
          ),
        lastSyncError:
          row.last_sync_error,
        metadata:
          row.metadata ||
          {},
        updatedAt:
          toIso(
            row.updated_at,
          ),
      };
    },
  );
}


export async function updatePlatformServiceSubscription(
  input: {
    serviceKey:
      string;
    planName?:
      unknown;
    billingCycle?:
      unknown;
    amount?:
      unknown;
    currency?:
      unknown;
    renewalAt?:
      unknown;
    expiresAt?:
      unknown;
    autoRenew?:
      unknown;
    quotaLimit?:
      unknown;
    quotaUnit?:
      unknown;
    warningThresholdPercent?:
      unknown;
    managementUrl?:
      unknown;
  },
) {
  const serviceKey =
    input.serviceKey
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9][a-z0-9._-]{1,119}$/.test(
      serviceKey,
    )
  ) {
    throw new Error(
      'INVALID_SERVICE',
    );
  }

  const billingCycle =
    typeof input.billingCycle ===
      'string'
      ? input.billingCycle
          .trim()
          .toLowerCase()
      : null;

  if (
    billingCycle &&
    ![
      'monthly',
      'annual',
      'usage',
      'prepaid',
      'free',
      'custom',
    ].includes(
      billingCycle,
    )
  ) {
    throw new Error(
      'INVALID_BILLING_CYCLE',
    );
  }

  const currency =
    typeof input.currency ===
      'string'
      ? input.currency
          .trim()
          .toUpperCase()
      : null;

  if (
    currency &&
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new Error(
      'INVALID_CURRENCY',
    );
  }

  const amount =
    input.amount ===
      '' ||
    input.amount ===
      null ||
    input.amount ===
      undefined
      ? null
      : numberOrNull(
          input.amount,
        );

  if (
    amount !==
      null &&
    amount <
      0
  ) {
    throw new Error(
      'INVALID_AMOUNT',
    );
  }

  const quotaLimit =
    input.quotaLimit ===
      '' ||
    input.quotaLimit ===
      null ||
    input.quotaLimit ===
      undefined
      ? null
      : numberOrNull(
          input.quotaLimit,
        );

  if (
    quotaLimit !==
      null &&
    quotaLimit <
      0
  ) {
    throw new Error(
      'INVALID_QUOTA_LIMIT',
    );
  }

  const threshold =
    input.warningThresholdPercent ===
      '' ||
    input.warningThresholdPercent ===
      null ||
    input.warningThresholdPercent ===
      undefined
      ? 80
      : numberOrNull(
          input.warningThresholdPercent,
        );

  if (
    threshold ===
      null ||
    threshold <
      1 ||
    threshold >
      100
  ) {
    throw new Error(
      'INVALID_WARNING_THRESHOLD',
    );
  }

  const renewalAt =
    input.renewalAt
      ? toIso(
          String(
            input.renewalAt,
          ),
        )
      : null;

  const expiresAt =
    input.expiresAt
      ? toIso(
          String(
            input.expiresAt,
          ),
        )
      : null;

  if (
    input.renewalAt &&
    !renewalAt
  ) {
    throw new Error(
      'INVALID_RENEWAL_DATE',
    );
  }

  if (
    input.expiresAt &&
    !expiresAt
  ) {
    throw new Error(
      'INVALID_EXPIRY_DATE',
    );
  }

  const result =
    await withControlTransaction(
      async client => {
        const current =
          await client.query(
            `
              SELECT *
              FROM platform_service_subscriptions
              WHERE service_key = $1
                AND deleted_at
                    IS NULL
              LIMIT 1
              FOR UPDATE
            `,
            [
              serviceKey,
            ],
          );

        const row =
          current.rows[0] as
            ServiceRow |
            undefined;

        if (
          !row
        ) {
          throw new Error(
            'SERVICE_NOT_FOUND',
          );
        }

        const updated =
          await client.query(
            `
              UPDATE platform_service_subscriptions
              SET
                plan_name =
                  $2,
                billing_cycle =
                  $3,
                amount =
                  $4,
                currency =
                  $5,
                renewal_at =
                  $6,
                expires_at =
                  $7,
                auto_renew =
                  $8,
                quota_limit =
                  $9,
                quota_unit =
                  $10,
                warning_threshold_percent =
                  $11,
                management_url =
                  $12,
                source =
                  CASE
                    WHEN sync_adapter IS NULL
                      OR sync_adapter =
                         'manual'
                    THEN 'manual'
                    ELSE 'hybrid'
                  END,
                updated_at =
                  NOW()
              WHERE id = $1
              RETURNING *
            `,
            [
              row.id,
              typeof input.planName ===
                'string'
                ? input.planName
                    .trim()
                    .slice(
                      0,
                      160,
                    ) ||
                  null
                : null,
              billingCycle,
              amount,
              currency,
              renewalAt,
              expiresAt,
              input.autoRenew ===
                true,
              quotaLimit,
              typeof input.quotaUnit ===
                'string'
                ? input.quotaUnit
                    .trim()
                    .slice(
                      0,
                      80,
                    ) ||
                  null
                : null,
              threshold,
              typeof input.managementUrl ===
                'string'
                ? input.managementUrl
                    .trim()
                    .slice(
                      0,
                      2_000,
                    ) ||
                  null
                : null,
            ],
          );

        return updated
          .rows[0] as
            ServiceRow;
      },
    );

  const evaluated =
    evaluateServiceStatus(
      result,
      {
        syncStatus:
          result.sync_status ===
            'ok'
            ? 'ok'
            : result.sync_status ===
                'failed'
              ? 'failed'
              : result.sync_status ===
                  'not_supported'
                ? 'not_supported'
                : 'degraded',
      },
    );

  if (
    evaluated !==
      result.status
  ) {
    await queryControl(
      `
        UPDATE platform_service_subscriptions
        SET
          status =
            $2,
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        result.id,
        evaluated,
      ],
    );

    await recordServiceEvent(
      result,
      evaluated,
      result.status,
    );
  }

  return {
    serviceKey,
    status:
      evaluated,
  };
}
