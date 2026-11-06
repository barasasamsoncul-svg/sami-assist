
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { databasePool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type ErrandStatusRow = {
  id: string;
  public_code: string;
  status: string;
};

function respond(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validErrandId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 128
  );
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  let user;

  try {
    user = await getCurrentUser(request);
  } catch {
    return respond(
      "Could not verify your account.",
      503,
    );
  }

  if (!user) {
    return respond(
      "Authentication is required.",
      401,
    );
  }

  if (user.role !== "customer") {
    return respond(
      "Customer access is required.",
      403,
    );
  }

  const params = await context.params;
  const id = params?.id;

  if (!validErrandId(id)) {
    return respond(
      "Invalid errand identifier.",
      400,
    );
  }

  let body: unknown = {};

  try {
    const rawBody = await request.text();

    if (rawBody.trim()) {
      body = JSON.parse(rawBody);
    }
  } catch {
    return respond(
      "Invalid cancellation request.",
      400,
    );
  }

  if (!isRecord(body)) {
    return respond(
      "Invalid cancellation request.",
      400,
    );
  }

  const suppliedReason = body.reason;

  if (
    suppliedReason !== undefined &&
    typeof suppliedReason !== "string"
  ) {
    return respond(
      "Invalid cancellation reason.",
      400,
    );
  }

  const reason =
    typeof suppliedReason === "string"
      ? suppliedReason.trim()
      : "";

  if (reason.length > 1000) {
    return respond(
      "The cancellation reason cannot exceed 1000 characters.",
      400,
    );
  }

  const cancellationReason =
    reason ||
    "Cancelled by customer before runner assignment.";

  let client;

  try {
    client = await databasePool().connect();
  } catch (cause) {
    console.error(
      "[Customer errand cancellation] Database connection failed.",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return respond(
      "Your errand could not be cancelled. Please try again.",
      503,
    );
  }

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query<ErrandStatusRow>(
      `SELECT
         id::text AS id,
         public_code,
         status
       FROM public.errands
       WHERE id::text = $1
         AND customer_id = $2
       FOR UPDATE`,
      [id.trim(), user.id],
    );

    const errand = result.rows[0];

    if (!errand) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return respond(
        "Errand not found.",
        404,
      );
    }

    /*
     * The Customer App may cancel only before assignment.
     *
     * Assigned errands require coordination with the separate
     * Runner system. This endpoint must not independently alter
     * Runner database records.
     */
    if (
      !["requested", "quoted"].includes(errand.status)
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return respond(
        "This errand can no longer be cancelled through this screen.",
        409,
      );
    }

    const updated = await client.query<{ id: string }>(
      `UPDATE public.errands
       SET
         status = 'cancelled',
         cancellation_reason = $3,
         version = version + 1,
         updated_at = now()
       WHERE id::text = $1
         AND customer_id = $2
         AND status IN ('requested', 'quoted')
       RETURNING id::text AS id`,
      [
        errand.id,
        user.id,
        cancellationReason,
      ],
    );

    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return respond(
        "The errand could not be cancelled because its status changed.",
        409,
      );
    }

    await client.query(
      `INSERT INTO public.errand_events (
         errand_id,
         actor_id,
         event_type,
         from_status,
         to_status,
         note,
         metadata
       )
       VALUES (
         $1,
         $2,
         'customer_cancelled',
         $3,
         'cancelled',
         $4,
         $5::jsonb
       )`,
      [
        errand.id,
        user.id,
        errand.status,
        cancellationReason,
        JSON.stringify({
          source: "customer_app",
          publicCode: errand.public_code,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        ok: true,
        message: "Your errand has been cancelled.",
        status: "cancelled",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );
    }

    console.error(
      "[Customer errand cancellation]",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return respond(
      "Your errand could not be cancelled. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
