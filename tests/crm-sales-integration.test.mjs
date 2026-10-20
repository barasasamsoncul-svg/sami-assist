import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('CRM owns company-scoped account, contact and interaction records', async () => {
  const [schema, runtimeSchema, catalog, workspace] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-workspace.ts'),
  ]);

  for (const table of ['crm_accounts', 'crm_contacts', 'crm_interactions']) {
    const createMarker = 'CREATE TABLE IF NOT EXISTS public.' + table + ' (';
    assert.ok(schema.includes(createMarker), table + ' baseline schema');
    assert.ok(runtimeSchema.includes(createMarker), table + ' runtime schema');
    assert.ok(catalog.includes("'" + table + "'"), table + ' generic workspace registration');

    const tableStart = runtimeSchema.indexOf(createMarker);
    const tableEnd = runtimeSchema.indexOf(');', tableStart);
    const tableSql = runtimeSchema.slice(tableStart, tableEnd);
    assert.match(tableSql, /company_id UUID NOT NULL/);
    assert.match(tableSql, /deleted_at TIMESTAMPTZ/);
  }

  assert.ok(workspace.includes('Sales remains the source of truth for leads, opportunities, quotations and order outcomes'));
});

test('CRM does not expose duplicate legacy lead and opportunity tables as CRM-owned records', async () => {
  const catalog = await source('lib/apps/enterprise/catalog.ts');
  const crmStart = catalog.indexOf('  crm: [');
  assert.notEqual(crmStart, -1, 'CRM table allowlist exists');
  const crmEnd = catalog.indexOf(']', crmStart);
  const crmEntry = catalog.slice(crmStart, crmEnd);

  for (const legacyTable of ['leads', 'opportunities', 'crm_activities', 'crm_stages', 'crm_scoring_rules', 'crm_forecasts', 'crm_forecast_lines']) {
    assert.ok(!crmEntry.includes("'" + legacyTable + "'"), legacyTable + ' must not be exposed to generic CRM CRUD');
  }
});

test('CRM overview consumes the validated Sales pipeline API read-only', async () => {
  const [panel, client, salesRoute, salesPipeline] = await Promise.all([
    source('app/apps/crm/CrmSalesIntegrationPanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/pipeline.ts'),
  ]);

  assert.ok(panel.includes("fetch('/api/apps/sales?pipeline=1'"));
  assert.ok(panel.includes("cache: 'no-store'"));
  assert.ok(panel.includes("payload.code === 'SALES_PERMISSION_REQUIRED'"));
  assert.ok(panel.includes('Live · read-only'));
  assert.ok(client.includes("initialView === 'overview'"));
  assert.ok(client.includes("accessibleModuleKeys.includes('sales')"));
  assert.ok(salesRoute.includes('getSalesPipelineData'));
  assert.ok(salesPipeline.includes('requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW)'));
});


test('CRM links accounts to existing Invoicing customers without exposing raw links to generic CRUD', async () => {
  const [schema, runtimeSchema, service, route, panel, client] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/service.ts'),
    source('app/api/apps/crm/customer-links/route.ts'),
    source('app/apps/crm/CrmCustomerLinkPanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
  ]);

  assert.match(schema, /invoicing_customer_id UUID/);
  assert.match(runtimeSchema, /ADD COLUMN IF NOT EXISTS invoicing_customer_id UUID/);
  assert.match(schema, /uq_crm_accounts_company_invoicing_customer/);
  assert.match(runtimeSchema, /uq_crm_accounts_company_invoicing_customer/);
  assert.match(service, /invoicing_customer_id/);
  assert.match(route, /requireEnterpriseModuleTableContext/);
  assert.match(route, /requireInvoicingContext/);
  assert.match(route, /INVOICING_PERMISSIONS\.CUSTOMER_VIEW/);
  assert.match(route, /company_id = \$1/);
  assert.match(route, /status = 'active'/);
  assert.match(route, /deleted_at IS NULL/);
  assert.match(route, /sec-fetch-site/);
  assert.match(panel, /\/api\/apps\/crm\/customer-links/);
  assert.match(panel, /does not create duplicate billing customers/i);
  assert.match(client, /CrmCustomerLinkPanel/);
});


