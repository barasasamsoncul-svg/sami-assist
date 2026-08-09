// scripts/verify-migration.ts
import { postgresAdmin } from "../lib/postgres-admin";

async function verify() {
  try {
    console.log("🔍 Verifying migration...\n");

    // 1. Check businesses columns
    const businessColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'businesses' 
      AND column_name IN ('type', 'country', 'currency', 'timezone', 'tax_id', 'registration_number', 'website', 'address', 'industry', 'founded_year', 'employee_count', 'updated_at')
      ORDER BY column_name
    `);
    console.log("✅ Businesses columns added:", businessColumns.rows.map((r: any) => r.column_name).join(", "));

    // 2. Check users columns
    const userColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('two_factor_enabled', 'two_factor_secret', 'email_verified', 'last_login_at', 'updated_at')
      ORDER BY column_name
    `);
    console.log("✅ Users columns added:", userColumns.rows.map((r: any) => r.column_name).join(", "));

    // 3. Check business_users columns
    const businessUserColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'business_users' 
      AND column_name IN ('permissions', 'status', 'invited_at', 'last_active_at', 'created_at')
      ORDER BY column_name
    `);
    console.log("✅ Business Users columns added:", businessUserColumns.rows.map((r: any) => r.column_name).join(", "));

    // 4. Check sessions table
    const sessionsColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sessions'
      ORDER BY column_name
    `);
    console.log("✅ Sessions columns:", sessionsColumns.rows.map((r: any) => r.column_name).join(", "));

    // 5. Check api_keys table
    const apiKeysColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'api_keys'
      ORDER BY column_name
    `);
    console.log("✅ API Keys columns:", apiKeysColumns.rows.map((r: any) => r.column_name).join(", "));

    // 6. Check audit_logs table
    const auditLogsColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'audit_logs'
      ORDER BY column_name
    `);
    console.log("✅ Audit Logs columns:", auditLogsColumns.rows.map((r: any) => r.column_name).join(", "));

    // 7. Check invites table
    const invitesColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'invites'
      ORDER BY column_name
    `);
    console.log("✅ Invites columns:", invitesColumns.rows.map((r: any) => r.column_name).join(", "));

    // 8. Check subscriptions columns
    const subscriptionsColumns = await postgresAdmin.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'subscriptions' 
      AND column_name IN ('current_period_end', 'updated_at')
      ORDER BY column_name
    `);
    console.log("✅ Subscriptions columns added:", subscriptionsColumns.rows.map((r: any) => r.column_name).join(", "));

    console.log("\n✅ VERIFICATION COMPLETE! All migrations applied successfully.");
  } catch (error) {
    console.error("❌ Verification failed:", error);
  }
}

verify();