# SaMi Categories 1–18 — Odoo/AI Architecture Revisit

This audit applies the Odoo-class, AI-native architecture contract to the platform already built.

| Category | Decision | Odoo/AI architectural role |
| --- | --- | --- |
| 1 Authentication & Identity | Keep | Platform kernel. Identity is outside business modules. |
| 2 User Account | Keep | Personal platform identity/preferences, separate from company business data. |
| 3 Sessions & Devices | Keep | Platform security/session kernel. |
| 4 Security | Keep and extend | Platform security primitives remain central; module record/field policy engine now adds business-resource security. |
| 5 Tenant / Workspace Management | Keep | SaMi workspace is the primary tenant boundary. |
| 6 Tenant Database Management | Keep | SaMi intentionally keeps physical tenant isolation rather than copying Odoo's database deployment model. |
| 7 Membership & User Access | Keep | Workspace membership boundary underneath every module. |
| 8 Roles & Permissions | Keep and extend | Existing permission engine remains authority source; module manifests declare resource permissions/policies rather than replacing it. |
| 9 Invitations | Keep | Platform membership onboarding. |
| 10 Organization / Company Profile | Keep | Equivalent to business/company context; company access remains an explicit authorization dimension. |
| 11 Workspace Shell | Keep, Odoo-align UX | Shared shell owns global app switcher, search, company, notifications and AI entry. Modules must not create competing global shells. |
| 12 Navigation & App Registry | Refactored | Navigation/app identity now resolves from canonical module manifests; aliases are compatibility only. |
| 13 Module / App Framework | Reopened and strengthened | Becomes the SaMi Module Runtime: manifest, dependencies, schema/migrations, navigation, actions, views, resources, policies and extension hooks. |
| 14 Files & Storage | Keep | Platform service reusable by modules and AI through trusted services. |
| 15 Notifications | Keep | Platform messaging/notification service; modules contribute events/providers instead of private notification systems. |
| 16 Activity & Audit | Keep | Human/AI/module actions emit common business activity/audit metadata. My Activity remains user-scoped; Audit requires authority. |
| 17 Search | Keep, runtime-wired | Core search plus module search providers filtered through the common module runtime. |
| 18 SaMi AI Core | Keep, promote to kernel | AI is not an app. Core AI + module AI tools operate only inside the same module/resource/security boundaries as humans. |

## Architectural consequences

1. No new business module may create a private app catalog.
2. No business module may bypass the central permission/company policy chain.
3. Navigation, actions and views belong to the module contract.
4. Dashboard/Search/Notifications/Activity/Automation/AI discover module capabilities through registered extension points.
5. Database configuration can enable compiled behavior but cannot become executable code.
6. Business modules own their schema/migrations and business resources.
7. Core workspace UI remains module-agnostic.
8. SaMi AI can reason across modules only when the user can access those modules and records.
9. Human and AI writes call the same trusted service layer.
10. Future module implementations must enrich manifests instead of modifying the platform shell.

## Current implementation checkpoint

The following are now represented in code:

- canonical typed module manifest
- 36 first-party module manifests
- compatibility app catalog projected from manifests
- manifest-backed navigation registry
- dependency-aware lifecycle with manifest validation
- schema path owned by the manifest
- shared module extension filter used by Dashboard, Search and SaMi AI
- resource CRUD/record/field policy engine
- fail-fast manifest reference validation
- Odoo-style app-centric workspace Home with SaMi AI command layer
- dedicated ChatGPT-style SaMi AI conversation surface

## Remaining depth

The platform framework is now prepared for Odoo-style depth, but individual business apps still need their real domain resources, permissions, record policies, field policies, views, actions, workflows, reports and AI tools as those apps are implemented.

Category 19 Automation & Workflows must build on the module runtime by exposing code-owned triggers/actions through module manifests rather than creating a separate automation-only app contract.
