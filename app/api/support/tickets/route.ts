
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { databasePool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "errand",
  "payment",
  "account",
  "technical",
  "other",
] as const;

const STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;

type SupportCategory = (typeof CATEGORIES)[number];

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

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function createPublicCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomBytes(3).toString("hex").toUpperCase();

  return `SUP-${date}-${suffix}`;
}

/**
 * GET /api/support/tickets
 *
 * Customers:
 *   Returns their own support tickets through the native app.
 *
 * Administrators:
 *   Returns the support queue through the authenticated website.
 *
 * Optional administrator query parameters:
 *   ?status=open
 *   ?category=payment
 */
export async function GET(request: Request) {
  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to view support requests.", 401);
  }

  if (user.role === "customer" && !isNativeClient(request)) {
    return error("Customer support requests must use the SaMi mobile app.", 403);
  }

  if (user.role !== "customer" && user.role !== "admin") {
    return error("You do not have access to support requests.", 403);
  }

  const params = new URL(request.url).searchParams;
  const requestedStatus = cleanText(params.get("status"), 30);
  const requestedCategory = cleanText(params.get("category"), 30);

  if (
    requestedStatus &&
    !STATUSES.includes(requestedStatus as (typeof STATUSES)[number])
  ) {
    return error("Invalid support ticket status.");
  }

  if (
    requestedCategory &&
    !CATEGORIES.includes(requestedCategory as SupportCategory)
  ) {
    return error("Invalid support ticket category.");
  }

  const limitValue = Number(params.get("limit") || 50);
  const limit =
    Number.isInteger(limitValue) && limitValue >= 1
      ? Math.min(limitValue, 100)
      : 50;

  try {
    let result;

    if (user.role === "admin") {
      result = await query(
        `SELECT
           t.id,
           t.public_code,
           t.customer_id,
           t.related_errand_id,
           t.category,
           t.subject,
           t.status,
           t.created_at,
           t.updated_at,
           t.resolved_at,
           customer.full_name AS customer_name,
           customer.email AS customer_email,
           latest.message AS latest_message,
           latest.created_at AS latest_message_at
         FROM public.support_tickets AS t
         JOIN public.users AS customer
           ON customer.id = t.customer_id
         LEFT JOIN LATERAL (
           SELECT message, created_at
           FROM public.support_ticket_messages
           WHERE ticket_id = t.id
             AND is_internal = false
           ORDER BY created_at DESC, id DESC
           LIMIT 1
         ) AS latest ON true
         WHERE ($1 = '' OR t.status = $1)
           AND ($2 = '' OR t.category = $2)
         ORDER BY
           CASE t.status
             WHEN 'open' THEN 0
             WHEN 'in_progress' THEN 1
             WHEN 'waiting_customer' THEN 2
             WHEN 'resolved' THEN 3
             ELSE 4
           END,
           t.updated_at DESC
         LIMIT $3`,
        [requestedStatus, requestedCategory, limit],
      );
    } else {
      result = await query(
        `SELECT
           t.id,
           t.public_code,
           t.related_errand_id,
           t.category,
           t.subject,
           t.status,
           t.created_at,
           t.updated_at,
           t.resolved_at,
           latest.message AS latest_message,
           latest.created_at AS latest_message_at
         FROM public.support_tickets AS t
         LEFT JOIN LATERAL (
           SELECT message, created_at
           FROM public.support_ticket_messages
           WHERE ticket_id = t.id
             AND is_internal = false
           ORDER BY created_at DESC, id DESC
           LIMIT 1
         ) AS latest ON true
         WHERE t.customer_id = $1
         ORDER BY t.updated_at DESC
         LIMIT $2`,
        [user.id, limit],
      );
    }

    return NextResponse.json(
      { tickets: result.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error(
      "[SaMi support] Unable to retrieve support tickets.",
      cause instanceof Error ? cause.message : "Unknown error",
    );

    return error("Support requests are temporarily unavailable.", 503);
  }
}

/**
 * POST /api/support/tickets
 *
 * Creates a customer support ticket and its first message.
 *
 * Request body:
 * {
 *   "category": "errand",
 *   "subject": "Issue with my errand",
 *   "message": "Describe the problem here.",
 *   "relatedErrandId": "optional-errand-uuid"
 * }
 */
export async function POST(request: Request) {
  if (!isNativeClient(request)) {
    return error("Support requests must be submitted through the SaMi mobile app.", 403);
  }

  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to submit a support request.", 401);
  }

  if (user.role !== "customer") {
    return error("Only customer accounts can submit support requests.", 403);
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return error("Invalid support request.");
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return error("The support request body is invalid.");
  }

  const category = cleanText(body.category, 30);
  const subject = cleanText(body.subject, 160);
  const message = cleanText(body.message, 4000);
  const relatedErrandId = cleanText(body.relatedErrandId, 36);

  if (!CATEGORIES.includes(category as SupportCategory)) {
    return error("Select a valid support category.");
  }

  if (subject.length < 5) {
    return error("The subject must contain at least 5 characters.");
  }

  if (!message) {
    return error("Enter a message describing the issue.");
  }

  if (message.length > 4000) {
    return error("The message cannot exceed 4,000 characters.");
  }

  if (relatedErrandId && !isUuid(relatedErrandId)) {
    return error("The related errand reference is invalid.");
  }

  try {
    if (relatedErrandId) {
      const errand = await query(
        `SELECT id
         FROM public.errands
         WHERE id = $1
           AND customer_id = $2
         LIMIT 1`,
        [relatedErrandId, user.id],
      );

      if (!errand.rows[0]) {
        return error("The selected errand could not be found in your account.", 404);
      }
    }

    const client = await databasePool().connect();

    try {
      await client.query("BEGIN");

      const publicCode = createPublicCode();

      const ticketResult = await client.query(
        `INSERT INTO public.support_tickets (
           public_code,
           customer_id,
           related_errand_id,
           category,
           subject
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING
           id,
           public_code,
           related_errand_id,
           category,
           subject,
           status,
           created_at,
           updated_at`,
        [
          publicCode,
          user.id,
          relatedErrandId || null,
          category,
          subject,
        ],
      );

      const ticket = ticketResult.rows[0];

      const messageResult = await client.query(
        `INSERT INTO public.support_ticket_messages (
           ticket_id,
           sender_id,
           sender_role,
           message,
           is_internal
         )
         VALUES ($1, $2, 'customer', $3, false)
         RETURNING
           id,
           ticket_id,
           sender_role,
           message,
           created_at`,
        [ticket.id, user.id, message],
      );

      await client.query(
        `UPDATE public.support_tickets
         SET updated_at = now()
         WHERE id = $1`,
        [ticket.id],
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          message: "Your support request has been submitted.",
          ticket,
          firstMessage: messageResult.rows[0],
        },
        {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw cause;
    } finally {
      client.release();
    }
  } catch (cause) {
    console.error(
      "[SaMi support] Unable to create a support ticket.",
      cause instanceof Error ? cause.message : "Unknown error",
    );

    return error("Your support request could not be submitted. Please try again.", 503);
  }
}
