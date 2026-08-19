import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  created_at: string;
  updated_at: string;
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function generateWebhookSecret(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/webhooks
|--------------------------------------------------------------------------
|
| Returns all configured webhooks.
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(
      `
        SELECT
          metadata->'webhooks' AS webhooks
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `
    );

    const webhooks = result.rows[0]?.webhooks || [];

    return NextResponse.json({
      success: true,
      webhooks,
      count: webhooks.length,
    });
  } catch (error) {
    console.error("GET /api/invoices/webhooks:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch webhooks",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/webhooks
|--------------------------------------------------------------------------
|
| Creates a new webhook.
|
| Request body:
| {
|   url: string,
|   events: string[],
|   active?: boolean
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

    const { url, events, active } = body;

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "events must be a non-empty array" },
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

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get current settings
      const settingsResult = await client.query(
        `
          SELECT *
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `
      );

      let settings = settingsResult.rows[0];

      if (!settings) {
        // Create default settings if not exists
        const created = await client.query(
          `
            INSERT INTO public.invoice_settings (
              invoice_prefix,
              invoice_next_number,
              invoice_number_padding,
              invoice_number_format,
              default_currency,
              default_due_days,
              default_tax_calculation
            )
            VALUES (
              'INV-', 1, 6, '{prefix}{number}',
              'KES', 30, 'exclusive'
            )
            RETURNING *
          `
        );
        settings = created.rows[0];
      }

      const currentWebhooks = settings.metadata?.webhooks || [];

      // Create new webhook
      const newWebhook = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString(36).substring(2, 7),
        url,
        events,
        active: active !== undefined ? active : true,
        secret: generateWebhookSecret(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedWebhooks = [...currentWebhooks, newWebhook];

      // Update settings
      await client.query(
        `
          UPDATE public.invoice_settings
          SET
            metadata = metadata || $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          jsonValue({ webhooks: updatedWebhooks }, {}),
          settings.id,
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        webhook: newWebhook,
      }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/webhooks:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create webhook",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/webhooks
|--------------------------------------------------------------------------
|
| Updates a webhook.
|
| Request body:
| {
|   webhook_id: string,
|   url?: string,
|   events?: string[],
|   active?: boolean
| }
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest) {
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

    const { webhook_id, url, events, active } = body;

    if (!webhook_id) {
      return NextResponse.json(
        { error: "webhook_id is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const settingsResult = await client.query(
        `
          SELECT *
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `
      );

      let settings = settingsResult.rows[0];

      if (!settings) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Settings not found" },
          { status: 404 }
        );
      }

      const currentWebhooks = settings.metadata?.webhooks || [];

      let found = false;
      const updatedWebhooks = currentWebhooks.map((webhook: Webhook) => {
        if (webhook.id === webhook_id) {
          found = true;
          return {
            ...webhook,
            url: url || webhook.url,
            events: events || webhook.events,
            active: active !== undefined ? active : webhook.active,
            updated_at: new Date().toISOString(),
          };
        }
        return webhook;
      });

      if (!found) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Webhook not found" },
          { status: 404 }
        );
      }

      await client.query(
        `
          UPDATE public.invoice_settings
          SET
            metadata = metadata || $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          jsonValue({ webhooks: updatedWebhooks }, {}),
          settings.id,
        ]
      );

      await client.query("COMMIT");

      const updatedWebhook = updatedWebhooks.find((w: Webhook) => w.id === webhook_id);

      return NextResponse.json({
        success: true,
        webhook: updatedWebhook,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/webhooks:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update webhook",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/webhooks
|--------------------------------------------------------------------------
|
| Deletes a webhook.
|
| Query parameter: ?id=UUID
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);
    const webhookId = searchParams.get("id");

    if (!webhookId) {
      return NextResponse.json(
        { error: "Webhook ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const settingsResult = await client.query(
        `
          SELECT *
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `
      );

      let settings = settingsResult.rows[0];

      if (!settings) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Settings not found" },
          { status: 404 }
        );
      }

      const currentWebhooks = settings.metadata?.webhooks || [];
      const updatedWebhooks = currentWebhooks.filter((w: Webhook) => w.id !== webhookId);

      if (currentWebhooks.length === updatedWebhooks.length) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Webhook not found" },
          { status: 404 }
        );
      }

      await client.query(
        `
          UPDATE public.invoice_settings
          SET
            metadata = metadata || $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          jsonValue({ webhooks: updatedWebhooks }, {}),
          settings.id,
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Webhook deleted successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/webhooks:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete webhook",
      },
      { status: 500 }
    );
  }
}