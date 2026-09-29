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
      '2.8.0',
    );

    assert.equal(
      lock.referenceStandard,
      true,
    );

    assert.equal(
      lock.baselineCommit,
      'e1b25a6db85e597fc201b9bdda20b7866866487d',
    );

    assert.equal(
      lock.baselineBranch,
      'main',
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
