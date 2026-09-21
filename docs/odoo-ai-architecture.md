# SaMi Architecture Contract — Odoo-class, AI-native

## Product definition

SaMi is an AI-native modular business operating system.

The platform should preserve the architectural strengths of Odoo — installable modules, explicit dependencies, business resources, actions, views, navigation, permissions, record policies, field policies, upgrades and extension points — while using SaMi's own TypeScript/Next.js/PostgreSQL architecture and making AI a first-class platform kernel.

SaMi AI is not a business app and is never a permission bypass.

## Platform kernel

The platform kernel owns capabilities that must work before any business module exists:

- authentication and identity
- account, sessions and device security
- workspace / tenant lifecycle
- tenant database lifecycle
- companies and company context
- memberships, roles and permissions
- files and storage
- notifications and messages
- activity and audit
- global search
- automation runtime
- integrations
- API / developer access
- subscription and billing
- the SaMi module runtime

Business modules must not reimplement these capabilities.

## AI kernel

SaMi AI sits beside the platform kernel and can use only capabilities made available through trusted services and code-owned module extensions.

Authority resolution is always:

session -> workspace -> company -> installed/accessible module -> CRUD permission -> record policy -> field policy -> tool/action safety

AI never receives:
- a generic SQL executor
- schema browsing authority
- infrastructure credentials
- control-database administration
- another tenant's data
- permissions beyond the signed-in user's effective authority

Writes require the same service authorization as a human action and explicit confirmation when the AI tool is marked as a write.

## Module contract

Every first-party and future business app is a SaMi module manifest.

The manifest owns:

- stable key, name, version and category
- installability and application identity
- required and optional dependencies
- schema and migration namespace
- navigation entries
- actions
- views
- business resources
- CRUD permissions
- record policies
- field policies
- settings
- dashboard providers
- search providers
- notification/activity providers
- automation triggers/actions
- AI tools

No new feature should create a private app catalog when the same information belongs in the module manifest.

## Odoo concepts and SaMi equivalents

| Odoo concept | SaMi equivalent |
| --- | --- |
| addon/module manifest | SamiModuleManifest |
| model | typed business resource + service |
| access control list | resource CRUD permissions |
| record rule | record policy |
| field groups | field policy |
| menu | manifest navigation |
| action | manifest action |
| list/form/kanban/calendar/graph/pivot view | manifest view + React renderer |
| module dependency | depends / optionalDepends |
| module data/schema | schemaPath + migrations |
| automated action | Automation runtime trigger/action |
| chatter/activity | Notifications + Activity/Audit |
| app launcher | permission-resolved workspace app launcher |
| module extension | registered provider / hook |
| assistant | SaMi AI kernel across permitted modules |

## Dashboard contract

The workspace Home should feel like an Odoo application home rather than a hardcoded analytics dashboard.

Priority:
1. SaMi AI command layer.
2. Permission-resolved installed app launcher.
3. Real work/attention supplied by modules.
4. Real metrics/recent records supplied by modules.
5. The signed-in user's own recent activity.

The core dashboard must never invent CRM, invoicing, inventory or accounting metrics. Business modules contribute those through providers.

## SaMi AI UX contract

The /ai surface is a dedicated full-screen conversational workspace inspired by the interaction model users expect from ChatGPT:

- dedicated collapsible conversation sidebar
- new chat and chat search
- conversation history, rename, pin/archive
- centered readable conversation column
- assistant responses as natural document text rather than card bubbles
- user messages as compact bubbles
- persistent bottom composer
- stop, edit, regenerate, copy and feedback
- responsive mobile sidebar overlay
- minimal chat header
- no normal WorkspaceShell chrome

SaMi keeps its own identity and must not expose fake controls for capabilities that are not implemented.

## Security contract for modules

A module being installed does not grant record access.

A module resource is usable only when:
1. the module is installed and accessible to the member;
2. the operation's permission requirement is satisfied;
3. required company context is valid;
4. a company-scoped resource has an applicable record policy;
5. field-level read/write rules allow the requested fields.

New company-scoped resources fail closed if no record policy is declared.

## Extension contract

Dashboard, Search, Notifications, Activity, Automation and AI must consume module extensions through the common module runtime.

A database row can enable/configure a compiled extension, but database content alone must never become executable code.

## Upgrade rule

Future categories and modules must extend this contract rather than bypass it.

When a new business app is implemented, it should enrich its manifest with real resources, permissions, policies, views, actions, providers, automation capabilities and AI tools without requiring changes to the platform shell.