test('CRM relationship timeline validates company-scoped records and keeps Sales activity read-only', async () => {
  const [route, panel, client, schema] = await Promise.all([
    source('app/api/apps/crm/interactions/route.ts'),
    source('app/apps/crm/CrmRelationshipTimelinePanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('lib/apps/crm/schema.sql'),
  ]);

  assert.match(schema, /CREATE TABLE IF NOT EXISTS public\.crm_interactions/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_interactions', 'view'\)/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_interactions', 'create'\)/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_interactions', 'edit'\)/);
  assert.match(route, /company_id = \$1/);
  assert.match(route, /CRM_RELATIONSHIP_MISMATCH/);
  assert.match(route, /status = 'planned'/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(panel, /\/api\/apps\/crm\/interactions/);
  assert.match(panel, /Sales · read-only/);
  assert.match(panel, /does not send a message or make a call/i);
  assert.match(client, /CrmRelationshipTimelinePanel/);
});


test('CRM Customer 360 uses a dedicated Sales-style module shell and stays permission scoped', async () => {
  const [shell, workspace, launcher, profile, page, route, links] = await Promise.all([
    source('app/apps/crm/CrmModuleShell.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmAccount360Launcher.tsx'),
    source('app/apps/crm/CrmAccount360Panel.tsx'),
    source('app/apps/crm/accounts/[accountId]/page.tsx'),
    source('app/api/apps/crm/accounts/[accountId]/route.ts'),
    source('app/api/apps/crm/customer-links/route.ts'),
  ]);

  assert.match(shell, /data-crm-shell="standalone"/);
  assert.match(shell, /fixed inset-y-0 left-0/);
  assert.match(shell, /WorkspaceAppSwitcher/);
  assert.match(shell, /WorkspaceTenantSwitcher/);
  assert.match(shell, /WorkspaceNotificationCenter/);
  assert.doesNotMatch(shell, /<AppSurfaceShell/);
  assert.match(workspace, /CrmModuleShell/);
  assert.match(launcher, /\/apps\/crm\/accounts\//);
  assert.match(page, /CrmWorkspace accountId=\{accountId\}/);

  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_accounts', 'view'\)/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_contacts', 'view'\)/);
  assert.ok(route.includes('company_id = $2'));
  assert.ok(route.includes('deleted_at IS NULL'));
  assert.match(route, /CRM_ACCOUNT_NOT_FOUND/);

  assert.match(profile, /\/api\/apps\/crm\/interactions\?accountId=/);
  assert.match(profile, /\/api\/apps\/sales\?pipeline=1/);
  assert.match(profile, /Sales relationship/);
  assert.match(profile, /Read-only/);
  assert.match(profile, /\/api\/apps\/crm\/customer-links\?accountId=/);
  assert.match(profile, /Invoicing connection/);
  assert.match(links, /requestedAccountId/);
  assert.ok(links.includes('($2::uuid IS NULL OR a.id = $2)'));
});



test('CRM follow-up queue is company-scoped, paginated and uses CRM-only completion actions', async () => {
  const [route, panel, workspace, client, interactions] = await Promise.all([
    source('app/api/apps/crm/follow-ups/route.ts'),
    source('app/apps/crm/CrmFollowUpsPanel.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('app/api/apps/crm/interactions/route.ts'),
  ]);

  assert.ok(route.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'view')"));
  assert.ok(route.includes('i.company_id = $1'));
  assert.ok(route.includes('i.deleted_at IS NULL'));
  assert.ok(route.includes('LIMIT $4 OFFSET $5'));
  assert.ok(route.includes('due_today'));
  assert.ok(route.includes('completed_recently'));
  assert.ok(route.includes('ILIKE $3'));
  assert.ok(panel.includes('/api/apps/crm/follow-ups?'));
  assert.ok(panel.includes('Overdue'));
  assert.ok(panel.includes('Due today'));
  assert.ok(panel.includes('Upcoming'));
  assert.ok(panel.includes("method: 'PATCH'"));
  assert.ok(panel.includes("canEdit && item.status === 'planned'"));
  assert.ok(interactions.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'edit')"));
  assert.ok(workspace.includes("section === 'follow-ups'"));
  assert.ok(workspace.includes("label: 'Follow-ups'"));
  assert.ok(client.includes('CrmFollowUpsPanel'));
});


test('CRM account segments support validated server filters and private saved views', async () => {
  const [schema, runtimeSchema, viewsRoute, segmentsRoute, panel, workspace, client] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('app/api/apps/crm/account-views/route.ts'),
    source('app/api/apps/crm/account-segments/route.ts'),
    source('app/apps/crm/CrmAccountSegmentsPanel.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
  ]);

  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS public.crm_account_saved_views'));
  assert.ok(runtimeSchema.includes('CREATE TABLE IF NOT EXISTS public.crm_account_saved_views'));
  assert.ok(viewsRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view')"));
  assert.ok(viewsRoute.includes('company_id = $1 AND owner_user_id = $2'));
  assert.ok(viewsRoute.includes('sec-fetch-site'));
  assert.ok(viewsRoute.includes('SAVED_VIEW_NOT_FOUND'));
  assert.ok(segmentsRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view')"));
  assert.ok(segmentsRoute.includes('a.company_id = $1 AND a.deleted_at IS NULL'));
  assert.ok(segmentsRoute.includes("INTERVAL '90 days'"));
  assert.ok(segmentsRoute.includes("i.status = 'completed'"));
  assert.ok(segmentsRoute.includes('LIMIT $9 OFFSET $10'));
  assert.ok(segmentsRoute.includes('owner_user_id'));
  assert.ok(panel.includes('/api/apps/crm/account-views'));
  assert.ok(panel.includes('/api/apps/crm/account-segments?'));
  assert.ok(panel.includes('Save new'));
  assert.ok(panel.includes('Update'));
  assert.ok(panel.includes('Delete'));
  assert.ok(panel.includes('not_engaged'));
  assert.ok(workspace.includes("section === 'segments'"));
  assert.ok(workspace.includes("label: 'Account segments'"));
  assert.ok(client.includes('CrmAccountSegmentsPanel'));
});


test('CRM data quality detects candidate duplicates, protects account merges, and supports company-scoped owner assignment', async () => {
  const [schema, runtimeSchema, ownersRoute, ownerRoute, duplicatesRoute, mergeRoute, ownerPanel, qualityPanel, workspace, client, profile] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('app/api/apps/crm/owners/route.ts'),
    source('app/api/apps/crm/accounts/[accountId]/owner/route.ts'),
    source('app/api/apps/crm/duplicate-candidates/route.ts'),
    source('app/api/apps/crm/accounts/merge/route.ts'),
    source('app/apps/crm/CrmAccountOwnerPanel.tsx'),
    source('app/apps/crm/CrmDataQualityPanel.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('app/apps/crm/CrmAccount360Panel.tsx'),
  ]);

  for (const text of [schema, runtimeSchema]) {
    assert.ok(text.includes('CREATE TABLE IF NOT EXISTS public.crm_account_owner_history'));
    assert.ok(text.includes('CREATE TABLE IF NOT EXISTS public.crm_account_merge_history'));
    assert.ok(text.includes('moved_contact_count'));
    assert.ok(text.includes('source_snapshot JSONB NOT NULL'));
  }

  assert.ok(ownersRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view')"));
  assert.ok(ownersRoute.includes('buildWorkspaceMemberDirectory'));
  assert.ok(ownersRoute.includes('member.companies.some((company) => company.id === context.companyId)'));
  assert.ok(ownerRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'edit')"));
  assert.ok(ownerRoute.includes('OWNER_NOT_ASSIGNABLE'));
  assert.ok(ownerRoute.includes('sameOrigin'));
  assert.ok(ownerRoute.includes('crm_account_owner_history'));

  assert.ok(duplicatesRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view')"));
  assert.ok(duplicatesRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'view')"));
  assert.ok(duplicatesRoute.includes("a.company_id = $1"));
  assert.ok(duplicatesRoute.includes("c1.company_id = $1"));
  assert.ok(duplicatesRoute.includes("normalized_name"));

  assert.ok(mergeRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'edit')"));
  assert.ok(mergeRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'edit')"));
  assert.ok(mergeRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'edit')"));
  assert.ok(mergeRoute.includes('FOR UPDATE'));
  assert.ok(mergeRoute.includes('BILLING_IDENTITY_CONFLICT'));
  assert.ok(mergeRoute.includes('confirmSourceAccountName'));
  assert.ok(mergeRoute.includes('crm_account_merge_history'));
  assert.ok(mergeRoute.includes('CRM contacts and interactions now belong to the surviving account; Sales data was not modified.'));

  assert.ok(ownerPanel.includes('/api/apps/crm/owners'));
  assert.ok(ownerPanel.includes('/owner'));
  assert.ok(ownerPanel.includes('Save owner'));
  assert.ok(qualityPanel.includes('/api/apps/crm/duplicate-candidates'));
  assert.ok(qualityPanel.includes('/api/apps/crm/accounts/merge'));
  assert.ok(qualityPanel.includes('Type the name of the account to retire'));
  assert.ok(qualityPanel.includes('/api/apps/crm/contacts/merge'));
  assert.ok(workspace.includes("section === 'data-quality'"));
  assert.ok(workspace.includes("label: 'Data quality'"));
  assert.ok(client.includes('CrmDataQualityPanel'));
  assert.ok(profile.includes('<CrmAccountOwnerPanel'));
});


test('CRM contact merging preserves relationship integrity and writes a merge audit trail', async () => {
  const [schema, runtimeSchema, mergeRoute, duplicateRoute, qualityPanel] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('app/api/apps/crm/contacts/merge/route.ts'),
    source('app/api/apps/crm/duplicate-candidates/route.ts'),
    source('app/apps/crm/CrmDataQualityPanel.tsx'),
  ]);

  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS public.crm_contact_merge_history'));
  assert.ok(runtimeSchema.includes('CREATE TABLE IF NOT EXISTS public.crm_contact_merge_history'));
  assert.ok(schema.includes('survivor_snapshot JSONB NOT NULL'));
  assert.ok(schema.includes('source_snapshot JSONB NOT NULL'));
  assert.ok(schema.includes('moved_interaction_count INTEGER NOT NULL DEFAULT 0'));

  assert.ok(duplicateRoute.includes("THEN 'shared_email'"));
  assert.ok(duplicateRoute.includes("LOWER(BTRIM(c1.email)) = LOWER(BTRIM(c2.email))"));
  assert.ok(mergeRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'edit')"));
  assert.ok(mergeRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'edit')"));
  assert.ok(mergeRoute.includes('FOR UPDATE'));
  assert.ok(mergeRoute.includes('CONTACT_ACCOUNT_CONFLICT'));
  assert.ok(mergeRoute.includes('CONTACT_INTERACTION_ACCOUNT_CONFLICT'));
  assert.ok(mergeRoute.includes('SOURCE_NAME_CONFIRMATION_MISMATCH'));
  assert.ok(mergeRoute.includes("SET deleted_at = NOW()"));
  assert.ok(mergeRoute.includes('SET contact_id = $3'));
  assert.ok(mergeRoute.includes('do_not_contact = $14'));
  assert.ok(mergeRoute.includes('crm_contact_merge_history'));
  assert.ok(mergeRoute.includes("await client.query('BEGIN')"));
  assert.ok(mergeRoute.includes("await client.query('COMMIT')"));
  assert.ok(mergeRoute.includes("await client.query('ROLLBACK')"));

  assert.ok(qualityPanel.includes('/api/apps/crm/contacts/merge'));
  assert.ok(qualityPanel.includes('Select surviving contact'));
  assert.ok(qualityPanel.includes('Type the name of the contact to retire'));
  assert.ok(qualityPanel.includes('Account relationship conflict · merge blocked'));
  assert.ok(!qualityPanel.includes('Contact duplicates are flagged for review only'));
});


test('CRM merge history exposes company-scoped audit and guarded recovery only for complete snapshots', async () => {
  const [schema, runtimeSchema, accountMerge, contactMerge, historyRoute, historyPanel, workspace, client] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('app/api/apps/crm/accounts/merge/route.ts'),
    source('app/api/apps/crm/contacts/merge/route.ts'),
    source('app/api/apps/crm/merge-history/route.ts'),
    source('app/apps/crm/CrmMergeHistoryPanel.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
  ]);

  for (const sql of [schema, runtimeSchema]) {
    assert.ok(sql.includes("moved_contact_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb"));
    assert.ok(sql.includes("moved_interaction_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb"));
    assert.ok(sql.includes('recovery_snapshot_version SMALLINT NOT NULL DEFAULT 0'));
    assert.ok(sql.includes('reversed_at TIMESTAMPTZ'));
    assert.ok(sql.includes('uq_crm_account_merge_history_active_source'));
    assert.ok(sql.includes('uq_crm_contact_merge_history_active_source'));
  }
  assert.ok(accountMerge.includes('moved_contact_snapshots, moved_interaction_snapshots,'));
  assert.ok(accountMerge.includes('recovery_snapshot_version, merged_by'));
  assert.ok(accountMerge.includes('jsonb_agg(jsonb_build_object'));
  assert.ok(accountMerge.includes('WHERE company_id = $1 AND account_id = $2 AND deleted_at IS NULL ORDER BY id FOR UPDATE'));
  assert.ok(contactMerge.includes('moved_interaction_snapshots, recovery_snapshot_version'));
  assert.ok(contactMerge.includes('jsonb_agg(jsonb_build_object'));
  assert.ok(contactMerge.includes('WHERE company_id = $1 AND contact_id = ANY($2::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE'));
  assert.ok(historyRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', mode)"));
  assert.ok(historyRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_contacts', mode)"));
  assert.ok(historyRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', mode)"));
  assert.ok(historyRoute.includes('recovery_snapshot_version'));
  assert.ok(historyRoute.includes('editedAfterMerge'));
  assert.ok(historyRoute.includes('RECOVERY_RELATIONSHIPS_CHANGED'));
  assert.ok(historyRoute.includes('SOURCE_NAME_CONFIRMATION_MISMATCH'));
  assert.ok(historyRoute.includes('ORDER BY id FOR UPDATE'));
  assert.ok(historyRoute.includes("await client.query('ROLLBACK')"));
  assert.ok(historyPanel.includes('/api/apps/crm/merge-history'));
  assert.ok(historyPanel.includes('Type the exact source name to confirm recovery'));
  assert.ok(workspace.includes("key: 'merge-history'"));
  assert.ok(client.includes('CrmMergeHistoryPanel'));
});


test('CRM relationship health ranks accounts from scoped engagement, coverage and overdue activity', async () => {
  const [healthRoute, healthPanel, workspace, workspaceClient] = await Promise.all([
    source('app/api/apps/crm/relationship-health/route.ts'),
    source('app/apps/crm/CrmRelationshipHealthPanel.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
  ]);

  assert.ok(healthRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view')"));
  assert.ok(healthRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'view')"));
  assert.ok(healthRoute.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'view')"));
  assert.ok(healthRoute.includes('COALESCE(i.account_id, c.account_id)'));
  assert.ok(healthRoute.includes('c.company_id = i.company_id'));
  assert.ok(healthRoute.includes("WHERE i.company_id = $1 AND i.deleted_at IS NULL"));
  assert.ok(healthRoute.includes("INTERVAL '90 days'"));
  assert.ok(healthRoute.includes('overdue_followups'));
  assert.ok(healthRoute.includes('health_score'));
  assert.ok(healthRoute.includes('attention_reasons'));
  assert.ok(healthRoute.includes('LIMIT 250'));

  assert.ok(healthPanel.includes('/api/apps/crm/relationship-health'));
  assert.ok(healthPanel.includes('No activity for 30+ days'));
  assert.ok(healthPanel.includes('Overdue follow-ups'));
  assert.ok(healthPanel.includes('This is an explainable operational score'));
  assert.ok(workspace.includes("key: 'health'"));
  assert.ok(workspace.includes("section === 'health'"));
  assert.ok(workspaceClient.includes('CrmRelationshipHealthPanel'));
});


test('CRM reports expose company-scoped relationship coverage, lifecycle, activity trends and CSV export', async () => {
  const [route, panel, workspace, client] = await Promise.all([
    source('app/api/apps/crm/reports/route.ts'),
    source('app/apps/crm/CrmReportsPanel.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
  ]);

  assert.ok(route.includes("requireEnterpriseModuleTableContext('crm', 'crm_accounts', 'view')"));
  assert.ok(route.includes("requireEnterpriseModuleTableContext('crm', 'crm_contacts', 'view')"));
  assert.ok(route.includes("requireEnterpriseModuleTableContext('crm', 'crm_interactions', 'view')"));
  assert.ok(route.includes('accounts.companyId !== contacts.companyId'));
  assert.ok(route.includes('a.company_id = $1'));
  assert.ok(route.includes('i.company_id = $1'));
  assert.ok(route.includes("INTERVAL '5 months'"));
  assert.ok(route.includes('overdue_followups'));
  assert.ok(route.includes('accounts_created_30_days'));
  assert.ok(panel.includes('/api/apps/crm/reports'));
  assert.ok(panel.includes('Export CSV'));
  assert.ok(panel.includes('URL.createObjectURL'));
  assert.ok(panel.includes('Six-month interaction trend'));
  assert.ok(workspace.includes("section === 'reports'"));
  assert.ok(workspace.includes("relationshipHealthView ? undefined : section"));
  assert.ok(!workspace.includes("relationshipHealthView || reportsView ? undefined : section"));
  assert.ok(workspace.includes("key: 'reports'"));
  assert.ok(client.includes('CrmReportsPanel'));
});
