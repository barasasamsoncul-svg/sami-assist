import 'server-only';

import {
  getSamiAiProviderStatus,
  requireSamiAiProviderConfig,
} from '@/lib/ai/config';

import {
  getBillingProviderCatalog,
} from '@/lib/billing/registry';

import {
  queryControl,
} from '@/lib/db/control';

import {
  recordProviderCheck,
} from '@/lib/observability/platform-incidents';


export type PlatformProviderStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'not_configured'
  | 'unknown';

export type PlatformProviderSnapshot = {
  key:
    string;
  name:
    string;
  status:
    PlatformProviderStatus;
  message:
    string;
  latencyMs:
    number | null;
  checkedAt:
    string;
  metadata:
    Record<
      string,
      unknown
    >;
};


function nowIso() {
  return new Date()
    .toISOString();
}


function timeoutSignal(
  milliseconds:
    number,
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      milliseconds,
    );

  return {
    signal:
      controller.signal,
    clear:
      () =>
        clearTimeout(
          timer,
        ),
  };
}


async function safePersist(
  snapshot:
    PlatformProviderSnapshot,
) {
  try {
    await recordProviderCheck({
      provider:
        snapshot.key,
      component:
        'platform',
      status:
        snapshot.status,
      latencyMs:
        snapshot.latencyMs,
      message:
        snapshot.message,
      metadata:
        snapshot.metadata,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Admin] Provider check persistence failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown provider-check error',
    );
  }

  return snapshot;
}


export async function checkControlDatabaseProvider():
  Promise<PlatformProviderSnapshot> {
  const started =
    Date.now();

  try {
    const result =
      await queryControl(
        `
          SELECT
            NOW()
              AS database_time,
            current_database()
              AS database_name
        `,
      );

    const latencyMs =
      Date.now() -
      started;

    return safePersist({
      key:
        'postgres',
      name:
        'SaMi Control Database',
      status:
        'healthy',
      message:
        'Control database is reachable.',
      latencyMs,
      checkedAt:
        nowIso(),
      metadata: {
        databaseTime:
          result.rows[0]
            ?.database_time ||
          null,
        databaseName:
          result.rows[0]
            ?.database_name ||
          null,
      },
    });
  } catch (
    error
  ) {
    return safePersist({
      key:
        'postgres',
      name:
        'SaMi Control Database',
      status:
        'unavailable',
      message:
        'Control database health check failed.',
      latencyMs:
        Date.now() -
        started,
      checkedAt:
        nowIso(),
      metadata: {
        errorCode:
          error &&
          typeof error ===
            'object' &&
          'code' in
            error
            ? String(
                (
                  error as {
                    code?:
                      unknown;
                  }
                ).code ||
                '',
              )
            : null,
      },
    });
  }
}


export async function checkAiProvider():
  Promise<PlatformProviderSnapshot> {
  const status =
    getSamiAiProviderStatus();

  if (
    !status.configured
  ) {
    return safePersist({
      key:
        'ai',
      name:
        'SaMi AI Provider',
      status:
        'not_configured',
      message:
        status.error ||
        'AI provider is not configured.',
      latencyMs:
        null,
      checkedAt:
        nowIso(),
      metadata: {
        provider:
          status.provider,
        model:
          status.model,
      },
    });
  }

  const started =
    Date.now();

  try {
    const config =
      requireSamiAiProviderConfig();

    const timeout =
      timeoutSignal(
        5_000,
      );

    try {
      const response =
        await fetch(
          `${config.baseUrl.replace(
            /\/+$/,
            '',
          )}/models`,
          {
            method:
              'GET',
            headers: {
              Authorization:
                `Bearer ${config.apiKey}`,
              Accept:
                'application/json',
            },
            cache:
              'no-store',
            signal:
              timeout.signal,
          },
        );

      const latencyMs =
        Date.now() -
        started;

      return safePersist({
        key:
          'ai',
        name:
          'SaMi AI Provider',
        status:
          response.ok
            ? 'healthy'
            : response.status >=
                500
              ? 'unavailable'
              : 'degraded',
        message:
          response.ok
            ? 'AI provider API is reachable.'
            : `AI provider returned HTTP ${response.status}.`,
        latencyMs,
        checkedAt:
          nowIso(),
        metadata: {
          provider:
            config.provider,
          model:
            config.model,
          statusCode:
            response.status,
        },
      });
    } finally {
      timeout.clear();
    }
  } catch (
    error
  ) {
    return safePersist({
      key:
        'ai',
      name:
        'SaMi AI Provider',
      status:
        'unavailable',
      message:
        error instanceof
          Error
          ? error.name ===
              'AbortError'
            ? 'AI provider health check timed out.'
            : 'AI provider health check failed.'
          : 'AI provider health check failed.',
      latencyMs:
        Date.now() -
        started,
      checkedAt:
        nowIso(),
      metadata: {
        provider:
          status.provider,
        model:
          status.model,
      },
    });
  }
}


