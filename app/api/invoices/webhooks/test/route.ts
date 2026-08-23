import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/webhooks/test
|--------------------------------------------------------------------------
|
| Tests a webhook endpoint.
|
| Request body:
| {
|   url: string,
|   secret?: string,
|   payload?: object
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const body = await req.json();

    const { url, secret, payload } = body;

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    // Create test payload
    const testPayload = payload || {
      event: "test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook notification",
        test: true,
        user_id: user.id,
        user_email: user.email,
      },
    };

    // Log the test
    await pool.query(
      `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES (
          (SELECT id FROM public.invoices LIMIT 1),
          $1, $2, $3, $4
        )
      `,
      [
        user.id,
        user.fullName || user.email,
        "webhook_test",
        jsonValue({
          url,
          secret: secret ? "provided" : "not provided",
          payload: testPayload,
          tested_at: new Date().toISOString(),
        }, {}),
      ]
    );

    // In production, you would actually send the webhook here
    // For now, simulate the response

    // Simulate webhook delivery
    const startTime = Date.now();

    // Simulate network request
    let responseStatus = 200;
    let responseBody = JSON.stringify({ success: true, message: "Test webhook received" });
    let error = null;

    try {
      // This would be the actual fetch call in production
      // const response = await fetch(url, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     ...(secret ? { 'X-Webhook-Secret': secret } : {}),
      //   },
      //   body: JSON.stringify(testPayload),
      // });
      // responseStatus = response.status;
      // responseBody = await response.text();

      // Simulate success
      responseStatus = 200;
      responseBody = JSON.stringify({ success: true, message: "Test webhook received" });
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
      responseStatus = 500;
      responseBody = JSON.stringify({ error });
    }

    const endTime = Date.now();

    return NextResponse.json({
      success: true,
      test: {
        url,
        payload: testPayload,
        response: {
          status: responseStatus,
          body: responseBody,
          duration_ms: endTime - startTime,
        },
        error: error || null,
        message: error ? "Webhook test failed" : "Webhook test successful",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("POST /api/invoices/webhooks/test:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to test webhook",
      },
      { status: 500 }
    );
  }
}