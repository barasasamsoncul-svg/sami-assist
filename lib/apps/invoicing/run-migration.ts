import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { Pool } from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { postgresAdmin } from "../../postgres-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TenantDatabase {
    business_id: string;
    database_name: string;
    database_host: string;
    database_port: number;
    database_user: string;
    database_password_encrypted: string;
}

export async function runInvoiceMigration() {
    console.log("Starting Invoice app migration...");

    const result = await postgresAdmin.query(
        `SELECT 
            business_id,
            database_name,
            database_host,
            database_port,
            database_user,
            database_password_encrypted
        FROM database_registry 
        WHERE status = 'active'`
    );

    const tenants: TenantDatabase[] = result.rows;

    if (tenants.length === 0) {
        console.log("No active tenants found.");
        return;
    }

    console.log(`Found ${tenants.length} tenants to migrate.`);

    const migrationPath = path.join(
        __dirname,
        "migrations",
        "001_initial_upgrade.sql"
    );
    const migrationSql = await fs.readFile(migrationPath, "utf8");

    let successCount = 0;
    let failCount = 0;

    for (const tenant of tenants) {
        console.log(`Migrating tenant: ${tenant.business_id} (${tenant.database_name})...`);

        const pool = new Pool({
            host: tenant.database_host,
            port: tenant.database_port,
            user: tenant.database_user,
            password: tenant.database_password_encrypted,
            database: tenant.database_name,
            ssl: { rejectUnauthorized: false },
            max: 2,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });

        try {
            const checkResult = await pool.query(
                `SELECT EXISTS (
                    SELECT 1 
                    FROM information_schema.tables 
                    WHERE table_name = 'invoice_settings'
                )`
            );

            if (checkResult.rows[0].exists) {
                console.log(`  ⏭️  Tenant ${tenant.business_id} already migrated, skipping.`);
                successCount++;
                continue;
            }

            await pool.query("BEGIN");
            await pool.query(migrationSql);
            await pool.query("COMMIT");

            console.log(`  ✅ Tenant ${tenant.business_id} migrated successfully.`);
            successCount++;
        } catch (error) {
            await pool.query("ROLLBACK").catch(() => {});
            console.error(`  ❌ Tenant ${tenant.business_id} migration failed:`, error);
            failCount++;
        } finally {
            await pool.end();
        }
    }

    console.log(`\nMigration complete!`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
}
runInvoiceMigration()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Migration failed:", error);
        process.exit(1);
    });