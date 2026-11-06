import "server-only";

import { createHash } from "node:crypto";

import { query } from "@/lib/runner/db";
import { errorResponse } from "@/lib/runner/http";

export type RunnerAccount = {
  id: string;
  phone_e164: string;
  email: string | null;
  full_name: string | null;
  account_status: string;
  verification_status: string;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function authenticateRunner(request: Request): Promise<
  | { runner: RunnerAccount; response: null }
  | { runner: null; response: ReturnType<typeof errorResponse> }
> {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return {
      runner: null,
      response: errorResponse(
        "This endpoint is available through the SaMi Runner app.",
        403,
      ),
    };
  }

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{40,128})$/i.exec(authorization);

  if (!match) {
    return {
      runner: null,
      response: errorResponse("Sign in to continue.", 401),
    };
  }

  const digest = tokenHash(match[1]);
  const result = await query<RunnerAccount>(
    `SELECT
       a.id,
       a.phone_e164,
       a.email,
       a.full_name,
       a.account_status,
       a.verification_status
     FROM public.runner_sessions AS s
     JOIN public.runner_accounts AS a ON a.id = s.runner_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND a.account_status NOT IN ('suspended', 'closed')
     LIMIT 1`,
    [digest],
  );

  const runner = result.rows[0];

  if (!runner) {
    return {
      runner: null,
      response: errorResponse("Your Runner session has expired. Sign in again.", 401),
    };
  }

  await query(
    "UPDATE public.runner_sessions SET last_seen_at = now() WHERE token_hash = $1",
    [digest],
  );

  return { runner, response: null };
}