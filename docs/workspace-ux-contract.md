# SaMi Workspace UX Contract

This document defines the user-facing workspace architecture that future platform categories and business apps must preserve.

## Product direction

SaMi is an AI-powered business operating workspace. It may borrow proven enterprise-suite interaction patterns from products such as Odoo, but it must keep its own identity and architecture.

The workspace is platform-first and module-agnostic. Business apps plug into the platform; they do not redefine the platform shell.

## Shared workspace shell

Every normal workspace page must inherit the shared shell unless the experience intentionally owns a dedicated shell, such as SaMi AI.

The shared shell owns:

- workspace and company context
- global permission-aware app switching
- global search
- SaMi AI entry
- notifications and messages
- shared navigation
- account access and sign out
- responsive mobile navigation

Business modules must not create competing global navigation.

## App identity

App color and icon identity comes from the canonical app registries:

- `lib/apps/icon-registry.ts`
- `lib/apps/visual-registry.ts`
- `lib/apps/navigation-registry.ts`

An app must not invent a private icon/color mapping inside its page.

Known first-party apps receive an explicit visual identity. Future or externally registered apps must receive the safe category fallback from `getSaMiAppVisual`.

Visual identity is presentation only. It never controls access.

## App access

The browser must only receive applications already resolved through workspace installation and effective permissions.

The dashboard, sidebar and app switcher must render the trusted resolved module model. They must not use `SAMI_APPS` as an authorization source.

Unknown or inaccessible apps must fail closed.

## Dashboard

The core dashboard stays module-agnostic.

It may show:

- SaMi operating brief
- installed accessible apps
- module-contributed metrics
- module-contributed work
- module-contributed attention items
- personal recent activity
- current company context
- notifications
- platform shortcuts

It must not hardcode business-specific KPIs such as invoice totals, CRM pipeline, inventory value or payroll metrics. Those belong to installed app providers.

## SaMi AI

SaMi AI is a first-class operating layer, not a decorative assistant.

It owns its dedicated chat shell and conversation navigation.

Across the normal workspace, SaMi AI remains globally reachable from the shared command layer.

AI authority must remain identical to human authority:

- current authenticated session
- current workspace
- current company
- effective app access
- effective permissions
- confirmation for business writes
- code-owned tools only

AI must never receive a generic SQL or schema executor.

Adding visual AI affordances must not imply that an unfinished app action is executable.

## Activity and audit

Personal Activity and administrative Audit are distinct products.

**My Activity** is always scoped server-side to the authenticated user within the current company. A browser parameter must never widen or switch that actor scope.

**Audit** may show authorized broader company/workspace events only when the current user has audit authority.

The dashboard recent-activity surface uses the same personal Activity scope.

## Responsive behavior

Desktop improvements must not remove mobile controls.

The following must stay reachable on mobile:

- navigation
- sign out
- app launcher
- search
- company context
- notifications
- SaMi AI
- page actions

Horizontal secondary navigation may scroll when necessary, but critical actions must not disappear.

## Visual system

Shared pages should consume the workspace design tokens in `app/globals.css` rather than creating unrelated surface systems.

Primary concepts:

- `sami-canvas`
- `sami-surface`
- `sami-surface-raised`
- `sami-soft-surface`
- `sami-ai-sheen`
- `sami-scrollbar`

Use color to communicate app identity and state. Do not turn the entire platform into one accent color.

## Future module rule

A new app should be able to register its navigation, icon, visual identity, search provider, dashboard provider and AI tools without rewriting the platform shell.

The platform should become richer as modules are added, while its core navigation and security boundaries remain stable.
