import { spawnSync } from 'node:child_process';
import process from 'node:process';

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
    name: 'SAMI_BACKUP_S3_BUCKET configured',
    ok: configured('SAMI_BACKUP_S3_BUCKET'),
  },
  {
    name: 'SAMI_BACKUP_S3_REGION configured',
    ok: configured('SAMI_BACKUP_S3_REGION'),
  },
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
