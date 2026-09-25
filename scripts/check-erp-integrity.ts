import 'dotenv/config';

import { queryControl } from '../lib/db/control';
import { getTenantPoolByTenantId } from '../lib/db/tenant';

type Tenant = {
  tenant_id: string;
  tenant_name: string;
  database_name: string;
};

type Requirement = {
  table: string;
  columns: string[];
};

const REQUIREMENTS: Requirement[] = [
  { table: 'companies', columns: ['id', 'name'] },
  { table: 'company_users', columns: ['company_id'] },
  { table: 'audit_logs', columns: ['id'] },
  { table: 'accounts', columns: ['id', 'code', 'name', 'account_type'] },
  { table: 'journals', columns: ['id'] },
  { table: 'journal_lines', columns: ['id', 'journal_id', 'account_id', 'debit', 'credit'] },
  { table: 'customers', columns: ['id'] },
  { table: 'invoices', columns: ['id'] },
  { table: 'invoice_items', columns: ['id', 'invoice_id'] },
  { table: 'payments', columns: ['id'] },
  { table: 'products', columns: ['id', 'name', 'unit_price', 'cost_price'] },
  { table: 'warehouses', columns: ['id'] },
  { table: 'stock_levels', columns: ['id', 'product_id', 'warehouse_id', 'quantity'] },
  { table: 'stock_movements', columns: ['id', 'product_id'] },
  { table: 'automation_workflows', columns: ['id', 'company_id', 'latest_version', 'active_version'] },
  { table: 'automation_workflow_versions', columns: ['id', 'workflow_id', 'version'] },
  { table: 'automation_runs', columns: ['id', 'workflow_id', 'workflow_version_id', 'company_id', 'idempotency_key'] },
  { table: 'integration_connections', columns: ['id', 'company_id', 'provider_key', 'status'] },
  { table: 'integration_sync_jobs', columns: ['id'] },
  { table: 'integration_webhook_deliveries', columns: ['id'] },
  { table: 'ai_conversations', columns: ['id'] },
  { table: 'ai_messages', columns: ['id'] },
  { table: 'ai_memory', columns: ['id'] },
  { table: 'ai_actions', columns: ['id'] },
  { table: 'ai_runs', columns: ['id'] },
  { table: 'bi_reports', columns: ['id'] },
];

async function main() {
  const result = await queryControl(`
    SELECT t.id::text AS tenant_id,
           t.name::text AS tenant_name,
           td.database_name::text AS database_name
    FROM tenants t
    INNER JOIN tenant_databases td ON td.tenant_id = t.id
    WHERE t.deleted_at IS NULL
      AND td.purged_at IS NULL
      AND td.status = 'active'
    ORDER BY t.created_at, t.id
  `);

  const failures: Array<{ tenant: string; database: string; issues: string[] }> = [];

  for (const tenant of result.rows as Tenant[]) {
    const pool = await getTenantPoolByTenantId(tenant.tenant_id);
    try {
      const schema = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `);

      const columns = new Map<string, Set<string>>();
      for (const row of schema.rows) {
        const table = String(row.table_name);
        if (!columns.has(table)) columns.set(table, new Set());
        columns.get(table)!.add(String(row.column_name));
      }

      const issues: string[] = [];
      for (const requirement of REQUIREMENTS) {
        const actual = columns.get(requirement.table);
        if (!actual) {
          issues.push(`missing table: ${requirement.table}`);
          continue;
        }
        for (const column of requirement.columns) {
          if (!actual.has(column)) issues.push(`missing column: ${requirement.table}.${column}`);
        }
      }

      if (columns.has('journal_lines')) {
        const balance = await pool.query(`
          SELECT COALESCE(SUM(debit), 0) AS debit,
                 COALESCE(SUM(credit), 0) AS credit
          FROM journal_lines
        `);
        const debit = Number(balance.rows[0]?.debit ?? 0);
        const credit = Number(balance.rows[0]?.credit ?? 0);
        if (Math.abs(debit - credit) > 0.000001) {
          issues.push(`general ledger out of balance: debit=${debit} credit=${credit}`);
        }
      }

      if (columns.has('stock_levels')) {
        const negatives = await pool.query(`
          SELECT COUNT(*)::int AS count
          FROM stock_levels
          WHERE quantity < 0
        `);
        if (Number(negatives.rows[0]?.count ?? 0) > 0) {
          issues.push(`negative inventory quantities: ${negatives.rows[0].count}`);
        }
      }

      if (issues.length) failures.push({ tenant: tenant.tenant_name, database: tenant.database_name, issues });
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  console.log(JSON.stringify({
    tenantsChecked: result.rows.length,
    failures: failures.length,
    failuresDetail: failures,
  }, null, 2));

  process.exitCode = failures.length ? 1 : 0;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'ERP integrity check failed.');
  process.exitCode = 1;
});
