import 'server-only';


type VercelDeployment = {
  id:
    string;
  url:
    string | null;
  state:
    string | null;
  target:
    string | null;
  createdAt:
    string | null;
  commitRef:
    string | null;
  commitSha:
    string | null;
  commitMessage:
    string | null;
};


type VercelRuntimeEvent = {
  type:
    string | null;
  level:
    string | null;
  text:
    string | null;
  createdAt:
    string | null;
  requestId:
    string | null;
  route:
    string | null;
  statusCode:
    number | null;
};


const URL_CREDENTIAL_RE =
  /([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi;

const BEARER_RE =
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

const SECRET_RE =
  /\b(password|passwd|secret|token|api[_-]?key|authorization|client[_-]?secret)\b\s*[:=]\s*([^\s,;]+)/gi;


function redact(
  value:
    unknown,
  max =
    12_000,
) {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  return value
    .replace(
      URL_CREDENTIAL_RE,
      '$1[redacted]:[redacted]@',
    )
    .replace(
      BEARER_RE,
      'Bearer [redacted]',
    )
    .replace(
      SECRET_RE,
      '$1=[redacted]',
    )
    .slice(
      0,
      max,
    );
}


function toIso(
  value:
    unknown,
) {
  if (
    typeof value ===
      'number'
  ) {
    const date =
      new Date(
        value,
      );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  if (
    typeof value ===
      'string'
  ) {
    const numeric =
      Number(
        value,
      );

    const date =
      Number.isFinite(
        numeric,
      )
        ? new Date(
            numeric,
          )
        : new Date(
            value,
          );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  return null;
}


function config() {
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
  };
}


function authHeaders(
  token:
    string,
) {
  return {
    Authorization:
      `Bearer ${token}`,
    Accept:
      'application/json',
  };
}


function teamQuery(
  teamId:
    string,
) {
  return teamId
    ? `&teamId=${encodeURIComponent(
        teamId,
      )}`
    : '';
}


export async function getVercelOperationalSnapshot() {
  const cfg =
    config();

  if (
    !cfg.projectId ||
    !cfg.token
  ) {
    return {
      configured:
        false,
      projectId:
        cfg.projectId ||
        null,
      teamId:
        cfg.teamId ||
        null,
      deployments:
        [] as
          VercelDeployment[],
      runtimeEvents:
        [] as
          VercelRuntimeEvent[],
      error:
        !cfg.projectId
          ? 'Vercel project ID is unavailable.'
          : 'Set SAMI_VERCEL_API_TOKEN to read deployment/runtime logs inside Platform Admin.',
    };
  }

  const deploymentsUrl =
    new URL(
      'https://api.vercel.com/v7/deployments',
    );

  deploymentsUrl
    .searchParams
    .set(
      'projectId',
      cfg.projectId,
    );

  deploymentsUrl
    .searchParams
    .set(
      'limit',
      '10',
    );

  deploymentsUrl
    .searchParams
    .set(
      'target',
      'production',
    );

  if (
    cfg.teamId
  ) {
    deploymentsUrl
      .searchParams
      .set(
        'teamId',
        cfg.teamId,
      );
  }

  const deploymentResponse =
    await fetch(
      deploymentsUrl,
      {
        headers:
          authHeaders(
            cfg.token,
          ),
        cache:
          'no-store',
      },
    );

  if (
    !deploymentResponse.ok
  ) {
    return {
      configured:
        true,
      projectId:
        cfg.projectId,
      teamId:
        cfg.teamId ||
        null,
      deployments:
        [] as
          VercelDeployment[],
      runtimeEvents:
        [] as
          VercelRuntimeEvent[],
      error:
        `Vercel deployments API returned HTTP ${deploymentResponse.status}.`,
    };
  }

  const deploymentPayload =
    await deploymentResponse
      .json() as
        {
          deployments?:
            Array<
              Record<
                string,
                unknown
              >
            >;
        };

  const deployments:
    VercelDeployment[] =
    (
      deploymentPayload
        .deployments ||
      []
    )
      .slice(
        0,
        10,
      )
      .map(
        item => {
          const meta =
            item.meta &&
            typeof item.meta ===
              'object'
              ? item.meta as
                  Record<
                    string,
                    unknown
                  >
              : {};

          return {
            id:
              String(
                item.uid ||
                item.id ||
                '',
              ),
            url:
              redact(
                item.url,
                500,
              ),
            state:
              redact(
                item.state,
                80,
              ),
            target:
              redact(
                item.target,
                80,
              ),
            createdAt:
              toIso(
                item.created ||
                item.createdAt,
              ),
            commitRef:
              redact(
                meta.githubCommitRef,
                200,
              ),
            commitSha:
              redact(
                meta.githubCommitSha,
                100,
              ),
            commitMessage:
              redact(
                meta.githubCommitMessage,
                500,
              ),
          };
        },
      )
      .filter(
        deployment =>
          Boolean(
            deployment.id,
          ),
      );

  const latest =
    deployments[0];

  if (
    !latest
  ) {
    return {
      configured:
        true,
      projectId:
        cfg.projectId,
      teamId:
        cfg.teamId ||
        null,
      deployments,
      runtimeEvents:
        [] as
          VercelRuntimeEvent[],
      error:
        null,
    };
  }

  const eventsUrl =
    `https://api.vercel.com/v3/deployments/${encodeURIComponent(
      latest.id,
    )}/events?limit=100${teamQuery(
      cfg.teamId,
    )}`;

  let runtimeEvents:
    VercelRuntimeEvent[] =
    [];

  let runtimeError:
    string |
    null =
    null;

  try {
    const eventResponse =
      await fetch(
        eventsUrl,
        {
          headers:
            authHeaders(
              cfg.token,
            ),
          cache:
            'no-store',
        },
      );

    if (
      !eventResponse.ok
    ) {
      runtimeError =
        `Vercel runtime-events API returned HTTP ${eventResponse.status}.`;
    } else {
      const raw =
        await eventResponse
          .text();

      let events:
        Array<
          Record<
            string,
            unknown
          >
        > =
        [];

      try {
        const parsed =
          JSON.parse(
            raw,
          );

        events =
          Array.isArray(
            parsed,
          )
            ? parsed
            : [];
      } catch {
        events =
          raw
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
                  const parsed =
                    JSON.parse(
                      line,
                    );

                  return parsed &&
                    typeof parsed ===
                      'object'
                    ? [
                        parsed as
                          Record<
                            string,
                            unknown
                          >,
                      ]
                    : [];
                } catch {
                  return [];
                }
              },
            );
      }

      runtimeEvents =
        events
          .slice(
            -100,
          )
          .reverse()
          .map(
            item => ({
              type:
                redact(
                  item.type,
                  80,
                ),
              level:
                redact(
                  item.level,
                  80,
                ),
              text:
                redact(
                  item.text ||
                  item.message,
                ),
              createdAt:
                toIso(
                  item.created ||
                  item.timestamp,
                ),
              requestId:
                redact(
                  item.requestId ||
                  item.request_id,
                  255,
                ),
              route:
                redact(
                  item.route ||
                  item.path,
                  500,
                ),
              statusCode:
                typeof item.statusCode ===
                  'number'
                  ? item.statusCode
                  : typeof item.status ===
                      'number'
                    ? item.status
                    : null,
            })),
          )
          .filter(
            item =>
              Boolean(
                item.text ||
                item.type,
              ),
          );
    }
  } catch (
    error
  ) {
    runtimeError =
      error instanceof
        Error
        ? `Vercel runtime logs could not be loaded: ${error.message}`
        : 'Vercel runtime logs could not be loaded.';
  }

  return {
    configured:
      true,
    projectId:
      cfg.projectId,
    teamId:
      cfg.teamId ||
      null,
    deployments,
    runtimeEvents,
    error:
      runtimeError,
  };
}
