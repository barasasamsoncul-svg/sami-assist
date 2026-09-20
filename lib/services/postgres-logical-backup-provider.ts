import 'server-only';

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { Client } from 'pg';

import {
  registerTenantBackupProvider,
  TenantBackupProviderError,
  type CreateRecoveryPointInput,
  type ProviderRecoveryPoint,
  type ProviderRestoreResult,
  type RestoreRecoveryPointInput,
  type TenantBackupProvider,
} from '@/lib/services/tenant-backup-provider';

/**
 * Per-tenant logical backup provider for SaMi's current architecture.
 *
 * SaMi provisions one PostgreSQL DATABASE per tenant on a shared host.
 * Therefore a provider-level Neon branch/PITR restore is not safe as a
 * tenant-only restore because it can rewind other databases on the same
 * branch. This adapter backs up one tenant database at a time using
 * pg_dump custom format and stores the artifact independently in S3/R2.
 *
 * Storage configuration:
 *   - Dedicated backup variables take precedence when present.
 *   - Otherwise SaMi reuses the existing Category 2 R2 configuration:
 *       SAMI_STORAGE_BUCKET
 *       R2_ENDPOINT
 *       R2_ACCESS_KEY_ID
 *       R2_SECRET_ACCESS_KEY
 *   - R2 uses region "auto" automatically.
 *
 * Required when recovery is actually invoked:
 *   POSTGRES_ADMIN_USER
 *   POSTGRES_ADMIN_PASSWORD
 *   plus either a dedicated S3 backup configuration or the existing
 *   SaMi R2 configuration above.
 *
 * Optional:
 *   SAMI_BACKUP_S3_BUCKET
 *   SAMI_BACKUP_S3_REGION
 *   SAMI_BACKUP_S3_ENDPOINT
 *   SAMI_BACKUP_S3_FORCE_PATH_STYLE=true
 *   SAMI_PG_DUMP_PATH             (default: pg_dump)
 *   SAMI_PG_RESTORE_PATH          (default: pg_restore)
 *   POSTGRES_ADMIN_DATABASE       (default: postgres)
 *   POSTGRES_SSL=true|false
 *
 * For non-R2 S3 storage, credentials may come from the normal AWS SDK
 * credential chain. Dedicated backup variables remain available so SaMi
 * can move backups to a separate bucket/provider later without code changes.
 */

const PROVIDER_KEY = 'postgresql';

type BackupConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new TenantBackupProviderError(
      'BACKUP_PROVIDER_NOT_CONFIGURED',
      `${name} is required for tenant logical backups.`,
    );
  }
  return value;
}

function getBackupConfig(): BackupConfig {
  const existingProvider =
    process.env.SAMI_STORAGE_PROVIDER?.trim().toLowerCase();

  const existingR2Endpoint =
    process.env.R2_ENDPOINT?.trim();

  const endpoint =
    process.env.SAMI_BACKUP_S3_ENDPOINT?.trim() ||
    existingR2Endpoint ||
    undefined;

  const usingR2 =
    existingProvider === 'r2' ||
    Boolean(existingR2Endpoint);

  const bucket =
    process.env.SAMI_BACKUP_S3_BUCKET?.trim() ||
    process.env.SAMI_STORAGE_BUCKET?.trim();

  if (!bucket) {
    throw new TenantBackupProviderError(
      'BACKUP_PROVIDER_NOT_CONFIGURED',
      'SAMI_BACKUP_S3_BUCKET or SAMI_STORAGE_BUCKET is required for tenant logical backups.',
    );
  }

  const region =
    process.env.SAMI_BACKUP_S3_REGION?.trim() ||
    (usingR2 ? 'auto' : '');

  if (!region) {
    throw new TenantBackupProviderError(
      'BACKUP_PROVIDER_NOT_CONFIGURED',
      'SAMI_BACKUP_S3_REGION is required for non-R2 tenant backup storage.',
    );
  }

  const r2AccessKeyId =
    process.env.R2_ACCESS_KEY_ID?.trim();

  const r2SecretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (
    usingR2 &&
    (!r2AccessKeyId || !r2SecretAccessKey)
  ) {
    throw new TenantBackupProviderError(
      'BACKUP_PROVIDER_NOT_CONFIGURED',
      'R2 credentials are incomplete for tenant logical backups.',
    );
  }

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle:
      process.env.SAMI_BACKUP_S3_FORCE_PATH_STYLE?.trim().toLowerCase() ===
      'true',
    credentials:
      usingR2 && r2AccessKeyId && r2SecretAccessKey
        ? {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
          }
        : undefined,
  };
}

