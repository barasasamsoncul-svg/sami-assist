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
  'app/apps/invoicing/InvoicingSectionPage.tsx',
  'app/apps/invoicing/[invoiceId]/page.tsx',
];

const delegatingRouteFiles = [
  'app/apps/[appKey]/page.tsx',
  'app/apps/[appKey]/[section]/page.tsx',
  'app/apps/invoicing/page.tsx',
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
        moduleKey ===
          'accounting'
          ? /AccountingModuleShell/
          : /AppSurfaceShell/,
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

      if (
        path ===
          'app/apps/invoicing/InvoicingSectionPage.tsx'
      ) {
        assert.match(
          source,
          /InvoicingModuleShell/,
          path +
            ' must render the Invoicing-owned standalone module shell',
        );

        assert.doesNotMatch(
          source,
          /AppSurfaceShell/,
          path +
            ' must not squeeze Invoicing back into the generic app surface grid',
        );
      } else {
        assert.match(
          source,
          /AppSurfaceShell/,
          path +
            ' must render the standalone business app surface',
        );
      }
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

      if (
        path ===
          'app/apps/invoicing/page.tsx'
      ) {
        assert.match(
          source,
          /InvoicingSectionPage/,
          path +
            ' must delegate to the standalone Invoicing section surface',
        );
      } else {
        assert.match(
          source,
          /EnterpriseModulePage/,
          path +
            ' must delegate to the standalone enterprise app page',
        );
      }
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
  'Accounting owns a standalone finance shell instead of the generic enterprise composition',
  async () => {
    const [
      workspace,
      shell,
    ] =
      await Promise.all([
        readFile(
          'app/apps/accounting/AccountingWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/accounting/AccountingModuleShell.tsx',
          'utf8',
        ),
      ]);

    assert.match(
      workspace,
      /AccountingModuleShell/,
      'Accounting must render inside its dedicated module shell.',
    );

    assert.match(
      shell,
      /data-sami-app="accounting"/,
      'The dedicated shell must retain the Accounting app identity.',
    );

    assert.match(
      shell,
      /data-accounting-shell="standalone"/,
      'Accounting must remain a standalone app surface.',
    );

    assert.match(
      shell,
      /fixed inset-y-0 left-0/,
      'Desktop Accounting navigation must remain fixed while finance content scrolls.',
    );

    assert.match(
      shell,
      /lg:hidden/,
      'Accounting must preserve a mobile sidebar drawer.',
    );

    assert.match(
      shell,
      /min-w-0/,
      'Accounting content must remain shrink-safe on narrow screens.',
    );
  },
);


test(
  'SaMi design system enforces readable foregrounds across every app surface',
  async () => {
    const [
      globals,
      workspaceShell,
      appShell,
      enterpriseWorkspace,
    ] =
      await Promise.all([
        readFile(
          'app/globals.css',
          'utf8',
        ),
        readFile(
          'app/components/workspace/WorkspaceShell.tsx',
          'utf8',
        ),
        readFile(
          'app/components/apps/AppSurfaceShell.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/_shared/EnterpriseDataWorkspaceClient.tsx',
          'utf8',
        ),
      ]);

    assert.match(
      globals,
      /select option,[\s\S]*background:\s*var\(--sami-surface-raised\);[\s\S]*color:\s*var\(--foreground\);/,
      'Native dropdown options must never depend on hover for readable text.',
    );

    assert.match(
      globals,
      /--sami-muted:\s*#475569;/,
      'Light-mode secondary copy must use a readable muted token.',
    );

    assert.match(
      globals,
      /\.dark[\s\S]*--sami-muted:\s*#cbd5e1;/,
      'Dark-mode secondary copy must use a readable muted token.',
    );

    assert.match(
      globals,
      /button:disabled\[class\][\s\S]*opacity:\s*0\.65;/,
      'Disabled controls must remain visibly legible.',
    );

    assert.match(
      globals,
      /\.sami-surface,[\s\S]*\.sami-soft-surface[\s\S]*color:\s*var\(--foreground\);/,
      'Shared SaMi surfaces must establish a safe foreground color.',
    );

    for (const sourceText of [
      workspaceShell,
      appShell,
      enterpriseWorkspace,
    ]) {
      assert.match(
        sourceText,
        /text-slate-600[\s\S]*dark:text-slate-300/,
        'Shared application chrome must use explicit readable light/dark secondary text.',
      );
    }
  },
);


