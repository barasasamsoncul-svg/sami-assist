import "dotenv/config";

import { Pool } from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { postgresAdmin } from "../../postgres-admin";

interface TenantDatabase {
    business_id: string;
    database_name: string;
    database_host: string;
    database_port: number;
    database_user: string;
    database_password_encrypted: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runInvoiceMigration() {
    console.log("==================================================");
    console.log("SaMi Assist - Invoice App Migration");
    console.log("==================================================");

    /*
     * Load migration SQL.
     *
     * The SQL file itself DOES NOT contain BEGIN/COMMIT.
     * The runner controls the transaction for each tenant.
     */
    const migrationPath = path.join(
        __dirname,
        "migrations",
        "001_initial_upgrade.sql"
    );

    console.log(`Migration file: ${migrationPath}`);

    const migrationSql = await fs.readFile(
        migrationPath,
        "utf8"
    );

    if (!migrationSql.trim()) {
        throw new Error(
            "Migration SQL file is empty."
        );
    }

    /*
     * Get all active tenant databases.
     */
    const result = await postgresAdmin.query(
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
        ORDER BY business_id
        `
    );

    const tenants: TenantDatabase[] = result.rows;

    if (tenants.length === 0) {
        console.log("No active tenants found.");
        return;
    }

    console.log(
        `Found ${tenants.length} active tenant(s).`
    );

    let successCount = 0;
    let failCount = 0;

    for (const tenant of tenants) {
        console.log("");
        console.log(
            "--------------------------------------------------"
        );
        console.log(
            `Migrating tenant: ${tenant.business_id}`
        );
        console.log(
            `Database: ${tenant.database_name}`
        );
        console.log(
            "--------------------------------------------------"
        );

        const pool = new Pool({
            host: tenant.database_host,
            port: tenant.database_port,
            user: tenant.database_user,
            password: tenant.database_password_encrypted,
            database: tenant.database_name,

            ssl: {
                rejectUnauthorized: false,
            },

            max: 2,

            idleTimeoutMillis: 30000,

            connectionTimeoutMillis: 10000,
        });

        let client;

        try {
            client = await pool.connect();

            console.log("  ✓ Database connection established.");

            /*
             * Check that PostgreSQL is reachable.
             */
            const versionResult = await client.query(
                "SELECT current_database() AS database_name"
            );

            console.log(
                `  ✓ Connected to: ${versionResult.rows[0].database_name}`
            );

            /*
             * Show whether this is an old or already partially
             * migrated tenant.
             *
             * We DO NOT skip based on invoice_settings.
             *
             * A tenant may have invoice_settings but still be
             * missing billing_address, tax_rate_id, etc.
             */
            const schemaCheck = await client.query(
                `
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'customers'
                    ) AS customers_exists,

                    EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'products'
                    ) AS products_exists,

                    EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'invoices'
                    ) AS invoices_exists,

                    EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'invoice_settings'
                    ) AS invoice_settings_exists
                `
            );

            const schema = schemaCheck.rows[0];

            console.log(
                `  Customers: ${schema.customers_exists ? "exists" : "missing"}`
            );

            console.log(
                `  Products: ${schema.products_exists ? "exists" : "missing"}`
            );

            console.log(
                `  Invoices: ${schema.invoices_exists ? "exists" : "missing"}`
            );

            console.log(
                `  Invoice settings: ${
                    schema.invoice_settings_exists
                        ? "exists"
                        : "missing"
                }`
            );

            /*
             * Start transaction.
             */
            await client.query("BEGIN");

            console.log("  → Running migration...");

            /*
             * Execute the complete migration.
             *
             * The migration itself is intentionally free of
             * BEGIN / COMMIT.
             */
            await client.query(migrationSql);

            /*
             * Verify the specific columns that previously caused
             * the API errors.
             */
            const verification = await client.query(
                `
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'customers'
                          AND column_name = 'billing_address'
                    ) AS billing_address_exists,

                    EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'products'
                          AND column_name = 'tax_rate_id'
                    ) AS product_tax_rate_id_exists
                `
            );

            const verified = verification.rows[0];

            if (!verified.billing_address_exists) {
                throw new Error(
                    "Verification failed: customers.billing_address is missing."
                );
            }

            if (!verified.product_tax_rate_id_exists) {
                throw new Error(
                    "Verification failed: products.tax_rate_id is missing."
                );
            }

            console.log(
                "  ✓ customers.billing_address verified."
            );

            console.log(
                "  ✓ products.tax_rate_id verified."
            );

            /*
             * Verify the important tables.
             */
            const tableVerification = await client.query(
                `
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN (
                      'customers',
                      'products',
                      'payment_terms',
                      'tax_rates',
                      'invoices',
                      'invoice_items',
                      'payments',
                      'invoice_templates',
                      'credit_notes',
                      'recurring_invoices',
                      'invoice_reminders',
                      'invoice_activity_log',
                      'invoice_settings'
                  )
                ORDER BY table_name
                `
            );

            console.log(
                `  ✓ Invoice schema tables present: ${tableVerification.rows.length}/13`
            );

            if (tableVerification.rows.length !== 13) {
                throw new Error(
                    `Schema verification failed. Expected 13 invoice tables, found ${tableVerification.rows.length}.`
                );
            }

            /*
             * Commit only after all verification succeeds.
             */
            await client.query("COMMIT");

            console.log(
                `  ✅ Tenant ${tenant.business_id} migrated successfully.`
            );

            successCount++;
        } catch (error) {
            /*
             * Roll back the tenant transaction.
             */
            if (client) {
                await client.query("ROLLBACK").catch(
                    () => {}
                );
            }

            console.error(
                `  ❌ Tenant ${tenant.business_id} migration failed.`
            );

            if (error instanceof Error) {
                console.error(
                    `     ${error.message}`
                );

                if (error.stack) {
                    console.error(error.stack);
                }
            } else {
                console.error(error);
            }

            failCount++;
        } finally {
            if (client) {
                client.release();
            }

            await pool.end();
        }
    }

    console.log("");
    console.log("==================================================");
    console.log("Migration complete");
    console.log("==================================================");
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed:     ${failCount}`);
    console.log(`  Total:      ${tenants.length}`);
    console.log("==================================================");

    if (failCount > 0) {
        throw new Error(
            `${failCount} tenant migration(s) failed.`
        );
    }
}


/*
 * Execute migration.
 */
runInvoiceMigration()
    .then(() => {
        console.log("Migration process finished.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("");
        console.error(
            "Migration process failed:"
        );
        console.error(error);

        process.exit(1);
    });