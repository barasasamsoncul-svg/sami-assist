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
