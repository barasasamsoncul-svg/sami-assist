
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type CustomerErrandStatus =
  | "requested"
  | "quoted"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "completion_submitted"
  | "completed"
  | "cancelled"
  | "disputed";

type CustomerErrandStage =
  | "finding_runner"
  | "runner_found"
  | "tracking"
  | "completion"
  | "closed";

type CustomerErrandRow = {
  id: string;
  public_code: string;
  title: string;
  category: string;
  description: string;
  status: string;
};

const STATUS_STAGES: Record<
  CustomerErrandStatus,
  CustomerErrandStage
> = {
  requested: "finding_runner",
  quoted: "finding_runner",
  assigned: "runner_found",
  accepted: "runner_found",
  in_progress: "tracking",
  completion_submitted: "completion",
  completed: "closed",
  cancelled: "closed",
  disputed: "closed",
};

const CANCELLABLE_STATUSES = new Set<string>([
  "requested",
  "quoted",
]);

const VALID_STATUSES = new Set<string>(
  Object.keys(STATUS_STAGES),
);

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

function validErrandId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 128
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return respond("Authentication is required.", 401);
    }

    if (user.role !== "customer") {
      return respond("Customer access is required.", 403);
    }

    const params = await context.params;
    const id = params?.id;

    if (!validErrandId(id)) {
      return respond("Invalid errand identifier.", 400);
    }

    const result = await query<CustomerErrandRow>(
      `SELECT
         id::text AS id,
         public_code,
         title,
         category,
         description,
         status
       FROM public.errands
       WHERE id::text = $1
         AND customer_id = $2
       LIMIT 1`,
      [id.trim(), user.id],
    );

    const errand = result.rows[0];

    if (!errand) {
      return respond("Errand not found.", 404);
    }

    const status = String(errand.status);

    if (!VALID_STATUSES.has(status)) {
      return respond(
        "The errand has an unsupported status.",
        409,
      );
    }

    const typedStatus = status as CustomerErrandStatus;
    const stage = STATUS_STAGES[typedStatus];

    /*
     * Runner assignment data is deliberately not queried from
     * the Runner database.
     *
     * Until a trusted integration event is received and saved
     * in the Customer-side projection, these permissions remain
     * denied and runner remains null.
     */
    const lifecycle = {
      errand: {
        id: errand.id,
        publicCode: errand.public_code,
        title: errand.title,
        category: errand.category,
        description: errand.description,
        status: typedStatus,
        stage,
      },

      runner: null,

      access: {
        canViewRunnerProfile: false,
        canMessage: false,
        canCall: false,
        canCancel: CANCELLABLE_STATUSES.has(typedStatus),
        runnerProfileVisibleUntil: null,
      },

      serverTime: new Date().toISOString(),
    };

    return NextResponse.json(
      { lifecycle },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[Customer errand lifecycle]",
      cause instanceof Error
        ? cause.message
        : "Unknown error",
    );

    return respond(
      "Could not retrieve the errand status.",
      503,
    );
  }
}
