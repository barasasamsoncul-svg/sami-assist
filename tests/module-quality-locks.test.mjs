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
      '2.3.0',
    );

    assert.equal(
      lock.referenceStandard,
      true,
    );

    assert.equal(
      lock.baselineCommit,
      '4df6cab138037aa06ba0d825fa60c403b5e5b8d3',
    );

    assert.equal(
      lock.baselineBranch,
      'feat/standalone-app-surfaces-ui',
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
