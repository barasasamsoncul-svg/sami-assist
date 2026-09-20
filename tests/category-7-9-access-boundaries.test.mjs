import { test, } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, } from 'node:fs/promises';
import path from 'node:path';
/* ================================================================
   SaMi CATEGORIES 7–9
   ACCESS-BOUNDARY REGRESSION TESTS

   These tests are deliberately source-level and read-only.

   They verify the architectural contracts that must remain true even
   while the UI and business apps continue evolving:

   - users.manage owns membership lifecycle, not app/company grants
   - roles.manage owns role assignment
   - apps.manage owns explicit app assignment
   - companies.manage owns company-scope assignment
   - invitations.manage owns invitation lifecycle
   - invitation creation is canonicalized through one access-aware path
   - explicit app grants can only narrow role-enabled app permissions
   - SaMi AI is not assignable through business roles
   - workspace settings use Category 8 permissions rather than Admin labels
   - browser tenant identifiers are not trusted by access APIs
   ================================================================ */
async function source(relativePath) {
    return readFile(path.join(process.cwd(), relativePath), 'utf8');
}
function stripComments(value) {
    return value
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ');
}
function compact(value) {
    return value.replace(/\s+/g, ' ');
}
test('member app assignment is controlled by apps.manage rather than users.manage', async () => {
    const raw = await source('lib/services/member-app-access.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /APPS_MANAGE/, 'Employee app access must require the app-management authority.');
    assert.match(implementation, /SAMI_PERMISSIONS\.APPS_MANAGE/, 'apps.manage is not enforced by the member app service.');
    assert.match(implementation, /SAMI_PERMISSIONS\.USERS_VIEW|SAMI_PERMISSIONS\.USERS_MANAGE/, 'The employee target must remain inside the People visibility boundary.');
    assert.doesNotMatch(implementation, /function requireUsersManage[\s\S]{0,250}replaceMemberAppAccess/, 'App assignment still appears to rely on the old users.manage helper.');
});
test('member company assignment is controlled by companies.manage rather than users.manage', async () => {
    const raw = await source('lib/services/member-company-access.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /SAMI_PERMISSIONS\.COMPANIES_MANAGE/, 'companies.manage is not enforced by employee company-scope mutation.');
    assert.match(implementation, /allowedCompanyIds/, 'Company assignment must remain constrained to the actor allowed-company boundary.');
    assert.match(implementation, /SELF_ACCESS_PROTECTED/, 'An administrator must not silently change their own company scope from People & Access.');
    assert.match(implementation, /OWNER_PROTECTED/, 'Workspace owner company scope must remain structurally protected.');
});
test('People & Access receives separate role, app, company, invitation and lifecycle capabilities', async () => {
    const page = compact(stripComments(await source('app/settings/users/page.tsx')));
    for (const key of [
        'USERS_MANAGE',
        'ROLES_MANAGE',
        'INVITATIONS_MANAGE',
        'APPS_MANAGE',
        'COMPANIES_MANAGE',
    ]) {
        assert.match(page, new RegExp(`SAMI_PERMISSIONS\\.${key}`), `People & Access does not resolve ${key}.`);
    }
    assert.match(page, /canManageApps=/, 'App-management capability is not passed to the client.');
    assert.match(page, /canManageCompanies=/, 'Company-management capability is not passed to the client.');
});
test('People & Access UI does not use users.manage as the app/company edit switch', async () => {
    const raw = await source('app/settings/users/UsersSettingsClient.tsx');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /canManageApps/, 'People & Access is missing the app-assignment capability.');
    assert.match(implementation, /canManageCompanies/, 'People & Access is missing the company-assignment capability.');
    assert.match(implementation, /Edit apps/, 'Employee app management action is missing.');
    assert.match(implementation, /Edit companies/, 'Employee company management action is missing.');
    assert.match(implementation, /Role → Apps → Companies/, 'Invitation access order must remain explicit in the UI.');
});
test('canonical internal invitation requires all access-management dimensions', async () => {
    const raw = await source('app/api/workspace/invitations/create-with-access/route.ts');
    const implementation = compact(stripComments(raw));
    for (const key of [
        'ROLES_MANAGE',
        'APPS_MANAGE',
        'COMPANIES_MANAGE',
    ]) {
        assert.match(implementation, new RegExp(`SAMI_PERMISSIONS\\.${key}`), `Invitation creation does not enforce ${key}.`);
    }
    assert.match(implementation, /setInvitationAppAccess/, 'Invitation app boundary is not persisted before delivery.');
    assert.match(implementation, /revokeWorkspaceInvitation/, 'A partially-created invitation must be made unusable when app-access persistence fails.');
});
test('legacy invitation POST is retained only as a compatibility redirect to the canonical endpoint', async () => {
    const raw = await source('app/api/workspace/invitations/route.ts');
    assert.match(raw, /create-with-access/, 'Legacy invitation creation is not routed through the canonical access-aware endpoint.');
    assert.match(raw, /307/, 'Legacy invitation POST must preserve its request method and body while redirecting.');
});
test('selected-app mode can only narrow app permissions already granted by roles', async () => {
    const raw = await source('lib/services/member-app-access.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /APP_NOT_GRANTED_BY_ROLE/, 'Direct app assignment must reject apps unsupported by the selected role set.');
    assert.match(implementation, /roleEligibleApps/, 'Role-derived app eligibility must remain part of member app resolution.');
    assert.match(implementation, /tenant_user_apps/, 'Explicit member app grants must be persisted.');
});
test('permission context intersects role permissions with selected member apps', async () => {
    const raw = await source('lib/auth/permission-context.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /tenant_user_apps/, 'Permission resolution does not load explicit app grants.');
    assert.match(implementation, /applyAppBoundary/, 'Permission resolution does not apply the member app boundary.');
    assert.match(implementation, /moduleKey/, 'Permission filtering must be based on the permission module key.');
});
test('SaMi AI is excluded from role-assignable permissions', async () => {
    const raw = await source('lib/services/role-permissions.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /ai\.use/, 'Role-permission service does not explicitly deprecate ai.use.');
    assert.match(implementation, /ai\.manage/, 'Role-permission service does not explicitly deprecate ai.manage.');
    assert.match(implementation, /NOT IN/, 'Deprecated AI permissions are not filtered from role assignment.');
});
test('workspace management is authorized by Category 8 workspace permissions', async () => {
    const raw = await source('app/api/workspace/route.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /getPermissionContext/, 'Workspace route does not resolve the canonical permission context.');
    assert.match(implementation, /SAMI_PERMISSIONS\.WORKSPACE_VIEW/, 'Workspace view permission is not used by the route.');
    assert.match(implementation, /SAMI_PERMISSIONS\.WORKSPACE_MANAGE/, 'Workspace manage permission is not used by the route.');
    assert.match(implementation, /WORKSPACE_MANAGEMENT_POLICY_RETIRED/, 'Legacy Admin-toggle authorization is still mutable.');
});
test('member directory redacts role/app/company dimensions independently', async () => {
    const raw = await source('app/api/workspace/members/route.ts');
    const implementation = compact(stripComments(raw));
    assert.match(implementation, /ROLES_VIEW/, 'Role information is not independently visibility-gated.');
    assert.match(implementation, /APPS_VIEW/, 'App information is not independently visibility-gated.');
    assert.match(implementation, /COMPANIES_VIEW/, 'Company information is not independently visibility-gated.');
});
test('access APIs never accept a browser-supplied tenant ID', async () => {
    const paths = [
        'app/api/workspace/member-apps/route.ts',
        'app/api/workspace/member-companies/route.ts',
        'app/api/workspace/member-roles/route.ts',
        'app/api/workspace/invitation-apps/route.ts',
        'app/api/workspace/invitations/create-with-access/route.ts',
        'app/api/workspace/members/lifecycle/route.ts',
    ];
    for (const relativePath of paths) {
        const implementation = stripComments(await source(relativePath));
        assert.doesNotMatch(implementation, /body\s*\??\.\s*tenantId/, `${relativePath} accepts tenantId from request body.`);
        assert.doesNotMatch(implementation, /searchParams[\s\S]{0,120}tenantId/, `${relativePath} accepts tenantId from query parameters.`);
    }
});
test('membership-loss session repair clears tenant and company context together', async () => {
    const raw = await source('scripts/fix-category-7-membership-session-trigger.ts');
    assert.match(raw, /current_tenant_id\s*=\s*NULL/, 'Membership-loss repair does not clear current tenant.');
    assert.match(raw, /current_company_id\s*=\s*NULL/, 'Membership-loss repair does not clear current company.');
    assert.match(raw, /selected_company_ids\s*=\s*'\{\}'::UUID\[\]/, 'Membership-loss repair does not clear selected companies.');
});
