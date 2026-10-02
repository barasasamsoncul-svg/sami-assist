import {
  readdir,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import {
  spawnSync,
} from 'node:child_process';

const ROOT =
  process.cwd();

const IGNORED_DIRECTORIES =
  new Set([
    '.git',
    '.next',
    '.turbo',
    '.vercel',
    'node_modules',
    'out',
    'build',
    'dist',
    'coverage',
    '_backup_old',
  ]);

const SOURCE_EXTENSIONS =
  new Set([
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
  ]);

const requested =
  process.argv.slice(
    2,
  );

const batchSizeRaw =
  Number(
    process.env
      .SAMI_LINT_BATCH_SIZE ||
    24,
  );

const batchSize =
  Number.isInteger(
    batchSizeRaw,
  ) &&
  batchSizeRaw > 0
    ? batchSizeRaw
    : 24;

function isSourceFile(
  filePath,
) {
  if (
    filePath.endsWith(
      'next-env.d.ts',
    )
  ) {
    return false;
  }

  return SOURCE_EXTENSIONS.has(
    path.extname(
      filePath,
    ),
  );
}

async function collect(
  inputPath,
  output,
) {
  const absolute =
    path.resolve(
      ROOT,
      inputPath,
    );

  let info;

  try {
    info =
      await stat(
        absolute,
      );
  } catch {
    throw new Error(
      'Lint target does not exist: ' +
      inputPath,
    );
  }

  if (
    info.isFile()
  ) {
    if (
      isSourceFile(
        absolute,
      )
    ) {
      output.add(
        path.relative(
          ROOT,
          absolute,
        ),
      );
    }

    return;
  }

  if (
    !info.isDirectory()
  ) {
    return;
  }

  const entries =
    await readdir(
      absolute,
      {
        withFileTypes:
          true,
      },
    );

  for (
    const entry
    of entries
  ) {
    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(
        entry.name,
      )
    ) {
      continue;
    }

    const child =
      path.join(
        absolute,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      await collect(
        child,
        output,
      );
      continue;
    }

    if (
      entry.isFile() &&
      isSourceFile(
        child,
      )
    ) {
      output.add(
        path.relative(
          ROOT,
          child,
        ),
      );
    }
  }
}

const files =
  new Set();

if (
  requested.length
) {
  for (
    const target
    of requested
  ) {
    await collect(
      target,
      files,
    );
  }
} else {
  await collect(
    '.',
    files,
  );
}

const ordered =
  [
    ...files,
  ].sort();

if (
  !ordered.length
) {
  console.log(
    'No lintable source files found.',
  );
  process.exit(
    0,
  );
}

const eslintBin =
  path.join(
    ROOT,
    'node_modules',
    'eslint',
    'bin',
    'eslint.js',
  );

const batches = [];

for (
  let index = 0;
  index < ordered.length;
  index += batchSize
) {
  batches.push(
    ordered.slice(
      index,
      index +
      batchSize,
    ),
  );
}

console.log(
  'Linting ' +
  ordered.length +
  ' source files in ' +
  batches.length +
  ' batch(es) of up to ' +
  batchSize +
  '.',
);

for (
  let index = 0;
  index < batches.length;
  index += 1
) {
  const batch =
    batches[index];

  console.log(
    '\nESLint batch ' +
    (index + 1) +
    '/' +
    batches.length +
    ' (' +
    batch.length +
    ' files)',
  );

  const result =
    spawnSync(
      process.execPath,
      [
        '--max-old-space-size=4096',
        eslintBin,
        ...batch,
      ],
      {
        cwd:
          ROOT,
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
    result.status !== 0
  ) {
    process.exit(
      result.status ||
      1,
    );
  }
}
