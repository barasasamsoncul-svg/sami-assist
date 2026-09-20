import { spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

function configured(name) {
  return Boolean(process.env[name]?.trim());
}

function commandWorks(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    version:
      (result.stdout || result.stderr || '')
        .trim()
        .split(/\r?\n/)[0] || null,
  };
}

const pgDump =
  process.env.SAMI_PG_DUMP_PATH?.trim() ||
  'pg_dump';

const pgRestore =
  process.env.SAMI_PG_RESTORE_PATH?.trim() ||
  'pg_restore';

const dumpCheck =
  commandWorks(pgDump);

const restoreCheck =
  commandWorks(pgRestore);

const storageProvider =
  process.env.SAMI_STORAGE_PROVIDER?.trim().toLowerCase() || '';

const r2Endpoint =
  process.env.R2_ENDPOINT?.trim() || '';

const usingR2 =
  storageProvider === 'r2' ||
  Boolean(r2Endpoint);

const backupBucket =
  process.env.SAMI_BACKUP_S3_BUCKET?.trim() ||
  process.env.SAMI_STORAGE_BUCKET?.trim() ||
  '';

const backupRegion =
  process.env.SAMI_BACKUP_S3_REGION?.trim() ||
  (usingR2 ? 'auto' : '');

const backupEndpoint =
  process.env.SAMI_BACKUP_S3_ENDPOINT?.trim() ||
  r2Endpoint ||
  '';

const r2CredentialsReady =
  configured('R2_ACCESS_KEY_ID') &&
  configured('R2_SECRET_ACCESS_KEY');

const checks = [
  {
    name: 'pg_dump available',
    ok: dumpCheck.ok,
    detail: dumpCheck.version,
  },
  {
    name: 'pg_restore available',
    ok: restoreCheck.ok,
    detail: restoreCheck.version,
  },
  {
    name: 'POSTGRES_HOST configured',
    ok: configured('POSTGRES_HOST'),
  },
  {
    name: 'POSTGRES_ADMIN_USER configured',
    ok: configured('POSTGRES_ADMIN_USER'),
  },
  {
    name: 'POSTGRES_ADMIN_PASSWORD configured',
    ok: configured('POSTGRES_ADMIN_PASSWORD'),
  },
  {
    name: 'backup bucket configured',
    ok: Boolean(backupBucket),
    detail:
      process.env.SAMI_BACKUP_S3_BUCKET?.trim()
        ? 'dedicated backup bucket'
        : backupBucket
          ? 'reusing SAMI_STORAGE_BUCKET'
          : null,
  },
  {
    name: 'backup region configured',
    ok: Boolean(backupRegion),
    detail:
      usingR2 && !process.env.SAMI_BACKUP_S3_REGION?.trim()
        ? 'auto (Cloudflare R2)'
        : backupRegion || null,
  },
  ...(usingR2
    ? [
        {
          name: 'R2 endpoint configured',
          ok: Boolean(backupEndpoint),
        },
        {
          name: 'R2 credentials configured',
          ok: r2CredentialsReady,
        },
      ]
    : []),
];

console.log('\nSaMi tenant backup readiness\n');

for (const check of checks) {
  console.log(
    `${check.ok ? 'PASS' : 'FAIL'}  ${check.name}${
      check.detail ? ` — ${check.detail}` : ''
    }`,
  );
}

const failures =
  checks.filter(check => !check.ok);

if (failures.length > 0) {
  console.error(
    `\nBackup readiness failed: ${failures.length} requirement(s) are missing.`,
  );

  process.exitCode = 1;
} else {
  console.log(
    '\nBackup tooling/configuration is ready for an actual tenant recovery drill.',
  );
}