function createS3Client(config: BackupConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
  });
}

function getPgPassword(): string {
  return requireEnv('POSTGRES_ADMIN_PASSWORD');
}

function getPgUser(): string {
  return requireEnv('POSTGRES_ADMIN_USER');
}

function getPgAdminDatabase(): string {
  return process.env.POSTGRES_ADMIN_DATABASE?.trim() || 'postgres';
}

function getSslMode(): string | undefined {
  const explicit = process.env.POSTGRES_SSL?.trim().toLowerCase();
  if (explicit === 'true') return 'require';
  if (explicit === 'false') return 'disable';

  const host = process.env.POSTGRES_HOST?.trim().toLowerCase() || '';
  if (
    host.includes('neon.tech') ||
    host.includes('neon.build') ||
    host.includes('amazonaws.com')
  ) {
    return 'require';
  }

  return undefined;
}

function buildPgEnv(): NodeJS.ProcessEnv {
  const sslmode = getSslMode();
  return {
    ...process.env,
    PGPASSWORD: getPgPassword(),
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
  };
}

function safeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function buildObjectKey(input: CreateRecoveryPointInput): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return [
    'sami',
    'tenant-backups',
    safeSegment(input.source.tenantId),
    `${stamp}-${safeSegment(input.source.databaseName)}.dump`,
  ].join('/');
}

function parseReference(reference: string): { bucket: string; key: string } {
  if (!reference.startsWith('s3://')) {
    throw new TenantBackupProviderError(
      'RECOVERY_POINT_NOT_FOUND',
      'Invalid logical backup provider reference.',
    );
  }

  const withoutScheme = reference.slice('s3://'.length);
  const slash = withoutScheme.indexOf('/');
  if (slash <= 0 || slash === withoutScheme.length - 1) {
    throw new TenantBackupProviderError(
      'RECOVERY_POINT_NOT_FOUND',
      'Invalid logical backup provider reference.',
    );
  }

  return {
    bucket: withoutScheme.slice(0, slash),
    key: withoutScheme.slice(slash + 1),
  };
}

async function runCommand(
  command: string,
  args: string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: buildPgEnv(),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.once('error', error => reject(error));
    child.once('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${String(code)}: ${stderr.trim()}`,
        ),
      );
    });
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function ensureFreshTargetDatabase(
  input: RestoreRecoveryPointInput,
): Promise<void> {
  const host = requireEnv('POSTGRES_HOST');
  const port = Number.parseInt(process.env.POSTGRES_PORT || '5432', 10);

  const client = new Client({
    host,
    port,
    user: getPgUser(),
    password: getPgPassword(),
    database: getPgAdminDatabase(),
    ssl:
      getSslMode() === 'require'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  await client.connect();

  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1',
      [input.targetDatabaseName],
    );

    if (exists.rows.length > 0) {
      throw new TenantBackupProviderError(
        'RESTORE_FAILED',
        'Restore target database already exists. SaMi only restores into a fresh database.',
      );
    }

    await client.query(
      `CREATE DATABASE ${quoteIdentifier(input.targetDatabaseName)}`,
    );
  } finally {
    await client.end();
  }
}

