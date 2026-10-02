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
  'Accounting Chart of Accounts owns a dedicated responsive surface',
  async () => {
    const [
      workspace,
      chart,
      styles,
    ] =
      await Promise.all([
        readFile(
          'app/apps/accounting/AccountingWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/accounting/AccountingChartOfAccounts.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/accounting/AccountingFoundation.module.css',
          'utf8',
        ),
      ]);

    assert.match(
      workspace,
      /dedicatedSection ===[\s\S]*'accounts'[\s\S]*AccountingChartOfAccounts/,
      'The accounts route must bypass the generic enterprise record editor.',
    );

    for (const marker of [
      'apply-template',
      'archive',
      'restore',
      'ACCOUNT_TYPE_OPTIONS',
      'SaMiOverlay',
    ]) {
      assert.match(
        chart,
        new RegExp(marker),
        'Chart of Accounts must expose ' + marker + '.',
      );
    }

    assert.match(
      styles,
      /\.chartEditorBackdrop[\s\S]*position:\s*fixed/,
    );

    assert.match(
      styles,
      /@media \(max-width: 620px\)[\s\S]*\.chartEditor[\s\S]*width:\s*100%/,
      'The Chart of Accounts editor must become a full-width mobile sheet.',
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


test(
  'Accounting Receivables keeps financial controls inside Accounting and operations in Invoicing',
  async () => {
    const [
      workspace,
      receivables,
      styles,
    ] =
      await Promise.all([
        readFile(
          'app/apps/accounting/AccountingWorkspace.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/accounting/AccountingReceivables.tsx',
          'utf8',
        ),
        readFile(
          'app/apps/accounting/AccountingFoundation.module.css',
          'utf8',
        ),
      ]);

    assert.match(
      workspace,
      /Accounts Receivable[\s\S]*\/receivables/,
      'Accounting sidebar must expose a first-class Receivables workspace.',
    );

    for (const marker of [
      'Open receivables',
      'Receivables aging',
      'Customer balances',
      'Unapplied customer credits',
      'Invoice receivables',
      'Control reconciliation',
    ]) {
      assert.match(
        receivables,
        new RegExp(marker),
        'Receivables UI must expose ' + marker + '.',
      );
    }

    assert.match(receivables, /\/apps\/invoicing\/new/);
    assert.match(receivables, /\/apps\/invoicing\/payments\/new/);
    assert.match(receivables, /\/apps\/invoicing\/reminders/);

    assert.match(
      styles,
      /\.receivableControlGrid[\s\S]*grid-template-columns/,
    );
    assert.match(
      styles,
      /@media \(max-width: 620px\)[\s\S]*\.receivableControlValues,[\s\S]*\.receivableAgingGrid[\s\S]*grid-template-columns:\s*1fr/,
      'Receivables controls must collapse safely on mobile.',
    );
  },
);


test(
  'Accounting Purchasing exposes the full procure-to-pay control workflow',
  async () => {
    const [
      workspace,
      purchasing,
    ] = await Promise.all([
      readFile(
        'app/apps/accounting/AccountingWorkspace.tsx',
        'utf8',
      ),
      readFile(
        'app/apps/accounting/AccountingPurchasing.tsx',
        'utf8',
      ),
    ]);

    assert.match(
      workspace,
      /Purchasing Controls[\s\S]*\/purchasing/,
      'Accounting sidebar must expose a first-class Purchasing workspace.',
    );

    for (const marker of [
      'Procure-to-pay control center',
      'New requisition',
      'New PO',
      'Receive',
      'Match bill',
      'Create PO',
      'Confirm receipt',
      'Run match',
      'Override',
    ]) {
      assert.match(
        purchasing,
        new RegExp(marker),
        'Purchasing UI must expose ' + marker + '.',
      );
    }

    assert.match(
      purchasing,
      /approvedRequisitions[\s\S]*requisitionLines/,
      'Approved requisitions must be convertible without retyping their lines.',
    );
    assert.match(
      purchasing,
      /match-bill[\s\S]*override-match/,
      'Purchasing UI must expose controlled match and exception-override actions.',
    );
  },
);


test(
  'Accounting Expenses keeps claims in Expenses and exposes the financial settlement workflow',
  async () => {
    const [workspace, expenses] = await Promise.all([
      readFile('app/apps/accounting/AccountingWorkspace.tsx','utf8'),
      readFile('app/apps/accounting/AccountingExpenses.tsx','utf8'),
    ]);

    assert.match(
      workspace,
      /Expenses & Reimbursements[\s\S]*\/expenses/,
      'Accounting sidebar must expose a dedicated Expenses & Reimbursements route.',
    );

    for (const marker of [
      'Expense financial control',
      'Open Expenses',
      'Category mapping',
      'Expense control accounts',
      'Approval-to-ledger queue',
      'Post reimbursement',
      'Reimbursement history',
      'Claims stay in Expenses',
    ]) {
      assert.match(expenses,new RegExp(marker),'Expense Accounting UI must expose '+marker+'.');
    }

    assert.match(
      expenses,
      /!data\.expensesAvailable[\s\S]*Expenses integration is not initialized/,
      'Accounting must remain usable when the optional Expenses app is unavailable.',
    );
    assert.match(
      expenses,
      /partial|partially_reimbursed/,
      'The UI must support partial reimbursement state.',
    );
  },
);


test(
  'Accounting Bank Cash exposes a standalone financial-account and transfer workspace',
  async () => {
    const [workspace, bankCash] = await Promise.all([
      readFile('app/apps/accounting/AccountingWorkspace.tsx','utf8'),
      readFile('app/apps/accounting/AccountingBankCash.tsx','utf8'),
    ]);

    assert.match(
      workspace,
      /Bank, Cash & Mobile Money[\s\S]*\/bank-cash/,
      'Accounting sidebar must use the dedicated bank/cash workspace instead of the generic table screen.',
    );

    for (const marker of [
      'Financial accounts',
      'New account',
      'Internal transfer',
      'Bank balance',
      'Cash balance',
      'Mobile money',
      'Account register',
      'Transfer register',
      'Opening balances are not entered here',
      'Statement files/feeds are Part 11',
    ]) {
      assert.match(bankCash,new RegExp(marker),'Bank/cash UI must expose '+marker+'.');
    }

    assert.match(
      bankCash,
      /accountType === "mobile_money"[\s\S]*Mobile-money provider/,
      'Mobile-money accounts must have provider-aware setup.',
    );
    assert.match(
      bankCash,
      /transferKey\.current[\s\S]*browserUuid/,
      'Internal-transfer retries must preserve a request key.',
    );
  },
);


test(
  'Accounting Statements exposes file imports diagnostics and provider-neutral feeds',
  async () => {
    const [workspace, statements] = await Promise.all([
      readFile('app/apps/accounting/AccountingWorkspace.tsx','utf8'),
      readFile('app/apps/accounting/AccountingStatements.tsx','utf8'),
    ]);

    assert.match(
      workspace,
      /Statements & Feeds[\s\S]*\/statements/,
      'Accounting sidebar must use the dedicated statement intake workspace.',
    );

    for (const marker of [
      'Statement intake',
      'Import statement',
      'CSV',
      'OFX',
      'QIF',
      'Row diagnostics',
      'Import anyway',
      'Feed adapter',
      'Provider-neutral feeds',
      'Import first, reconcile next',
    ]) {
      assert.match(statements,new RegExp(marker),'Statement UI must expose '+marker+'.');
    }

    assert.match(
      statements,
      /file\.size > 5_000_000/,
      'Statement uploads need a client-side size guard.',
    );
    assert.match(
      statements,
      /importKey\.current[\s\S]*browserUuid/,
      'File-import retries must preserve their request key.',
    );
    assert.match(
      statements,
      /never stores bank credentials[\s\S]*not passwords, API keys or bank secrets/,
      'Feed UI must make the no-secret boundary explicit.',
    );
  },
);


test(
  'Accounting Reconciliation exposes suggestions split matching rules exclusions and immutable history',
  async () => {
    const [workspace, reconciliation] = await Promise.all([
      readFile('app/apps/accounting/AccountingWorkspace.tsx','utf8'),
      readFile('app/apps/accounting/AccountingReconciliation.tsx','utf8'),
    ]);

    assert.match(
      workspace,
      /Reconciliation[\s\S]*\/reconciliation/,
      'Accounting sidebar must expose the dedicated reconciliation workspace.',
    );

    for (const marker of [
      'Reconciliation control center',
      'Generate suggestions',
      'Scored matches & rules',
      'Manual / split match',
      'Reconcile selected',
      'Adjustment rules',
      'Exclude',
      'Immutable history',
      'Reconciliation never edits posted journals',
    ]) {
      assert.match(reconciliation,new RegExp(marker),'Reconciliation UI must expose '+marker+'.');
    }

    assert.match(
      reconciliation,
      /allocationAmounts[\s\S]*chosenAllocations/,
      'The UI must support explicit multi-line split allocations.',
    );
    assert.match(
      reconciliation,
      /requestKeys\.current[\s\S]*browserUuid/,
      'Manual, suggestion and rule reconciliation retries must preserve request keys.',
    );
    assert.match(
      reconciliation,
      /Rules only generate suggestions here[\s\S]*explicitly accept a rule/,
      'Rule automation must not silently post adjustment journals from this workspace.',
    );
  },
);


test(
  'dedicated Accounting routes stay fast and workspace visibility is globally hardened',
  async () => {
    const [
      accounting,
      loader,
      genericPage,
      notificationCenter,
      service,
      globals,
    ] = await Promise.all([
      readFile('app/apps/accounting/AccountingWorkspace.tsx','utf8'),
      readFile('app/apps/_shared/loadStandaloneEnterpriseApp.ts','utf8'),
      readFile('app/apps/[appKey]/EnterpriseModulePage.tsx','utf8'),
      readFile('app/components/workspace/WorkspaceNotificationCenter.tsx','utf8'),
      readFile('lib/apps/enterprise/service.ts','utf8'),
      readFile('app/globals.css','utf8'),
    ]);

    await assert.rejects(
      access('app/apps/loading.tsx'),
      'Apps must not restore the blocking full-page Loading apps route fallback.',
    );

    assert.match(
      accounting,
      /lightweight:[\s\S]*Boolean[\s\S]*dedicatedSection/,
      'Dedicated Accounting pages must request the lightweight shell path.',
    );
    assert.match(
      loader,
      /getEnterpriseModuleShellWorkspace[\s\S]*options\?\.lightweight/,
      'Standalone app loading must support the lightweight shell path.',
    );
    assert.match(
      service,
      /getEnterpriseModuleShellWorkspace[\s\S]*Dedicated app routes already own their data queries/,
      'The lightweight enterprise shell must not introspect every business table.',
    );
    assert.match(
      globals,
      /Cross-app visibility hardening[\s\S]*text-slate-300[\s\S]*background-color:\s*var\(--sami-surface\)/,
      'Workspace text and legacy light surfaces must remain readable in both themes.',
    );
    assert.match(
      globals,
      /Standalone app visibility contract[\s\S]*\[data-sami-app\][\s\S]*text-slate-300[\s\S]*background-color:\s*var\(--sami-surface\)/,
      'Standalone app shells must receive the same light/dark visibility hardening as the dashboard workspace shell.',
    );
    assert.doesNotMatch(
      loader,
      /getWorkspaceNotificationSummary/,
      'Dedicated app navigation must not block on the server-side notification summary.',
    );
    assert.doesNotMatch(
      genericPage,
      /getWorkspaceNotificationSummary/,
      'Generic enterprise app navigation must not block on the server-side notification summary.',
    );
    assert.match(
      notificationCenter,
      /useEffect[\s\S]*loadSummary\(\)/,
      'Notification counts must hydrate client-side after the app shell renders.',
    );
  },
);


test(
  'Accounting Inventory Valuation exposes standard-cost sync mappings and reconciliation controls',
  async () => {
    const [workspace, valuation] = await Promise.all([
      readFile('app/apps/accounting/AccountingWorkspace.tsx','utf8'),
      readFile('app/apps/accounting/AccountingInventoryValuation.tsx','utf8'),
    ]);

    assert.match(
      workspace,
      /Inventory valuation[\s\S]*\/inventory-valuation/,
      'Accounting sidebar must expose the dedicated Inventory Valuation workspace.',
    );

    assert.match(
      valuation,
      /\/api\/apps\/accounting\/inventory-valuation/,
      'Inventory Valuation UI must use its dedicated Accounting API.',
    );

    for (const action of [
      'save-settings',
      'sync',
      'create-reconciliation',
      'save-movement-rule',
      'save-product-mapping',
      'post-reconciliation',
      'reverse-reconciliation',
    ]) {
      assert.match(
        valuation,
        new RegExp(action),
        'Inventory Valuation UI must expose ' + action + '.',
      );
    }

    for (const marker of [
      'Inventory valuation settings saved',
      'Inventory valuation synchronized',
      'Inventory reconciliation snapshot created',
      'Product accounting mapping saved',
      'Inventory reconciliation adjustment posted',
      'Inventory reconciliation reversed',
    ]) {
      assert.match(
        valuation,
        new RegExp(marker),
        'Inventory Valuation UI must surface ' + marker + '.',
      );
    }
  },
);


test(
  'Fixed Assets overview uses the dedicated accounting control and protected API',
  async () => {
    const [workspace, control, route] = await Promise.all([
      readFile('app/apps/fixed_assets/FixedAssetsWorkspace.tsx','utf8'),
      readFile('app/apps/fixed_assets/FixedAssetsAccountingControl.tsx','utf8'),
      readFile('app/api/apps/fixed_assets/accounting-control/route.ts','utf8'),
    ]);

    assert.match(
      workspace,
      /resolved\.view ===[\s\S]*'overview'[\s\S]*getFixedAssetsAccountingControl/,
    );
    assert.match(workspace,/FixedAssetsAccountingControl/);

    for (const marker of [
      'run-depreciation',
      'save-settings',
      'save-category',
      'capitalize',
      'Capitalization readiness',
      'Run depreciation',
    ]) {
      assert.match(control,new RegExp(marker));
    }

    assert.match(
      control,
      /\/api\/apps\/fixed_assets\/accounting-control/,
    );


    assert.match(
      control,
      /FixedAssetsLifecycleControl/,
      'The Fixed Assets overview must expose the controlled lifecycle surface without reverting to generic CRUD.',
    );

    for (const marker of [
      'save-settings',
      'save-category',
      'capitalize',
      'run-depreciation',
      'reverse-depreciation',
      'reverse-capitalization',
      'post-impairment',
      'reverse-impairment',
      'post-revaluation',
      'reverse-revaluation',
      'dispose',
      'reverse-disposal',
      'link-source',
    ]) {
      assert.match(route,new RegExp(marker));
    }
  },
);
