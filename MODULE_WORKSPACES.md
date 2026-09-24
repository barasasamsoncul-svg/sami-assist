# SaMi module workspaces

This source now uses the actual app schemas under `lib/apps/*/schema.sql` to expose a live workspace for every schema-backed app.

## Coverage
- 36 schema-backed apps
- 100 schema tables
- Live tenant data loaded through `/api/apps/[app]/data`
- Table navigation per module
- Search within the active table
- Create records using schema-defined fields
- Edit records using the detected primary key
- Module access is checked against the business's enabled apps
- No delete operation is exposed by the generic module API

The existing specialized Invoicing APIs/UI remain in place. The new workspace gives each selected app its own visible database-backed content instead of the old generic "Module workspace" placeholder.

## Install/test
Extract over the existing project, then run:

```powershell
npm run build
```

Do not include or commit `.env.local` in source-control or distribution archives.


## Locked reference module

**Invoicing v2.2.0 is locked as SaMi's first reference-quality business module.**

Locked baseline:
- Baseline commit: `d42a1253c2cd694d7878ca040ce0113ee279aa7f`
- Baseline branch: `baseline/invoicing-v2.2.0`
- Status: `locked`
- Reference standard: `true`

The lock does not make Invoicing unmaintainable. It means its protected module trees cannot change casually. Any deliberate Invoicing core change must:
1. preserve the module boundary and existing business workflows;
2. update the lock baseline intentionally;
3. pass `npm run test:invoicing`;
4. pass the complete `npm run test:ci` production gate; and
5. deploy successfully before the new baseline is accepted.

Future SaMi modules should reuse Invoicing's production standard: permission-scoped data, audited financial/business actions, responsive workspace UI, SaMi overlays, guided tutorials, Search/AI boundaries, regression coverage and production verification.
