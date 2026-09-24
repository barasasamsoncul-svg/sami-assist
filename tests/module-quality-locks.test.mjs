import assert from 'node:assert/strict';
import {
  execFileSync,
} from 'node:child_process';
import {
  readFile,
} from 'node:fs/promises';
import test from 'node:test';


async function lockManifest() {
  return JSON.parse(
    await readFile(
      new URL(
        '../module-quality-locks.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
}


function gitTreeSha(
  path,
) {
  return execFileSync(
    'git',
    [
      'rev-parse',
      'HEAD:' + path,
    ],
    {
      encoding:
        'utf8',
    },
  ).trim();
}


test(
  'locked Invoicing reference baseline cannot drift silently',
  async () => {
    const manifest =
      await lockManifest();

    const lock =
      manifest
        .locks
        .invoicing;

    assert.equal(
      lock.status,
      'locked',
    );

    assert.equal(
      lock.moduleVersion,
      '2.2.0',
    );

    assert.equal(
      lock.referenceStandard,
      true,
    );

    assert.equal(
      lock.baselineCommit,
      'd42a1253c2cd694d7878ca040ce0113ee279aa7f',
    );

    assert.equal(
      lock.baselineBranch,
      'baseline/invoicing-v2.2.0',
    );

    for (
      const [
        path,
        expectedSha,
      ]
      of Object.entries(
        lock.protectedTrees,
      )
    ) {
      assert.equal(
        gitTreeSha(
          path,
        ),
        expectedSha,
        [
          'Locked Invoicing tree changed:',
          path,
          'Update the Invoicing lock baseline only after the deliberate change passes the complete Invoicing and production regression gates.',
        ].join(
          ' ',
        ),
      );
    }
  },
);
