import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';

import {
  ENTERPRISE_MODULE_TABLES,
} from '../lib/apps/enterprise/catalog';

import {
  SAMI_APP_UI_PROFILES,
  SAMI_APP_UI_PROFILE_COUNT,
} from '../lib/apps/ui-profiles';

const routeFiles = [
  'app/apps/[appKey]/EnterpriseModulePage.tsx',
  'app/apps/[appKey]/page.tsx',
  'app/apps/[appKey]/[section]/page.tsx',
  'app/apps/sales/page.tsx',
  'app/apps/sales/orders/[orderId]/page.tsx',
  'app/apps/sales/quotes/[quoteId]/page.tsx',
  'app/apps/invoicing/page.tsx',
  'app/apps/invoicing/[invoiceId]/page.tsx',
];

test(
  'all 80 SaMi business apps own an explicit UI profile',
  () => {
    const expected = [
      ...Object.keys(
        ENTERPRISE_MODULE_TABLES,
      ),
      'sales',
      'invoicing',
    ];

    assert.equal(
      expected.length,
      80,
    );

    assert.equal(
      SAMI_APP_UI_PROFILE_COUNT,
      80,
    );

    assert.equal(
      Object.keys(
        SAMI_APP_UI_PROFILES,
      ).length,
      80,
    );

    for (
      const moduleKey
      of expected
    ) {
      const profile =
        SAMI_APP_UI_PROFILES[
          moduleKey
        ];

      assert.ok(
        profile,
        moduleKey +
          ' must own an explicit app UI profile',
      );

      assert.equal(
        profile.moduleKey,
        moduleKey,
      );

      assert.match(
        profile.accent,
        /^#[0-9a-f]{6}$/i,
      );

      assert.match(
        profile.secondary,
        /^#[0-9a-f]{6}$/i,
      );

      assert.ok(
        profile.eyebrow
          .trim()
          .length >=
          3,
      );

      assert.ok(
        profile.headline
          .trim()
          .length >=
          6,
      );

      assert.ok(
        profile.signature
          .trim()
          .length >=
          20,
      );
    }
  },
);

test(
  'every business app owns a distinct visual-layout fingerprint',
  () => {
    const fingerprints =
      new Map<
        string,
        string
      >();

    for (
      const [
        moduleKey,
        profile,
      ]
      of Object.entries(
        SAMI_APP_UI_PROFILES,
      )
    ) {
      const fingerprint = [
        profile.archetype,
        profile.header,
        profile.density,
        profile.navigation,
        profile.contentWidth,
        profile.accent,
        profile.secondary,
      ].join('|');

      const previous =
        fingerprints.get(
          fingerprint,
        );

      assert.equal(
        previous,
        undefined,
        moduleKey +
          ' must not share the exact visual-layout fingerprint owned by ' +
          previous,
      );

      fingerprints.set(
        fingerprint,
        moduleKey,
      );
    }

    assert.equal(
      fingerprints.size,
      80,
    );
  },
);

test(
  'business app routes use the standalone app surface instead of WorkspaceShell',
  async () => {
    for (
      const path
      of routeFiles
    ) {
      const source =
        await readFile(
          path,
          'utf8',
        );

      assert.match(
        source,
        /AppSurfaceShell/,
        path +
          ' must use the standalone business app surface',
      );

      assert.doesNotMatch(
        source,
        /components\/workspace\/WorkspaceShell/,
        path +
          ' must not import WorkspaceShell',
      );

      assert.doesNotMatch(
        source,
        /<WorkspaceShell\b/,
        path +
          ' must not render WorkspaceShell',
      );
    }
  },
);

test(
  'enterprise apps expose profile-driven composition attributes',
  async () => {
    const source =
      await readFile(
        'app/apps/[appKey]/EnterpriseModulePage.tsx',
        'utf8',
      );

    for (
      const marker
      of [
        'data-module',
        'data-archetype',
        'data-navigation',
        'data-density',
        'data-header',
        '--sami-module-accent',
        '--sami-module-secondary',
      ]
    ) {
      assert.match(
        source,
        new RegExp(
          marker.replace(
            /[-/\\^$*+?.()|[\]{}]/g,
            '\\$&',
          ),
        ),
        'enterprise module surface must expose ' +
          marker,
      );
    }
  },
);
