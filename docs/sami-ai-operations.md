# SaMi AI — Runtime, Privacy, Limits and Upgrade Guide

## Product model

SaMi AI is a first-party SaMi Technologies assistant. The user experience is a normal general-purpose conversational AI: users can ask general questions, write, reason, plan, explain and code without being pushed into ERP/workspace topics.

Business-data access is an optional tool capability. SaMi AI uses company data only when the user's request requires it. It does not preload or summarize coworker activity as ambient chat context.

## Request flow

1. The signed-in SaMi session resolves the current tenant, company and user.
2. SaMi resolves the user's effective apps and permissions.
3. The server builds a tool list from code-owned SaMi AI tools.
4. Module tools are included only for accessible modules.
5. Tool permission requirements are checked before the model sees them.
6. The model answers normally. It calls a SaMi tool only when the request needs permitted business data or an action.
7. Read tools return narrow business-domain data, not raw SQL/schema access.
8. Write tools require explicit user confirmation and permission revalidation.
9. One accepted send, edit or regenerate creates one AI run for usage accounting. Internal tool calls in that run do not consume additional monthly requests.
10. Provider token counts and duration are retained as operational telemetry.

## Privacy boundary

SaMi AI must not:

- automatically inspect coworker activity;
- use audit/activity feeds as ambient chat context;
- expose raw SQL, database credentials, storage keys, provider keys or infrastructure secrets;
- bypass app, company, tenant or record permissions;
- treat an installed app as permission to read all of its records.

Shared business-app AI tools must enforce the relevant `<module>.record.view` permission before returning records. Module-specific tools use their authoritative service/permission layer.

Activity and audit remain separate operational/security surfaces. They are not the normal source of SaMi AI conversation context.

## Provider and model configuration

SaMi AI uses one OpenAI-compatible transport with environment-driven provider/model selection.

Recommended provider variables:

```env
GROQ_API_KEY=
GROQ_MODEL=

OPENAI_API_KEY=
OPENAI_MODEL=

GEMINI_API_KEY=
GEMINI_MODEL=
GOOGLE_API_KEY=
GOOGLE_MODEL=
```

Normally keep exactly one provider-specific model variable active. SaMi infers the provider from the active model variable.

Optional explicit/advanced override:

```env
SAMI_AI_PROVIDER=
SAMI_AI_MODEL=
SAMI_AI_API_KEY=
SAMI_AI_BASE_URL=
```

For a custom OpenAI-compatible provider:

```env
SAMI_AI_PROVIDER=custom
SAMI_AI_MODEL=<model-id>
SAMI_AI_API_KEY=<secret>
SAMI_AI_BASE_URL=<openai-compatible-base-url>
```

Changing provider/model does not change conversation history, permissions, tools, write confirmations, memory, tenant/company boundaries or plan usage accounting.

## Runtime service limits

These limits are server-side protection controls, separate from the commercial monthly plan allowance:

```env
SAMI_AI_REQUESTS_PER_MINUTE=20
SAMI_AI_REQUESTS_PER_DAY=500
SAMI_AI_MAX_TOOL_ROUNDS=6
SAMI_AI_CONTEXT_MESSAGES=24
```

Current code defaults:

- 20 accepted AI requests per user per minute.
- 500 accepted AI requests per user per rolling 24 hours.
- Up to 6 model/tool rounds per request.
- Up to 24 recent conversation messages sent as normal model context.

Maximum accepted configuration values in the current runtime:

- requests/minute: 300
- requests/day: 10,000
- max tool rounds: 12
- context messages: 60

Raise these deliberately. Larger context and more tool rounds can increase latency and provider cost even when the customer's monthly query count is unchanged.

## Commercial monthly AI allowances

The commercial entitlement is code-owned in `lib/billing/plan-policy.ts`.

Current policy:

| Plan | AI allowance |
| --- | --- |
| Free | 100 queries per user per month |
| Standard | 1,000 queries per user per month |
| Custom | No customer-facing monthly cap; usage remains metered and short-window protected |

A query means one accepted send, edit or regenerate. Tool calls within the same run are not separately counted against the monthly query allowance.

To change a plan allowance, edit `SAMI_PLAN_POLICIES.<plan>.ai.monthlyQueriesPerUser`, update the associated entitlement tests/documentation, then deploy through the normal production gate.

## How to increase SaMi AI capacity

### More requests per minute/day

Change the Vercel production environment variables:

```env
SAMI_AI_REQUESTS_PER_MINUTE=<new-value>
SAMI_AI_REQUESTS_PER_DAY=<new-value>
```

Then redeploy production. No database migration is required.

### Longer conversations

Increase:

```env
SAMI_AI_CONTEXT_MESSAGES=<new-value>
```

This controls how many recent conversation messages are sent to the inference provider. It does not change stored chat-history retention.

### More tool reasoning rounds

Increase:

```env
SAMI_AI_MAX_TOOL_ROUNDS=<new-value>
```

Use this only if complex multi-step business questions frequently exhaust the current tool loop. More rounds increase cost and latency.

### More monthly Standard/Free allowance

Change `lib/billing/plan-policy.ts`. This is a commercial entitlement change and should go through tests and production deployment.

### Stronger/different model

Change the active provider model environment variable. Example:

```env
GROQ_MODEL=
OPENAI_MODEL=<new-model-id>
```

Keep only one active provider-specific model variable unless `SAMI_AI_PROVIDER` explicitly selects one.

## What users can see

Normal users see:

- whether SaMi AI is available;
- their monthly usage and remaining allowance where capped;
- rolling 24-hour and per-minute protections;
- attachments, memory and available capability counts;
- the current company boundary.

Normal users do not need provider keys, model IDs or backend endpoints.

Platform operators should use this guide plus Platform Administration/observability for provider health, cost and deployment configuration.

## Business-data tools

SaMi AI never receives a generic SQL executor. Business access is through code-owned tools such as Accounting, Invoicing and Sales services.

Tool access is filtered by:

- authenticated user;
- current tenant;
- current company;
- accessible installed module;
- effective permission set;
- tool-specific read/write requirements.

Writes remain confirmation-gated and are revalidated when confirmed.

## Dashboard separation

The Home dashboard is not an activity log. It should prioritize business analysis such as:

- financial KPIs and trends;
- overdue receivables/payables;
- cash and profit position;
- unresolved accounting exceptions;
- sales pipeline and conversion;
- actionable queues and deadlines.

Technical events such as AI-response generation, tool calls, logins and routine audit events belong in Security/Audit/Operations—not the Home dashboard.
