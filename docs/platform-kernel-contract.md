# SaMi Platform Kernel Contract

## Status

This document defines the frozen platform boundary for SaMi Assist.

The platform kernel exists so present and future business applications can be added, upgraded, deepened, disabled, removed, automated, searched, exposed to SaMi AI and integrated with external systems without redesigning SaMi's shared infrastructure.

A business module is allowed to own domain behavior. It is not allowed to require a private copy or special-case rewrite of platform infrastructure.

## The closure rule

A future business app must be able to join SaMi by contributing app-owned code and registering through stable platform contracts.

Adding or deepening a module may require:

- its module manifest and registration;
- its standalone frontend under `app/apps/<module>/`;
- its tenant schema;
- app-owned semantic-version migrations;
- its domain services and validation;
- app permissions, resources, record policies and field policies;
- dashboard, search, SaMi AI, automation, integration and API contributions;
- module-specific data export or erasure behavior;
- app-specific tests.

Adding a business module must not require redesigning or adding module-specific branches to:

- authentication and identity;
- sessions and device security;
- tenant/workspace provisioning;
- company access;
- membership and RBAC;
- billing and subscription enforcement;
- usage and entitlements;
- files and object storage;
- notifications;
- activity and audit;
- global search;
- SaMi AI core;
- automation execution;
- integration infrastructure;
- developer credential infrastructure;
- platform administration;
- observability;
- tenant backup and restore;
- platform settings.

## Canonical module contract

`lib/modules/types.ts` defines `SamiModuleManifest`.

The manifest owns declarative module identity and capability metadata:

- key, name, version and category;
- application route;
- installability;
- required and optional dependencies;
- schema path;
- migration namespace;
- navigation;
- actions;
- views;
- resources;
- permissions;
- record policies;
- field policies;
- settings;
- extension flags.

`lib/modules/validation.ts` rejects unsafe, malformed or cyclic manifests before a tenant is provisioned.

`lib/modules/registry.ts` is the platform's canonical module lookup and dependency-planning boundary.

## Executable app contributions

Declarative metadata must never become arbitrary executable code.

Executable contributions are code-owned and enter the platform through:

`lib/apps/runtime-registry.ts`

The runtime contribution contract supports:

- dashboard providers;
- search providers;
- SaMi AI tools;
- automation triggers;
- automation actions;
- automation action handlers;
- integration providers;
- data lifecycle handlers;
- module migrations;
- additional app-owned data tables required by lifecycle services.

The platform registries consume this boundary generically.

The runtime registry validates that contributed code belongs to registered modules and that the corresponding manifest extension is enabled.

## Tenant provisioning

Tenant provisioning is module-agnostic.

The provisioning engine:

1. validates selected modules;
2. resolves the manifest dependency plan;
3. reads the module's declared `schemaPath`;
4. supports schema-less modules;
5. rejects unsafe schema paths;
6. installs modules in dependency order;
7. records module installation state.

The provisioning engine must not construct schema paths from a hard-coded business-app naming convention.

## Module migrations

Migration execution belongs to the platform.

Migration definitions belong to apps.

The migration engine:

- receives app-owned migration definitions through the runtime contribution registry;
- validates semantic versions and migration namespaces;
- prevents downgrade execution;
- requires a complete upgrade path;
- executes each migration transactionally;
- records applied migrations;
- rejects destructive SQL by default.

Business-app migration files import only the stable migration type and safety contracts, not the migration registry.

## Security and permissions

Every module uses the common security model.

A module declares permissions and business resources in its manifest.

Platform services enforce:

- workspace membership;
- company access;
- role permissions;
- record policies;
- field policies;
- subscription access;
- extension opt-in boundaries.

A future module must not add a private authentication, membership or role engine.

## Search

Global Search discovers app-owned search providers from the app runtime registry.

Search providers are exposed only when:

- the app is accessible to the user;
- the manifest enables Search;
- the provider's own permission checks allow the requested records.

The Search kernel must not import named business apps.

## SaMi AI

