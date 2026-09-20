# SaMi Foundation Hardening v4 — Categories 1–9 Lock Candidate

This package hardens the existing SaMi foundation without replacing the large working workspace, invitation, or role-permission implementations with shorter rewrites.

## Canonical access model

```text
Global identity
   ↓
Workspace membership
   ├─ Roles       → what actions the user may perform
   ├─ Apps        → which role-enabled business apps are available
   └─ Companies   → where that access may operate
         ↓
PermissionContext + company/record rules
         ↓
Workspace shell / APIs
```

SaMi AI remains a core subscription-entitled workspace capability and is removed from the role-assignment surface.

## Permission separation

- `users.manage` — membership lifecycle: suspend, reactivate, remove, restore
- `roles.manage` — assign/change employee roles
- `apps.manage` — assign/change employee apps
- `companies.manage` — assign/change employee company scope
- `invitations.manage` — invitation lifecycle
- structural owner — protected override and owner-only irreversible workspace lifecycle

Viewing access is also separated: People visibility does not automatically expose role/app/company details unless the corresponding view/manage permission exists.

## Why the hardening installer exists

Three audited files are very large and contain working functionality that must not be flattened:

- `app/api/workspace/route.ts`
- `app/api/workspace/invitations/route.ts`
- `lib/services/role-permissions.ts`

Instead of replacing those files with shorter versions, `scripts/apply-foundation-hardening.mjs`:

1. reads the exact local full files,
2. verifies unique audited markers,
3. creates timestamped backups under `.sami-backups/`,
4. applies only the authorization changes,
5. aborts on any unknown local structure rather than guessing.

It is idempotent for the included hardening markers.

## Full replacement files included

The package contains complete current replacements for the Category 7–9 files changed during the People & Access upgrade, including:

- `app/settings/users/UsersSettingsClient.tsx`
- `app/settings/users/page.tsx`
- `app/api/workspace/members/route.ts`
- `app/api/workspace/member-apps/route.ts`
- `app/api/workspace/member-companies/route.ts`
- `app/api/workspace/invitation-apps/route.ts`
- `app/api/workspace/invitations/options/route.ts`
- `app/api/workspace/invitations/create-with-access/route.ts`
- `lib/services/member-app-access.ts`
- `lib/services/member-company-access.ts`

## Database scripts

- `scripts/migrate-category-7-9-app-grants.ts`
- `scripts/fix-category-7-membership-session-trigger.ts`

Both are designed to be safe to re-run against the intended Category 7–9 schema.

## Large-file hardening performed

### Workspace

Ordinary Workspace Settings authorization is switched to Category 8:

- `workspace.view` / `workspace.manage`
- owner remains structural
- old `adminsCanViewWorkspaceSettings` / `adminsCanEditWorkspaceDetails` values remain stored for compatibility but no longer authorize anything
- the old Management Access switch is no longer exposed because the server returns `canManageWorkspaceAccess=false`
- ownership transfer and destructive lifecycle stay owner-only

### Invitations

Legacy `POST /api/workspace/invitations` is preserved but becomes a 307 compatibility redirect to:

`POST /api/workspace/invitations/create-with-access`

This gives SaMi one canonical invitation creation pipeline while keeping the old route code intact.

### AI role permissions

`ai.use` and `ai.manage` remain registered for backward compatibility, but the role-permission service excludes them from assignable role permissions and rejects new role mutation requests containing them.

## Regression test

`tests/category-7-9-access-boundaries.test.mjs` verifies the new authorization contracts without mutating the database.

## Recommended execution order

```powershell
cd C:\dev\sami-assist-web
node scripts/apply-foundation-hardening.mjs
npx tsx scripts/fix-category-7-membership-session-trigger.ts
npx tsx scripts/migrate-category-7-9-app-grants.ts
npm run build
node --test tests/category-7-9-access-boundaries.test.mjs
```

Do not continue to Category 10 until build and access-boundary tests pass on the actual local project.


## v4 correction

- CRLF-safe guarded patching for Windows checkouts.
- Preserves each patched file's original line endings.
- Adds the missing `ShieldCheck` icon import in `UsersSettingsClient.tsx`.
- Installer now stops immediately when any external command returns a non-zero exit code.


## v4 hotfix

This revision is safe to apply over an already partially-applied v2 installation.
It preserves the successful workspace/role/invitation hardening patches and fixes
TypeScript checking of the unreachable legacy invitation POST body retained below
the canonical 307 redirect. No database rerun is required when v2 migrations already succeeded.


## v4 correction

The invitation compatibility typing repair is now scoped between the POST and PATCH handlers. It no longer requires `Record<string, unknown>` to be globally unique in the route. This is designed for the partially hardened state after v2/v3.

The v4 installer uses a POST-scoped regex with exact-one-match validation for the retained compatibility body declaration and cast. It is whitespace/indentation tolerant, CRLF-safe, and idempotent.
