import test from 'node:test';
import assert from 'node:assert/strict';
import {
  access,
  readFile,
} from 'node:fs/promises';

import {
  ENTERPRISE_MODULE_TABLES,
} from '../lib/apps/enterprise/catalog';

import {
  SAMI_APP_UI_PROFILES,
  SAMI_APP_UI_PROFILE_COUNT,
} from '../lib/apps/ui-profiles';

const standaloneSurfaceFiles = [
  'app/apps/[appKey]/EnterpriseModulePage.tsx',
  'app/apps/sales/page.tsx',
  'app/apps/sales/orders/[orderId]/page.tsx',
  'app/apps/sales/quotes/[quoteId]/page.tsx',
  'app/apps/invoicing/page.tsx',
  'app/apps/invoicing/[invoiceId]/page.tsx',
];

const delegatingRouteFiles = [
  'app/apps/[appKey]/page.tsx',
  'app/apps/[appKey]/[section]/page.tsx',
];

const allBusinessAppRouteFiles = [
  ...standaloneSurfaceFiles,
  ...delegatingRouteFiles,
];

const enterpriseStandaloneModules =
  Object.keys(
    ENTERPRISE_MODULE_TABLES,
  );

function componentName(
  moduleKey:
    string,
) {
  return moduleKey
    .split(
      '_',
    )
    .map(
      part =>
        part
          .charAt(
            0,
          )
          .toUpperCase() +
        part.slice(
          1,
        ),
    )
    .join(
      '',
    );
}

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
  'all 78 enterprise business apps own dedicated frontend route trees',
  async () => {
    assert.equal(
      enterpriseStandaloneModules.length,
      78,
    );

    for (
      const moduleKey
      of enterpriseStandaloneModules
    ) {
      const component =
        componentName(
          moduleKey,
        );

      const paths = [
        'app/apps/' +
          moduleKey +
          '/page.tsx',
        'app/apps/' +
          moduleKey +
          '/[section]/page.tsx',
        'app/apps/' +
          moduleKey +
          '/' +
          component +
          'Workspace.tsx',
        'app/apps/' +
          moduleKey +
          '/' +
          component +
          'WorkspaceClient.tsx',
      ];

      for (
        const path
        of paths
      ) {
        await assert.doesNotReject(
          access(
            path,
          ),
          moduleKey +
            ' must own ' +
            path,
        );
      }

      const workspace =
        await readFile(
          paths[2],
          'utf8',
        );

      assert.match(
        workspace,
        /AppSurfaceShell/,
        moduleKey +
          ' must compose its own standalone app surface.',
      );

      assert.match(
        workspace,
        new RegExp(
          "const MODULE_KEY = ['\"]" +
          moduleKey +
          "['\"]",
        ),
        moduleKey +
          ' workspace must be bound to its own module key.',
      );

      assert.match(
        workspace,
        /appSidebarItems/,
        moduleKey +
          ' must own its sidebar composition.',
      );

      const client =
        await readFile(
          paths[3],
          'utf8',
        );

      assert.match(
        client,
        /_shared\/EnterpriseDataWorkspaceClient/,
        moduleKey +
          ' may reuse the shared record engine but must enter through its own client.',
      );

      assert.doesNotMatch(
        client,
        /apps\/\[appKey\]\/EnterpriseModuleWorkspaceClient/,
        moduleKey +
          ' must not depend on the dynamic route as its frontend owner.',
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
      of standaloneSurfaceFiles
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
          ' must render the standalone business app surface',
      );
    }

    for (
      const path
      of delegatingRouteFiles
    ) {
      const source =
        await readFile(
          path,
          'utf8',
        );

      assert.match(
        source,
        /EnterpriseModulePage/,
        path +
          ' must delegate to the standalone enterprise app page',
      );
    }

    for (
      const path
      of allBusinessAppRouteFiles
    ) {
      const source =
        await readFile(
          path,
          'utf8',
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
  'every standalone business app renders a module-owned sidebar',
  async () => {
    const shell =
      await readFile(
        'app/components/apps/AppSurfaceShell.tsx',
        'utf8',
      );

    assert.match(
      shell,
      /data-app-sidebar/,
      'The standalone app shell must always render an app-owned sidebar.',
    );

    assert.match(
      shell,
      /aria-label="Open app sidebar"/,
      'Mobile app surfaces must expose the sidebar through a drawer control.',
    );

    assert.match(
      shell,
      /lg:grid-cols-\[248px_minmax\(0,1fr\)\]/,
      'Desktop app surfaces must reserve a persistent sidebar column.',
    );

    for (
      const path
      of standaloneSurfaceFiles
    ) {
      const source =
        await readFile(
          path,
          'utf8',
        );

      assert.match(
        source,
        /appSidebarItems=/,
        path +
          ' must supply its module-specific sidebar navigation.',
      );

      assert.match(
        source,
        /activeSidebarKey=/,
        path +
          ' must identify the active module-sidebar section.',
      );
    }

    const enterprise =
      await readFile(
        'app/apps/accounting/AccountingWorkspace.tsx',
        'utf8',
      );

    assert.match(
      enterprise,
      /data\.tables[\s\S]*appSidebarItems/,
      'Enterprise apps must derive sidebar sections from their real module tables.',
    );

    const salesClient =
      await readFile(
        'app/apps/sales/SalesWorkspaceClient.tsx',
        'utf8',
      );

    const invoicingClient =
      await readFile(
        'app/apps/invoicing/InvoicingWorkspaceClient.tsx',
        'utf8',
      );

    assert.doesNotMatch(
      salesClient,
      /flex gap-2 overflow-x-auto p-3/,
      'Sales must not keep the former horizontal primary navigation after adopting its sidebar.',
    );

    assert.doesNotMatch(
      invoicingClient,
      /visibleNav\.map\([\s\S]*setView\(/,
      'Invoicing must not keep the former horizontal primary navigation after adopting its sidebar.',
    );
  },
);

test(
  'enterprise apps expose profile-driven composition attributes',
  async () => {
    const source =
      await readFile(
        'app/apps/accounting/AccountingWorkspace.tsx',
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
