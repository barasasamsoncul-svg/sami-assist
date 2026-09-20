import dotenv from 'dotenv';
import crypto from 'node:crypto';
import process from 'node:process';
import { Client, Pool } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

type TenantCandidate = {
  tenant_id: string;
  tenant_name: string;
  database_name: string;
  database_host: string | null;
  database_port: number | null;
  database_status: string;
};

function useSsl(host: string): boolean {
  const explicit = process.env.POSTGRES_SSL?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;

  const normalized = host.trim().toLowerCase();

  return (
    normalized.includes('neon.tech') ||
    normalized.includes('neon.build') ||
    normalized.includes('amazonaws.com') ||
    normalized.includes('render.com') ||
    normalized.includes('railway.app')
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

const host = requireEnv('POSTGRES_HOST');
const user = requireEnv('POSTGRES_ADMIN_USER');
const password = requireEnv('POSTGRES_ADMIN_PASSWORD');
const port = Number.parseInt(process.env.POSTGRES_PORT || '5432', 10);
const ssl = useSsl(host) ? { rejectUnauthorized: false } : undefined;

const control = new Pool({
  host,
  port,
  user,
  password,
  database: process.env.POSTGRES_DB || 'sami_control',
  ssl,
  max: 3,
});

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find(value => value.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length).trim() || null;
  }

  const index = process.argv.indexOf(`--${name}`);

  if (index >= 0) {
    return process.argv[index + 1]?.trim() || null;
  }

  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function getCandidates(): Promise<TenantCandidate[]> {
  const result = await control.query<TenantCandidate>(
    `
      SELECT
        t.id::text AS tenant_id,
        t.name::text AS tenant_name,
        td.database_name::text AS database_name,
        td.database_host::text AS database_host,
        td.database_port,
        td.status::text AS database_status
      FROM tenants t
      INNER JOIN tenant_databases td
        ON td.tenant_id = t.id
      WHERE t.deleted_at IS NULL
        AND td.purged_at IS NULL
        AND td.status = 'active'
      ORDER BY t.created_at ASC, t.id ASC
    `,
  );

  return result.rows;
}

async function ensureRecoveryTables(): Promise<void> {
  const result = await control.query(
    `
      SELECT
        to_regclass('public.tenant_database_recovery_points') AS recovery_points
    `,
  );

  if (!result.rows[0]?.recovery_points) {
    throw new Error(
      'tenant_database_recovery_points is missing from the control database. Do not run a recovery drill until the Category 6 control schema is installed.',
    );
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function createDatabaseClient(
  database: string,
  candidate: TenantCandidate,
): Promise<Client> {
  const client = new Client({
    host: candidate.database_host || host,
    port: Number(candidate.database_port || port),
    user,
    password,
    database,
    ssl,
  });

  await client.connect();
  return client;
}

async function schemaFingerprint(
  database: string,
  candidate: TenantCandidate,
): Promise<string> {
  const client = await createDatabaseClient(database, candidate);

  try {
    const result = await client.query(
      `
        SELECT
          table_schema,
          table_name,
          ordinal_position,
          column_name,
          data_type,
          udt_name,
          is_nullable,
          COALESCE(column_default, '') AS column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY
          table_schema,
          table_name,
          ordinal_position
      `,
    );

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(result.rows))
      .digest('hex');
  } finally {
    await client.end();
  }
}

async function tableCounts(
  database: string,
  candidate: TenantCandidate,
): Promise<Map<string, number>> {
  const client = await createDatabaseClient(database, candidate);

  try {
    const tableResult = await client.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
    );

    const counts = new Map<string, number>();

    for (const row of tableResult.rows) {
      const table = row.table_name;

      if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(table)) {
        throw new Error(`Unsafe table identifier returned by PostgreSQL: ${table}`);
      }

      const countResult = await client.query(
        `SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`,
      );

      counts.set(table, Number(countResult.rows[0]?.count || 0));
    }

    return counts;
  } finally {
    await client.end();
  }
}

async function dropTemporaryDatabase(databaseName: string): Promise<void> {
  const client = new Client({
    host,
    port,
    user,
    password,
    database: process.env.POSTGRES_ADMIN_DATABASE || 'postgres',
    ssl,
  });

  await client.connect();

  try {
    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
    );
  } finally {
    await client.end();
  }
}

function printCandidates(candidates: TenantCandidate[]): void {
  console.log('\nEligible SaMi tenant databases\n');

  if (candidates.length === 0) {
    console.log('No active tenant databases were found.');
    return;
  }

  for (const candidate of candidates) {
    console.log(
      `- ${candidate.tenant_name} | tenant ${candidate.tenant_id} | database ${candidate.database_name}`,
    );
  }

  console.log(
    '\nRun: npm run drill:backup -- --tenant <tenant-id>',
  );
}