SaMi AI is a platform capability, not a business module.

Apps contribute code-owned tools through the app runtime registry.

The AI kernel applies:

- workspace/module access;
- user permissions;
- memory policy;
- read/write risk classification;
- confirmation requirements.

A future module can expose AI tools without modifying SaMi AI core.

## Automation

Apps can contribute triggers, actions and action handlers through the runtime registry.

The common automation engine owns:

- definitions;
- conditions;
- retries;
- approvals;
- scheduling;
- worker execution;
- run history;
- permission revalidation.

A future module must not implement a private automation engine.

## Integrations

The integration kernel owns:

- credential encryption;
- OAuth state and callbacks;
- provider connections;
- inbound webhooks;
- sync/event infrastructure;
- external-app launcher support.

Apps may contribute integration provider definitions through the app runtime registry.

## Developer API

Developer API exposure is manifest-driven.

A module must:

- enable `extensions.apiEndpoints`;
- declare table-backed resources;
- pass credential app-boundary checks;
- pass company-boundary and sensitive-field checks.

The Developer API kernel does not need an app-specific code branch to expose a new compliant resource.

## Notifications and activity

Notifications and Activity/Audit are shared platform services.

Module-originated events are accepted only through registered module extension boundaries.

Apps contribute events; they do not create private notification or audit infrastructure.

## Data lifecycle

Data lifecycle is a platform contract with app-owned policy.

The platform supports:

- module export discovery;
- company-scoped safe export;
- erasure planning;
- erasure execution;
- fail-closed capability validation.

Generic export discovers table-backed manifest resources automatically and can include additional app-owned tables declared by runtime contributions.

Data erasure intentionally remains opt-in because retention, anonymization, accounting evidence and statutory requirements are domain-specific. A module that enables erasure must provide both plan and execute handlers. This is a module policy responsibility, not a missing kernel capability.

## Billing and usage

Billing and Usage & Entitlements are module-agnostic platform services.

Plans govern app count/access and platform capabilities without business-module special cases.

A future module joins the installed-app count and plan-access model through the common module registry.

## Backup and recovery

Backup/recovery is tenant-level, not module-level.

The recovery service uses provider adapters against the complete tenant database. A future business module does not need backup-specific platform code.

## Platform administration and observability

Platform Admin monitors:

- workspaces;
- subscriptions;
- providers;
- jobs;
- incidents;
- infrastructure health;
- recovery operations;
- platform settings.

Business apps emit normal telemetry and audit information through shared services.

## Frontend ownership

Every first-party business app owns a physical standalone frontend.

A module owns:

- its `page.tsx`;
- its section routes;
- its workspace composition;
- its client entry point;
- its app sidebar;
- its module-specific screens and visual workflow.

Apps may reuse low-level shared UI/data primitives. Shared primitives do not own the module's frontend.

## Future-module acceptance test

Before a future module is considered compatible with the frozen kernel, confirm:

1. the manifest validates;
2. dependency planning succeeds;
3. tenant provisioning installs the declared schema;
4. app-owned migrations register without modifying the migration kernel;
5. its standalone frontend compiles;
6. permissions and company boundaries are enforced;
7. opted-in Search/AI/Automation/Integration/API extensions are discovered through the app runtime registry;
8. notifications/activity use shared services;
9. export/erasure behavior is explicitly declared;
10. billing/usage recognizes installation without special casing;
11. backup/recovery requires no app-specific change;
12. platform admin/observability requires no app-specific change.

If satisfying one of these requires adding the module name to a platform kernel switch, array or conditional, the kernel closure contract has been violated.

## Enforcement

The contract is continuously checked by:

- `tests/platform-kernel-closure.test.mjs`;
- `tests/app-surfaces-ui.test.ts`;
- the Platform Kernel Closure GitHub workflow;
- the existing Category 1-25, core-hardening, module migration and ERP integration gates.

The platform kernel may still evolve for genuinely new platform capabilities. It must not be modified merely because another ordinary business module is added or deepened.
