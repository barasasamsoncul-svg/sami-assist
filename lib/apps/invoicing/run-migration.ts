import { Client } from "pg";
import { postgresAdmin } from "@/lib/postgres-admin";

type TenantDatabase = {
  business_id: string;
  database_name: string;
  database_host: string;
  database_port: number;
  database_user: string;
  database_password_encrypted: string;
};

async function getActiveTenants(): Promise<TenantDatabase[]> {
  const result = await postgresAdmin.query<TenantDatabase>(
    `
      SELECT
        business_id,
        database_name,
        database_host,
        database_port,
        database_user,
        database_password_encrypted
      FROM database_registry
      WHERE status = 'active'
      ORDER BY created_at ASC
    `
  );

  return result.rows;
}

async function migrateTenant(
  tenant: TenantDatabase
): Promise<void> {
  const client = new Client({
    host: tenant.database_host,
    port: Number(tenant.database_port),
    user: tenant.database_user,
    password: tenant.database_password_encrypted,
    database: tenant.database_name,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    /*
     * Invoice migration.
     *
     * Keep invoice-specific schema changes here so every
     * active tenant receives the same invoicing database structure.
     */

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(100) NOT NULL,
        customer_id UUID,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
        due_date DATE,
        currency VARCHAR(10) NOT NULL DEFAULT 'KES',
        subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
        tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        discount_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
        amount_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
        notes TEXT,
        terms TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL
          REFERENCES invoices(id)
          ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity NUMERIC(14, 3) NOT NULL DEFAULT 1,
        unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(7, 2) NOT NULL DEFAULT 0,
        discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
        line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
      ON invoice_items(invoice_id)
    `);

    console.log(
      `✓ Migrated tenant database: ${tenant.database_name}`
    );
  } finally {
    await client.end();
  }
}

export async function runInvoiceMigrations(): Promise<{
  total: number;
  migrated: number;
  failed: number;
}> {
  const tenants = await getActiveTenants();

  if (tenants.length === 0) {
    console.log("No active tenants found.");

    return {
      total: 0,
      migrated: 0,
      failed: 0,
    };
  }

  let migrated = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      await migrateTenant(tenant);
      migrated += 1;
    } catch (error) {
      failed += 1;

      console.error(
        `✗ Failed to migrate tenant ${tenant.database_name}:`,
        error
      );
    }
  }

  return {
    total: tenants.length,
    migrated,
    failed,
  };
}