async function main(): Promise<void> {
  await ensureRecoveryTables();

  const candidates = await getCandidates();
  const requestedTenantId = argValue('tenant');

  if (hasFlag('list') || !requestedTenantId) {
    printCandidates(candidates);
    return;
  }

  const candidate = candidates.find(
    item => item.tenant_id === requestedTenantId,
  );

  if (!candidate) {
    printCandidates(candidates);
    throw new Error(
      'The requested tenant is not an eligible active tenant database.',
    );
  }

  const targetDatabaseName =
    `sami_restore_drill_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  console.log('\nSaMi tenant backup/recovery drill\n');
  console.log(`Workspace: ${candidate.tenant_name}`);
  console.log(`Source DB: ${candidate.database_name}`);
  console.log(`Temporary restore DB: ${targetDatabaseName}`);
  console.log('Active tenant database will not be modified.\n');

  const {
    createTenantRecoveryPoint,
    verifyTenantRecoveryPoint,
    restoreTenantRecoveryPoint,
    deleteTenantRecoveryPoint,
  } = await import('../lib/services/tenant-recovery');

  let recoveryPointId: string | null = null;
  let temporaryDatabaseCreated = false;

  try {
    console.log('1/6  Capturing source schema fingerprint and table counts...');
    const sourceSchemaHash = await schemaFingerprint(
      candidate.database_name,
      candidate,
    );
    const sourceCounts = await tableCounts(
      candidate.database_name,
      candidate,
    );

    console.log('2/6  Creating logical recovery point in R2...');
    const recoveryPoint = await createTenantRecoveryPoint({
      tenantId: candidate.tenant_id,
      recoveryType: 'logical_export',
      reason: 'SaMi Category 6 operational recovery drill',
    });

    recoveryPointId = recoveryPoint.id;

    if (recoveryPoint.status !== 'available') {
      throw new Error(
        `Recovery point was created with status "${recoveryPoint.status}" instead of "available".`,
      );
    }

    console.log(`      Recovery point: ${recoveryPoint.id}`);

    console.log('3/6  Verifying R2 recovery object...');
    const verified = await verifyTenantRecoveryPoint(recoveryPoint.id);

    if (verified.status !== 'available') {
      throw new Error(
        `R2 recovery point verification returned status "${verified.status}".`,
      );
    }

    console.log('4/6  Restoring into a fresh temporary database...');
    const restored = await restoreTenantRecoveryPoint({
      recoveryPointId: recoveryPoint.id,
      targetDatabaseName,
    });

    if (!restored.restored) {
      throw new Error('Provider did not confirm the restore.');
    }

    temporaryDatabaseCreated = true;

    console.log('5/6  Comparing restored schema and table counts...');
    const restoredSchemaHash = await schemaFingerprint(
      targetDatabaseName,
      candidate,
    );
    const restoredCounts = await tableCounts(
      targetDatabaseName,
      candidate,
    );

    if (sourceSchemaHash !== restoredSchemaHash) {
      throw new Error(
        'Restored schema fingerprint does not match the source tenant database.',
      );
    }

    const sourceTables = [...sourceCounts.keys()];
    const restoredTables = [...restoredCounts.keys()];

    if (JSON.stringify(sourceTables) !== JSON.stringify(restoredTables)) {
      throw new Error(
        'Restored table set does not match the source tenant database.',
      );
    }

    const countDifferences = sourceTables
      .map(table => ({
        table,
        source: sourceCounts.get(table) || 0,
        restored: restoredCounts.get(table) || 0,
      }))
      .filter(item => item.source !== item.restored);

    if (countDifferences.length > 0) {
      console.error('\nTable count differences:');
      for (const difference of countDifferences) {
        console.error(
          `- ${difference.table}: source=${difference.source}, restored=${difference.restored}`,
        );
      }

      throw new Error(
        'One or more restored table counts do not match the source database. If the source tenant was receiving live writes during the drill, rerun against an idle test workspace.',
      );
    }

    console.log(
      `      Schema verified; ${sourceTables.length} public tables match.`,
    );

    console.log('6/6  Cleaning up temporary restore database...');
    await dropTemporaryDatabase(targetDatabaseName);
    temporaryDatabaseCreated = false;

    if (hasFlag('delete-backup')) {
      await deleteTenantRecoveryPoint(recoveryPoint.id);
      recoveryPointId = null;
      console.log('      Drill recovery object deleted by request.');
    } else {
      console.log(
        '      Recovery point retained in R2. Use --delete-backup on a future drill if you want drill backups removed automatically.',
      );
    }

    console.log('\nPASS  SaMi Category 6 tenant backup/recovery drill completed successfully.');
    console.log('PASS  Active tenant database was not overwritten.');
    console.log('PASS  R2 recovery object was created and verified.');
    console.log('PASS  Fresh-database restore completed.');
    console.log('PASS  Restored schema and table counts matched the source.');
  } catch (error) {
    console.error('\nFAIL  SaMi Category 6 recovery drill failed.');

    if (recoveryPointId) {
      console.error(
        `Recovery point retained for investigation: ${recoveryPointId}`,
      );
    }

    throw error;
  } finally {
    if (temporaryDatabaseCreated) {
      try {
        await dropTemporaryDatabase(targetDatabaseName);
        console.log(
          `Cleanup: temporary database "${targetDatabaseName}" was removed.`,
        );
      } catch (cleanupError) {
        console.error(
          `WARNING: could not remove temporary restore database "${targetDatabaseName}". Remove it manually before another drill.`,
          cleanupError,
        );
      }
    }

    await control.end();
  }
}

main().catch(error => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Unknown recovery drill failure.',
  );

  process.exitCode = 1;
});
