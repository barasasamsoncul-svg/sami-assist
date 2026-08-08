# SaMi Invoicing Module

This module adds the Invoicing workspace to the existing SaMi Assist dashboard.

## Files

- `app/components/layout/invoices.tsx` — complete invoicing workspace UI.
- `app/dashboard/invoices.tsx` — dashboard route adapter used by the existing app navigation.

## Existing APIs used

- `GET /api/invoices`
- `POST /api/invoices`
- `GET /api/invoices/[id]`
- `GET /api/invoices/stats`
- `GET /api/customers`

The module does not create a second database or replace the tenant-aware APIs.

## Installation

From the project root:

```powershell
Expand-Archive -Path "$env:USERPROFILE\\Downloads\\sami-invoicing-module.zip" -DestinationPath "C:\\dev\\sami-assist-web" -Force
```

Then run:

```powershell
npm run build
```

The existing app registry already defines `invoicing` with route `invoices`, and the current dashboard navigation loads enabled apps dynamically. This module therefore keeps the existing app-selection architecture instead of hard-coding Invoicing for every business.
