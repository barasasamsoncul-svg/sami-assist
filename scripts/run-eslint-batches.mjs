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

function emit(
  value,
  stream,
) {
  if (
    value
  ) {
    stream.write(
      value,
    );
  }
}

function executeBatch(
  batch,
  heapMb,
) {
  return spawnSync(
    process.execPath,
    [
      '--max-old-space-size=' +
        heapMb,
      eslintBin,
      ...batch,
    ],
    {
      cwd:
        ROOT,
      env:
        process.env,
      encoding:
        'utf8',
      maxBuffer:
        32 *
        1024 *
        1024,
    },
  );
}

function isMemoryFailure(
  result,
) {
  const output =
    String(
      result.stdout ||
      '',
    ) +
    '\n' +
    String(
      result.stderr ||
      '',
    );

  return (
    /heap out of memory/i.test(
      output,
    ) ||
    /Ineffective mark-compacts/i.test(
      output,
    )
  );
}

function lintBatch(
  batch,
  label,
) {
  console.log(
    '\nESLint ' +
    label +
    ' (' +
    batch.length +
    ' files)',
  );

  let result =
    executeBatch(
      batch,
      4096,
    );

  if (
    isMemoryFailure(
      result,
    )
  ) {
    if (
      batch.length >
      1
    ) {
      console.log(
        'ESLint memory limit reached for ' +
        label +
        '; splitting this batch.',
      );

      const midpoint =
        Math.ceil(
          batch.length /
          2,
        );

      lintBatch(
        batch.slice(
          0,
          midpoint,
        ),
        label +
        'a',
      );

      lintBatch(
        batch.slice(
          midpoint,
        ),
        label +
        'b',
      );

      return;
    }

    console.log(
      'Retrying single heavy file with a 6144 MB heap: ' +
      batch[0],
    );

    result =
      executeBatch(
        batch,
        6144,
      );
  }

  emit(
    result.stdout,
    process.stdout,
  );
  emit(
    result.stderr,
    process.stderr,
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
      result.status ||
      1,
    );
  }
}

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
  ' initial batch(es) of up to ' +
  batchSize +
  '. Memory-heavy batches are split automatically.',
);

for (
  let index = 0;
  index < batches.length;
  index += 1
) {
  lintBatch(
    batches[index],
    'batch ' +
    (index + 1) +
    '/' +
    batches.length,
  );
}
