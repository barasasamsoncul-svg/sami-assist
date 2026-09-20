import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

test('Category 10: organization profile remains in tenant core and its 1.0.0 to 1.1.0 migration stays registered', async () => {
  const [core, manifest, migration, provisioning] = await Promise.all([
    source('lib/schema/tenant-core.sql'),
    source('lib/schema/tenant-migrations/manifest.ts'),
    source('lib/schema/tenant-migrations/migrations/001-core-1.0.0-to-1.1.0.sql'),
    source('lib/services/tenant-provisioning.ts'),
  ]);

  assert.match(core, /logo_url\s+TEXT/i);
  assert.match(core, /company_code\s+VARCHAR\(50\)/i);
  assert.match(core, /address_line1\s+VARCHAR\(255\)/i);
  assert.match(core, /country_code\s+VARCHAR\(2\)/i);
  assert.match(core, /locale\s+VARCHAR\(20\)/i);
  assert.match(core, /fiscal_year_start_month/i);

  assert.match(manifest, /core-1\.0\.0-to-1\.1\.0/i);
  assert.match(manifest, /fromVersion:\s*['"]1\.0\.0['"]/i);
  assert.match(manifest, /toVersion:\s*['"]1\.1\.0['"]/i);
  assert.match(manifest, /001-core-1\.0\.0-to-1\.1\.0\.sql/i);

  assert.match(migration, /ALTER TABLE companies/i);
  assert.match(migration, /ALTER TABLE branches/i);
  assert.match(migration, /UPDATE companies\s+SET address_line1 = address/i);
  assert.match(migration, /UPDATE branches\s+SET address_line1 = address/i);
  assert.match(migration, /INSERT INTO company_settings/i);
  assert.match(core, /INSERT INTO \{schema\}\.company_settings/i);

  assert.match(
    provisioning,
    /CURRENT_TENANT_CORE_VERSION/,
    'New tenant registry metadata must follow the current tenant-core manifest version instead of a historical hard-coded version.',
  );
  assert.match(
    provisioning,
    /CORE_SCHEMA_VERSION\s*=\s*CURRENT_TENANT_CORE_VERSION/i,
  );
});
test('Category 10: organization service uses trusted company context and separate organization/company permissions', async () => {
  const service = compact(
    await source('lib/services/organization-profile.ts'),
  );

  assert.match(service, /getCompanyPermissionContext/);
  assert.match(service, /SAMI_PERMISSIONS\.ORGANIZATION_VIEW/);
  assert.match(service, /SAMI_PERMISSIONS\.ORGANIZATION_MANAGE/);
  assert.match(service, /SAMI_PERMISSIONS\.COMPANIES_VIEW/);
  assert.match(service, /SAMI_PERMISSIONS\.COMPANIES_MANAGE/);

  assert.match(service, /context\.currentCompanyId/);
  assert.match(service, /context\.tenantId/);
  assert.match(service, /context\.userId/);

  assert.match(service, /organization\.profile\.updated/);
  assert.match(service, /organization\.branch\.created/);
  assert.match(service, /organization\.branch\.reactivated/);
  assert.match(service, /organization\.company\.created/);
  assert.match(service, /logo_url/);
  assert.match(service, /INSERT INTO company_settings/i);
});

test('Category 10: browser APIs never accept a tenant ID and delegate to trusted services', async () => {
  const files = [
    'app/api/workspace/organization/route.ts',
    'app/api/workspace/organization/branches/route.ts',
    'app/api/workspace/organization/branches/[branchId]/route.ts',
    'app/api/workspace/companies/route.ts',
    'app/api/workspace/companies/[companyId]/route.ts',
  ];

  const combined = compact(
    (
      await Promise.all(
        files.map(file => source(file)),
      )
    ).join('\n'),
  );

  assert.doesNotMatch(
    combined,
    /body\.tenantId|body\[['"]tenantId['"]\]|searchParams\.get\(['"]tenantId['"]\)/i,
    'Category 10 APIs must not trust a browser-supplied tenant ID.',
  );

  assert.match(combined, /getOrganizationState/);
  assert.match(combined, /updateOrganizationProfile/);
  assert.match(combined, /createOrganizationBranch/);
  assert.match(combined, /createWorkspaceCompany/);
  assert.match(combined, /archiveWorkspaceCompany/);
  assert.match(combined, /reactivateWorkspaceCompany/);
});

test('Category 10: company lifecycle cannot archive the current or last company and protects user contexts', async () => {
  const service = compact(
    await source('lib/services/organization-profile.ts'),
  );

  assert.match(
    service,
    /companyId === context\.currentCompanyId/,
  );

  assert.match(
    service,
    /A workspace must keep at least one active company/i,
  );

  assert.match(
    service,
    /Reassign users who only have access to this company/i,
  );

  assert.match(
    service,
    /default_company_id = \$2/i,
  );

  assert.match(
    service,
    /current_company_id = \$2/i,
  );

  assert.match(
    service,
    /selected_company_ids/i,
  );

  assert.match(
    service,
    /if\s*\(\s*!context\.isOwner\s*\)\s*\{\s*assertAllowedCompany/i,
    'Structural workspace owners must not depend on a company_users row to administer their own workspace companies.',
  );
});

test('Category 10: settings UI exposes organization profile, branches, companies and history through permission-aware navigation', async () => {
  const [component, settings, page, sidebar, navigation] = await Promise.all([
    source('app/settings/components/OrganizationSettings.tsx'),
    source('app/settings/SettingsClient.tsx'),
    source('app/settings/page.tsx'),
    source('app/components/workspace/WorkspaceSidebar.tsx'),
    source('app/api/workspace/navigation/route.ts'),
  ]);

  assert.match(component, /Organization profile/);
  assert.match(component, /logoUrl/);
  assert.match(component, /<img/);
  assert.match(component, /Branches & locations/);
  assert.match(component, /Create company/);
  assert.match(component, /Organization history/);
  assert.match(component, /\/api\/workspace\/company-context/);

  assert.match(settings, /OrganizationSettings/);
  assert.match(settings, /'organization'/);
  assert.match(page, /ORGANIZATION_VIEW/);
  assert.match(page, /ORGANIZATION_MANAGE/);
  assert.match(page, /COMPANIES_VIEW/);
  assert.match(page, /COMPANIES_MANAGE/);

  assert.match(sidebar, /label:\s*['"]Organization['"]/i);
  assert.match(sidebar, /\/settings\?tab=organization/);

  assert.match(navigation, /organizationView/);
  assert.match(navigation, /organizationManage/);
  assert.match(navigation, /companiesView/);
  assert.match(navigation, /companiesManage/);
});

test('Category 10: tenant migration runner requires a recent verified recovery point', async () => {
  const script = compact(
    await source('scripts/migrate-tenant-core.ts'),
  );

  assert.match(script, /tenant_database_recovery_points/i);
  assert.match(script, /status = ['"]available['"]/i);
  assert.match(script, /INTERVAL ['"]7 days['"]/i);
  assert.match(script, /runTenantCoreMigrations/);
  assert.match(script, /--tenant/);
  assert.doesNotMatch(
    script,
    /DROP DATABASE/i,
    'Schema migration tooling must not perform database lifecycle operations.',
  );
});


test('Category 10: organization profile and company-directory reads remain separate', async () => {
  const service = compact(
    await source('lib/services/organization-profile.ts'),
  );

  assert.match(
    service,
    /canViewOrganization\s*=.*ORGANIZATION_VIEW.*ORGANIZATION_MANAGE/i,
  );

  assert.match(
    service,
    /canViewCompanies\s*=.*COMPANIES_VIEW.*COMPANIES_MANAGE/i,
  );

  assert.match(
    service,
    /canViewOrganization\s*\?\s*loadProfile\(context\)\s*:\s*Promise\.resolve\(null\)/i,
    'Company-directory visibility must not expose the full organization profile.',
  );

  assert.match(
    service,
    /canViewOrganization\s*\?\s*loadBranches\(context\)\s*:\s*Promise\.resolve\(\[\]\)/i,
    'Company-directory visibility must not expose current-company branches.',
  );
});

test('Category 10: archived branches have a controlled reactivation path', async () => {
  const [service, route, ui] = await Promise.all([
    source('lib/services/organization-profile.ts'),
    source('app/api/workspace/organization/branches/[branchId]/route.ts'),
    source('app/settings/components/OrganizationSettings.tsx'),
  ]);

  assert.match(service, /reactivateOrganizationBranch/);
  assert.match(route, /action\?\:\s*['"]reactivate['"]/i);
  assert.match(route, /reactivateOrganizationBranch/);
  assert.match(ui, /Reactivate/);
});


test('Category 10: tenant migration connections require SSL for hosted PostgreSQL outside production', async () => {
  const tenantDb = compact(
    await source('lib/db/tenant.ts'),
  );

  assert.match(
    tenantDb,
    /function shouldUseTenantSsl/i,
  );

  assert.match(
    tenantDb,
    /normalizedHost\.includes\(['"]neon\.tech['"]\)/i,
  );

  assert.match(
    tenantDb,
    /shouldUseTenantSsl\(\s*database\.databaseHost\s*,?\s*\)/i,
    'Registry-resolved tenant pools must apply hosted-provider SSL.',
  );

  assert.match(
    tenantDb,
    /shouldUseTenantSsl\(\s*host\s*,?\s*\)/i,
    'Compatibility tenant pools must apply the same SSL policy.',
  );
});


test('Category 10: organization mutations use SaMiOverlay feedback and destructive warnings', async () => {
  const component = compact(
    await source('app/settings/components/OrganizationSettings.tsx'),
  );

  assert.match(component, /SaMiOverlay/);
  assert.match(component, /type:\s*['"]warning['"]/i);
  assert.match(component, /Archive branch\?/i);
  assert.match(component, /Archive company\?/i);

  assert.doesNotMatch(
    component,
    /setNotice\(|setError\(/,
    'Organization settings must not fall back to inline notice/error state.',
  );

  assert.match(component, /showOverlay\(\s*['"]success['"]/i);
  assert.match(component, /showOverlay\(\s*['"]error['"]/i);
});

test('Category 10: mobile organization pages stay compact instead of stacking every editor', async () => {
  const component = compact(
    await source('app/settings/components/OrganizationSettings.tsx'),
  );

  assert.match(component, /mobileSection/);
  assert.match(component, /Identity/);
  assert.match(component, /Business/);
  assert.match(component, /Contact/);
  assert.match(component, /Address/);
  assert.match(component, /Locale/);

  assert.match(component, /mobileEditorOpen/);
  assert.match(component, /Back to branches/);
  assert.match(component, /mobileCreateOpen/);
  assert.match(component, /Back to companies/);
});

test('Category 10: audit write failures cannot roll back valid organization mutations', async () => {
  const service = compact(
    await source('lib/services/organization-profile.ts'),
  );

  assert.match(service, /SAVEPOINT \$\{savepoint\}/i);
  assert.match(service, /ROLLBACK TO SAVEPOINT \$\{savepoint\}/i);
  assert.match(service, /business mutation will continue/i);
  assert.match(service, /Organization profile update failed/i);
});


test('Category 10: legacy and structured address writes use explicit PostgreSQL parameter types', async () => {
  const service = compact(
    await source('lib/services/organization-profile.ts'),
  );

  assert.match(
    service,
    /address\s*=\s*\$8::text.*address_line1\s*=\s*\$8::varchar\(255\)/i,
  );

  assert.match(
    service,
    /\$4::text\s*,\s*\$4::varchar\(255\)/i,
  );

  assert.match(
    service,
    /address\s*=\s*\$5::text.*address_line1\s*=\s*\$5::varchar\(255\)/i,
  );
});