test(
  'selected navigation and inverted controls keep explicit contrast in both themes',
  async () => {
    const [
      globals,
      settings,
      workspaceSidebar,
      workspaceShell,
      appShell,
      invoicingShell,
      etims,
      eInvoicing,
      taxEngine,
      currencyCenter,
      notifications,
    ] =
      await Promise.all([
        readFile(
          'app/globals.css',
          'utf8',
        ),
        readFile(
          'app/settings/SettingsClient.tsx',
          'utf8',
        ),
        readFile(
          'app/components/workspace/WorkspaceSidebar.tsx',
          'utf8',
        ),
        readFile(
          'app/components/workspace/WorkspaceShell.tsx',
          'utf8',
        ),
        readFile(
          'app/components/apps/AppSurfaceShell.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/invoicing/InvoicingModuleShell.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/invoicing/EtimsWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/invoicing/EInvoicingWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/invoicing/TaxEngineWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/invoicing/CurrencyCenterWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/components/workspace/WorkspaceNotificationCenter.tsx',
          'utf8',
        ),
      ]);

    assert.match(
      globals,
      /\.sami-nav-selected,[\s\S]*\.sami-contrast-invert[\s\S]*background:\s*#0f172a\s*!important;[\s\S]*color:\s*#ffffff\s*!important;/,
      'Light theme selected/inverted controls must force a dark background with a white foreground.',
    );

    assert.match(
      globals,
      /\.dark \.sami-nav-selected,[\s\S]*\.dark \.sami-contrast-invert[\s\S]*background:\s*#f8fafc\s*!important;[\s\S]*color:\s*#0f172a\s*!important;/,
      'Dark theme selected/inverted controls must force a light background with a dark foreground.',
    );

    assert.match(
      globals,
      /\.sami-nav-selected :where\(svg, span, p\)[\s\S]*stroke:\s*currentColor;/,
      'Selected-state icons and labels must inherit the forced foreground.',
    );

    assert.match(
      settings,
      /sami-nav-selected/,
      'Settings selected navigation must use the semantic selected-state contract.',
    );

    assert.match(
      workspaceSidebar,
      /sami-workspace-nav-active/,
      'Workspace sidebar selections must use the semantic active-state contract.',
    );

    assert.match(
      workspaceSidebar,
      /sami-nav-active-surface/,
      'Workspace app selections must use the surface-safe active-state contract.',
    );

    assert.match(
      appShell,
      /sami-nav-active-accent/,
      'Generic standalone apps must use an explicit active navigation foreground.',
    );

    assert.match(
      invoicingShell,
      /sami-nav-active-surface/,
      'Invoicing sidebar selections must use the surface-safe active-state contract.',
    );

    for (const [
      name,
      sourceText,
    ] of [
      [
        'eTIMS',
        etims,
      ],
      [
        'International e-Invoicing',
        eInvoicing,
      ],
    ]) {
      assert.match(
        sourceText,
        /sami-nav-selected/,
        name +
          ' internal selected tabs must use the semantic selected-state contract.',
      );

      assert.match(
        sourceText,
        /sami-contrast-invert/,
        name +
          ' primary controls must use the semantic inverted-contrast contract.',
      );
    }

    assert.match(
      taxEngine,
      /sami-contrast-invert/,
      'Tax Engine primary controls must use the semantic inverted-contrast contract.',
    );

    assert.match(
      currencyCenter,
      /sami-contrast-invert/,
      'Currency Center primary controls must use the semantic inverted-contrast contract.',
    );

    assert.match(
      workspaceShell,
      /sami-contrast-invert/,
      'Workspace recovery controls must use the semantic inverted-contrast contract.',
    );

    assert.match(
      notifications,
      /sami-contrast-invert/,
      'Workspace notification controls must use the semantic inverted-contrast contract.',
    );

    const enterpriseControls =
      await readFile(
        'app/apps/_shared/EnterpriseDataWorkspaceClient.tsx',
        'utf8',
      );

    assert.match(
      enterpriseControls,
      /sami-contrast-invert/,
      'All shared enterprise app controls must use the semantic inverted-contrast contract.',
    );

    assert.doesNotMatch(
      enterpriseControls,
      /bg-slate-950[^"'\\n]*text-white[^"'\\n]*dark:bg-white[^"'\\n]*dark:text-slate-950/,
      'The 78 shared enterprise apps must not reintroduce fragile theme inversion utilities.',
    );
  },
);