function vercelConfig() {
  return {
    token:
      process.env
        .SAMI_VERCEL_API_TOKEN
        ?.trim() ||
      process.env
        .VERCEL_TOKEN
        ?.trim() ||
      '',
    projectId:
      process.env
        .SAMI_VERCEL_PROJECT_ID
        ?.trim() ||
      process.env
        .VERCEL_PROJECT_ID
        ?.trim() ||
      '',
    teamId:
      process.env
        .SAMI_VERCEL_TEAM_ID
        ?.trim() ||
      process.env
        .VERCEL_ORG_ID
        ?.trim() ||
      '',
    deploymentId:
      process.env
        .VERCEL_DEPLOYMENT_ID
        ?.trim() ||
      '',
    environment:
      process.env
        .VERCEL_ENV
        ?.trim() ||
      null,
    productionUrl:
      process.env
        .VERCEL_PROJECT_PRODUCTION_URL
        ?.trim() ||
      null,
  };
}


export async function checkVercelProvider():
  Promise<PlatformProviderSnapshot> {
  const config =
    vercelConfig();

  if (
    !config.projectId
  ) {
    return safePersist({
      key:
        'vercel',
      name:
        'Vercel',
      status:
        'not_configured',
      message:
        'Vercel project identity is unavailable in this environment.',
      latencyMs:
        null,
      checkedAt:
        nowIso(),
      metadata: {
        environment:
          config.environment,
        productionUrl:
          config.productionUrl,
      },
    });
  }

  if (
    !config.token
  ) {
    return safePersist({
      key:
        'vercel',
      name:
        'Vercel',
      status:
        'degraded',
      message:
        'SaMi is running on Vercel, but live Platform Admin API access is not configured.',
      latencyMs:
        null,
      checkedAt:
        nowIso(),
      metadata: {
        projectId:
          config.projectId,
        deploymentId:
          config.deploymentId ||
          null,
        environment:
          config.environment,
        productionUrl:
          config.productionUrl,
        liveApiConfigured:
          false,
      },
    });
  }

  const started =
    Date.now();

  try {
    const url =
      new URL(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(
          config.projectId,
        )}`,
      );

    if (
      config.teamId
    ) {
      url.searchParams.set(
        'teamId',
        config.teamId,
      );
    }

    const timeout =
      timeoutSignal(
        5_000,
      );

    try {
      const response =
        await fetch(
          url,
          {
            headers: {
              Authorization:
                `Bearer ${config.token}`,
              Accept:
                'application/json',
            },
            cache:
              'no-store',
            signal:
              timeout.signal,
          },
        );

      const latencyMs =
        Date.now() -
        started;

      let project:
        Record<
          string,
          unknown
        > =
        {};

      try {
        project =
          await response.json() as
            Record<
              string,
              unknown
            >;
      } catch {
        project =
          {};
      }

      return safePersist({
        key:
          'vercel',
        name:
          'Vercel',
        status:
          response.ok
            ? 'healthy'
            : response.status >=
                500
              ? 'unavailable'
              : 'degraded',
        message:
          response.ok
            ? 'Vercel project API is reachable.'
            : `Vercel project API returned HTTP ${response.status}.`,
        latencyMs,
        checkedAt:
          nowIso(),
        metadata: {
          projectId:
            config.projectId,
          projectName:
            typeof project.name ===
              'string'
              ? project.name
              : null,
          deploymentId:
            config.deploymentId ||
            null,
          environment:
            config.environment,
          productionUrl:
            config.productionUrl,
          liveApiConfigured:
            true,
          statusCode:
            response.status,
        },
      });
    } finally {
      timeout.clear();
    }
  } catch (
    error
  ) {
    return safePersist({
      key:
        'vercel',
      name:
        'Vercel',
      status:
        'unavailable',
      message:
        error instanceof
          Error &&
        error.name ===
          'AbortError'
          ? 'Vercel API health check timed out.'
          : 'Vercel API health check failed.',
      latencyMs:
        Date.now() -
        started,
      checkedAt:
        nowIso(),
      metadata: {
        projectId:
          config.projectId,
        deploymentId:
          config.deploymentId ||
          null,
        environment:
          config.environment,
      },
    });
  }
}


function neonConfig() {
  return {
    apiKey:
      process.env
        .SAMI_NEON_API_KEY
        ?.trim() ||
      process.env
        .NEON_API_KEY
        ?.trim() ||
      '',
    projectId:
      process.env
        .SAMI_NEON_PROJECT_ID
        ?.trim() ||
      process.env
        .NEON_PROJECT_ID
        ?.trim() ||
      '',
  };
}


export async function checkNeonProvider():
  Promise<PlatformProviderSnapshot> {
  const config =
    neonConfig();

  if (
    !config.apiKey ||
    !config.projectId
  ) {
    return safePersist({
      key:
        'neon',
      name:
        'Neon',
      status:
        'degraded',
      message:
        'Database connectivity is monitored, but Neon project API access is not fully configured.',
      latencyMs:
        null,
      checkedAt:
        nowIso(),
      metadata: {
        projectApiConfigured:
          false,
        projectIdConfigured:
          Boolean(
            config.projectId,
          ),
        apiKeyConfigured:
          Boolean(
            config.apiKey,
          ),
      },
    });
  }

  const started =
    Date.now();

  try {
    const timeout =
      timeoutSignal(
        5_000,
      );

    try {
      const response =
        await fetch(
          `https://console.neon.tech/api/v2/projects/${encodeURIComponent(
            config.projectId,
          )}`,
          {
            headers: {
              Authorization:
                `Bearer ${config.apiKey}`,
              Accept:
                'application/json',
            },
            cache:
              'no-store',
            signal:
              timeout.signal,
          },
        );

      const latencyMs =
        Date.now() -
        started;

      let data:
        Record<
          string,
          unknown
        > =
        {};

      try {
        data =
          await response.json() as
            Record<
              string,
              unknown
            >;
      } catch {
        data =
          {};
      }

      const project =
        data.project &&
        typeof data.project ===
          'object'
          ? data.project as
              Record<
                string,
                unknown
              >
          : {};

      return safePersist({
        key:
          'neon',
        name:
          'Neon',
        status:
          response.ok
            ? 'healthy'
            : response.status >=
                500
              ? 'unavailable'
              : 'degraded',
        message:
          response.ok
            ? 'Neon project API is reachable.'
            : `Neon project API returned HTTP ${response.status}.`,
        latencyMs,
        checkedAt:
          nowIso(),
        metadata: {
          projectId:
            config.projectId,
          projectName:
            typeof project.name ===
              'string'
              ? project.name
              : null,
          regionId:
            typeof project.region_id ===
              'string'
              ? project.region_id
              : null,
          pgVersion:
            typeof project.pg_version ===
              'number' ||
            typeof project.pg_version ===
              'string'
              ? project.pg_version
              : null,
          statusCode:
            response.status,
          projectApiConfigured:
            true,
        },
      });
    } finally {
      timeout.clear();
    }
  } catch (
    error
  ) {
    return safePersist({
      key:
        'neon',
      name:
        'Neon',
      status:
        'unavailable',
      message:
        error instanceof
          Error &&
        error.name ===
          'AbortError'
          ? 'Neon project API health check timed out.'
          : 'Neon project API health check failed.',
      latencyMs:
        Date.now() -
        started,
      checkedAt:
        nowIso(),
      metadata: {
        projectId:
          config.projectId,
        projectApiConfigured:
          true,
      },
    });
  }
}


export async function checkBillingProviders():
  Promise<PlatformProviderSnapshot> {
  try {
    const providers =
      getBillingProviderCatalog();

    const active =
      providers.find(
        provider =>
          provider.active,
      );

    const configured =
      providers.filter(
        provider =>
          provider.configured,
      );

    return safePersist({
      key:
        'billing',
      name:
        'Billing Providers',
      status:
        active
          ?.configured
          ? 'healthy'
          : 'degraded',
      message:
        active
          ?.configured
          ? `Active billing provider ${active.name} is configured.`
          : 'The active billing provider is not fully configured.',
      latencyMs:
        null,
      checkedAt:
        nowIso(),
      metadata: {
        active:
          active
            ? {
                key:
                  active.key,
                name:
                  active.name,
                configured:
                  active.configured,
                capabilities:
                  active.capabilities,
              }
            : null,
        configuredProviders:
          configured.map(
            provider =>
              provider.key,
          ),
        providers:
          providers.map(
            provider => ({
              key:
                provider.key,
              name:
                provider.name,
              configured:
                provider.configured,
              active:
                provider.active,
            }),
          ),
      },
    });
  } catch (
    error
  ) {
    return safePersist({
      key:
        'billing',
      name:
        'Billing Providers',
      status:
        'unavailable',
      message:
        'Billing provider configuration could not be evaluated.',
      latencyMs:
        null,
      checkedAt:
        nowIso(),
      metadata: {
        error:
          error instanceof
            Error
            ? error.message
            : 'Unknown billing configuration error',
      },
    });
  }
}


export async function checkMessagingProviders():
  Promise<PlatformProviderSnapshot> {
  const smtpConfigured =
    Boolean(
      process.env
        .SMTP_HOST
        ?.trim() &&
      process.env
        .SMTP_USER
        ?.trim(),
    );

  const smsProvider =
    process.env
      .SAMI_SMS_PROVIDER
      ?.trim() ||
    '';

  const smsConfigured =
    smsProvider
      ? smsProvider ===
          'africastalking'
        ? Boolean(
            process.env
              .AFRICASTALKING_API_KEY
              ?.trim() &&
            process.env
              .AFRICASTALKING_USERNAME
              ?.trim(),
          )
        : true
      : false;

  return safePersist({
    key:
      'messaging',
    name:
      'Email & SMS',
    status:
      smtpConfigured &&
      smsConfigured
        ? 'healthy'
        : smtpConfigured ||
            smsConfigured
          ? 'degraded'
          : 'not_configured',
    message:
      smtpConfigured &&
      smsConfigured
        ? 'Email and SMS providers are configured.'
        : smtpConfigured
          ? 'Email is configured; SMS still needs provider credentials.'
          : smsConfigured
            ? 'SMS is configured; email still needs SMTP credentials.'
            : 'Email and SMS provider credentials are not configured.',
    latencyMs:
      null,
    checkedAt:
      nowIso(),
    metadata: {
      smtpConfigured,
      smsProvider:
        smsProvider ||
        null,
      smsConfigured,
    },
  });
}


export async function getPlatformProviderHealth() {
  const results =
    await Promise.all([
      checkControlDatabaseProvider(),
      checkNeonProvider(),
      checkVercelProvider(),
      checkAiProvider(),
      checkBillingProviders(),
      checkMessagingProviders(),
    ]);

  return {
    checkedAt:
      nowIso(),
    providers:
      results,
  };
}