async function dropTargetDatabaseIfPresent(databaseName: string): Promise<void> {
  const host = requireEnv('POSTGRES_HOST');
  const port = Number.parseInt(process.env.POSTGRES_PORT || '5432', 10);

  const client = new Client({
    host,
    port,
    user: getPgUser(),
    password: getPgPassword(),
    database: getPgAdminDatabase(),
    ssl:
      getSslMode() === 'require'
        ? { rejectUnauthorized: false }
        : undefined,
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

class PostgresLogicalBackupProvider implements TenantBackupProvider {
  readonly key = PROVIDER_KEY;

  async createRecoveryPoint(
    input: CreateRecoveryPointInput,
  ): Promise<ProviderRecoveryPoint> {
    if (input.recoveryType !== 'logical_export') {
      throw new TenantBackupProviderError(
        'BACKUP_PROVIDER_FAILED',
        'The PostgreSQL tenant backup provider supports logical_export recovery points only.',
      );
    }

    const config = getBackupConfig();
    const s3 = createS3Client(config);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sami-backup-'));
    const dumpPath = path.join(tempDir, 'tenant.dump');
    const key = buildObjectKey(input);

    try {
      const pgDump = process.env.SAMI_PG_DUMP_PATH?.trim() || 'pg_dump';

      await runCommand(pgDump, [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--host',
        input.source.databaseHost || requireEnv('POSTGRES_HOST'),
        '--port',
        String(input.source.databasePort || 5432),
        '--username',
        getPgUser(),
        '--file',
        dumpPath,
        input.source.databaseName,
      ]);

      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: createReadStream(dumpPath),
          ContentType: 'application/octet-stream',
          Metadata: {
            tenantid: input.source.tenantId,
            database: input.source.databaseName,
            schemaversion: input.source.schemaVersion || 'unknown',
          },
        }),
      );

      return {
        provider: PROVIDER_KEY,
        providerReference: `s3://${config.bucket}/${key}`,
        recoveryType: 'logical_export',
        available: true,
        expiresAt: null,
        metadata: {
          storage: 's3',
          bucket: config.bucket,
          key,
          format: 'pg_dump_custom',
          sourceDatabaseName: input.source.databaseName,
          sourceSchemaVersion: input.source.schemaVersion,
        },
      };
    } catch (error) {
      throw new TenantBackupProviderError(
        'BACKUP_PROVIDER_FAILED',
        error instanceof Error
          ? `Tenant logical backup failed: ${error.message}`
          : 'Tenant logical backup failed.',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async verifyRecoveryPoint(
    providerReference: string,
  ): Promise<{ available: boolean; expiresAt: Date | null }> {
    const config = getBackupConfig();
    const parsed = parseReference(providerReference);

    try {
      const s3 = createS3Client(config);
      await s3.send(
        new HeadObjectCommand({
          Bucket: parsed.bucket,
          Key: parsed.key,
        }),
      );

      return { available: true, expiresAt: null };
    } catch {
      return { available: false, expiresAt: null };
    }
  }

  async restoreRecoveryPoint(
    input: RestoreRecoveryPointInput,
  ): Promise<ProviderRestoreResult> {
    const config = getBackupConfig();
    const parsed = parseReference(input.providerReference);
    const s3 = createS3Client(config);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'sami-restore-'));
    const dumpPath = path.join(tempDir, 'tenant.dump');

    let targetCreated = false;

    try {
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: parsed.bucket,
          Key: parsed.key,
        }),
      );

      if (!object.Body || typeof (object.Body as any).pipe !== 'function') {
        throw new TenantBackupProviderError(
          'RESTORE_FAILED',
          'Backup object stream was unavailable.',
        );
      }

      await pipeline(
        object.Body as any,
        createWriteStream(dumpPath),
      );

      await ensureFreshTargetDatabase(input);
      targetCreated = true;

      const pgRestore =
        process.env.SAMI_PG_RESTORE_PATH?.trim() || 'pg_restore';

      await runCommand(pgRestore, [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--host',
        requireEnv('POSTGRES_HOST'),
        '--port',
        process.env.POSTGRES_PORT || '5432',
        '--username',
        getPgUser(),
        '--dbname',
        input.targetDatabaseName,
        dumpPath,
      ]);

      return {
        restored: true,
        targetDatabaseName: input.targetDatabaseName,
        providerReference: input.providerReference,
        metadata: {
          storage: 's3',
          format: 'pg_dump_custom',
          restoreMode: 'fresh_database',
        },
      };
    } catch (error) {
      if (targetCreated) {
        try {
          await dropTargetDatabaseIfPresent(input.targetDatabaseName);
        } catch (cleanupError) {
          console.error(
            '[SaMi] Failed to clean up unsuccessful restore target:',
            cleanupError,
          );
        }
      }

      if (error instanceof TenantBackupProviderError) throw error;

      throw new TenantBackupProviderError(
        'RESTORE_FAILED',
        error instanceof Error
          ? `Tenant restore failed: ${error.message}`
          : 'Tenant restore failed.',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async deleteRecoveryPoint(providerReference: string): Promise<void> {
    const config = getBackupConfig();
    const parsed = parseReference(providerReference);
    const s3 = createS3Client(config);

    await s3.send(
      new DeleteObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      }),
    );
  }
}

registerTenantBackupProvider(
  new PostgresLogicalBackupProvider(),
);
