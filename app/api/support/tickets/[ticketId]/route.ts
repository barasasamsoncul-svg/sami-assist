
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    ticketId: string;
  }>;
};

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

/**
 * GET /api/support/tickets/[ticketId]
 *
 * Customer:
 *   Can view only their own ticket and customer-visible messages.
 *
 * Administrator:
 *   Can view any ticket, including internal support notes.
 */
export async function GET(
  request: Request,
  context: RouteContext,
) {
  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to view this support request.", 401);
  }

  if (user.role === "customer" && !isNativeClient(request)) {
    return error(
      "Customer support requests must use the SaMi mobile app.",
      403,
    );
  }

  if (user.role !== "customer" && user.role !== "admin") {
    return error("You do not have access to this support request.", 403);
  }

  const { ticketId } = await context.params;

  if (!isUuid(ticketId)) {
    return error("Invalid support ticket reference.");
  }

  try {
    let ticketResult;

    if (user.role === "admin") {
      ticketResult = await query(
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
           customer.phone AS customer_phone,
           e.public_code AS errand_public_code,
           e.title AS errand_title
         FROM public.support_tickets AS t
         JOIN public.users AS customer
           ON customer.id = t.customer_id
         LEFT JOIN public.errands AS e
           ON e.id = t.related_errand_id
         WHERE t.id = $1
         LIMIT 1`,
        [ticketId],
      );
    } else {
      ticketResult = await query(
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
           e.public_code AS errand_public_code,
           e.title AS errand_title
         FROM public.support_tickets AS t
         LEFT JOIN public.errands AS e
           ON e.id = t.related_errand_id
         WHERE t.id = $1
           AND t.customer_id = $2
         LIMIT 1`,
        [ticketId, user.id],
      );
    }

    const ticket = ticketResult.rows[0];

    if (!ticket) {
      return error("Support request not found.", 404);
    }

    const messagesResult =
      user.role === "admin"
        ? await query(
            `SELECT
               m.id,
               m.ticket_id,
               m.sender_id,
               m.sender_role,
               CASE
                 WHEN m.sender_role = 'admin' THEN 'SaMi Support'
                 ELSE COALESCE(sender.full_name, 'Customer')
               END AS sender_name,
               m.message,
               m.is_internal,
               m.created_at
             FROM public.support_ticket_messages AS m
             LEFT JOIN public.users AS sender
               ON sender.id = m.sender_id
             WHERE m.ticket_id = $1
             ORDER BY m.created_at ASC, m.id ASC`,
            [ticketId],
          )
        : await query(
            `SELECT
               m.id,
               m.ticket_id,
               m.sender_role,
               CASE
                 WHEN m.sender_role = 'admin' THEN 'SaMi Support'
                 ELSE 'You'
               END AS sender_name,
               m.message,
               m.created_at
             FROM public.support_ticket_messages AS m
             WHERE m.ticket_id = $1
               AND m.is_internal = false
             ORDER BY m.created_at ASC, m.id ASC`,
            [ticketId],
          );

    return NextResponse.json(
      {
        ticket,
        messages: messagesResult.rows,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi support] Unable to retrieve support ticket.",
      cause instanceof Error ? cause.message : "Unknown error",
    );

    return error(
      "This support conversation is temporarily unavailable.",
      503,
    );
  }
}
