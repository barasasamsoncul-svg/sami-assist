
import { NextResponse } from "next/server";
import { databasePool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    ticketId: string;
  }>;
};

const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;

type TicketStatus = (typeof TICKET_STATUSES)[number];

function error(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isNativeClient(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

/**
 * POST /api/support/tickets/[ticketId]/messages
 *
 * Customer:
 *   - Sends a message to the support team.
 *   - Can only reply to their own tickets.
 *   - Cannot create internal notes or change ticket status.
 *   - Reopens a resolved or closed ticket by replying.
 *
 * Administrator:
 *   - Sends a public reply to the customer.
 *   - Can add private internal notes.
 *   - Can optionally update the ticket status.
 *
 * Request body:
 * {
 *   "message": "I need help with this issue."
 * }
 *
 * Administrator options:
 * {
 *   "message": "We are investigating this issue.",
 *   "isInternal": false,
 *   "status": "waiting_customer"
 * }
 */
export async function POST(
  request: Request,
  context: RouteContext,
) {
  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to continue this support conversation.", 401);
  }

  if (user.role === "customer" && !isNativeClient(request)) {
    return error(
      "Customer support messages must use the SaMi mobile app.",
      403,
    );
  }

  if (user.role !== "customer" && user.role !== "admin") {
    return error(
      "You do not have permission to reply to support requests.",
      403,
    );
  }

  const { ticketId } = await context.params;

  if (!isUuid(ticketId)) {
    return error("Invalid support ticket reference.");
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return error("Invalid support message.");
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return error("The support message body is invalid.");
  }

  const message = cleanText(body.message, 4000);

  if (!message) {
    return error("Enter a message before submitting.");
  }

  if (typeof body.message === "string" && body.message.trim().length > 4000) {
    return error("Messages cannot exceed 4,000 characters.");
  }

  if (
    body.isInternal !== undefined &&
    typeof body.isInternal !== "boolean"
  ) {
    return error("Invalid internal-note setting.");
  }

  if (
    body.isInternal !== undefined &&
    user.role !== "admin"
  ) {
    return error(
      "Only administrators can create internal support notes.",
      403,
    );
  }

  const isInternal =
    user.role === "admin" && body.isInternal === true;

  let requestedStatus: TicketStatus | null = null;

  if (body.status !== undefined) {
    if (user.role !== "admin") {
      return error(
        "Only administrators can change support ticket status.",
        403,
      );
    }

    const status = cleanText(body.status, 30);

    if (
      !TICKET_STATUSES.includes(status as TicketStatus)
    ) {
      return error("Invalid support ticket status.");
    }

    requestedStatus = status as TicketStatus;
  }

  const senderRole = user.role;

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    const ticketResult = await client.query(
      `SELECT
         id,
         public_code,
         customer_id,
         subject,
         status
       FROM public.support_tickets
       WHERE id = $1
         AND ($2 = 'admin' OR customer_id = $3)
       FOR UPDATE`,
      [ticketId, user.role, user.id],
    );

    const ticket = ticketResult.rows[0];

    if (!ticket) {
      await client.query("ROLLBACK");

      return error("Support request not found.", 404);
    }

    let nextStatus: TicketStatus = ticket.status;

    if (user.role === "customer") {
      // A customer reply means the support team needs to respond.
      nextStatus = "in_progress";
    } else if (requestedStatus) {
      nextStatus = requestedStatus;
    } else if (!isInternal) {
      // A public administrator reply normally awaits the customer.
      nextStatus = "waiting_customer";
    }

    const messageResult = await client.query(
      `INSERT INTO public.support_ticket_messages (
         ticket_id,
         sender_id,
         sender_role,
         message,
         is_internal
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         ticket_id,
         sender_role,
         message,
         is_internal,
         created_at`,
      [
        ticketId,
        user.id,
        senderRole,
        message,
        isInternal,
      ],
    );

    const updatedTicketResult = await client.query(
      `UPDATE public.support_tickets
       SET
         status = $2,
         updated_at = now(),
         resolved_at = CASE
           WHEN $2 = 'resolved' THEN COALESCE(resolved_at, now())
           ELSE NULL
         END
       WHERE id = $1
       RETURNING
         id,
         public_code,
         category,
         subject,
         status,
         created_at,
         updated_at,
         resolved_at`,
      [ticketId, nextStatus],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        message: isInternal
          ? "Internal support note saved."
          : "Support message sent.",
        ticket: updatedTicketResult.rows[0],
        sentMessage: messageResult.rows[0],
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "[SaMi support] Unable to send support message.",
      cause instanceof Error ? cause.message : "Unknown error",
    );

    return error(
      "Your support message could not be sent. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
