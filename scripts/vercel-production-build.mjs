import {
  spawnSync,
} from 'node:child_process';


const npmCommand =
  process.platform ===
    'win32'
    ? 'npm.cmd'
    : 'npm';


function run(
  script,
) {
  const result =
    spawnSync(
      npmCommand,
      [
        'run',
        script,
      ],
      {
        env:
          process.env,
        stdio:
          'inherit',
      },
    );

  if (
    result.error
  ) {
    throw result.error;
  }

  if (
    result.status !==
      0
  ) {
    process.exit(
      result.status ??
        1,
    );
  }
}


run(
  'build',
);

if (
  process.env.VERCEL_ENV ===
    'production'
) {
  console.log(
    '[SaMi Release] Expanding installed module schemas before production promotion.',
  );

  run(
    'migrate:modules:release',
  );
} else {
  console.log(
    '[SaMi Release] Production module migration skipped outside Vercel production.',
  );
}
