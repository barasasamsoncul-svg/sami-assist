# SaMi AI Product Contract

SaMi AI is a first-party SaMi Technologies assistant product. It is not ChatGPT, Groq, Gemini, Llama, or any other provider product with a renamed surface.

## Product identity

- The user interacts with **SaMi AI**.
- External inference providers are backend implementation details.
- Provider and model identity remain visible to Platform Administration for health, cost, and operational troubleshooting, not as the normal workspace identity.
- SaMi AI must never guess which provider/model is active from model training or self-identification.

## User experience

The SaMi AI workspace is one coherent product surface with persistent conversations, rename/pin/search/archive/export/edit/regenerate/feedback/stop controls, Markdown responses, private file attachments, workspace-aware tools, explicit confirmation for protected writes, personal memory, account context, response-style controls, visible usage limits, capability visibility, and data controls.

## Usage authority

User-visible AI usage must come from the same durable records that enforcement uses.

- Monthly plan usage is derived from `ai_runs`.
- An accepted send, edit, or regenerate creates one SaMi AI run.
- Internal tool calls within that run do not each consume another monthly request.
- Rolling 24-hour and per-minute protection are also derived from `ai_runs`.
- Provider token counts are operational telemetry; they are not presented as the user's SaMi plan allowance.

## Provider boundary

SaMi AI can switch among supported inference providers without changing product identity, conversation history, memory, permissions, company/workspace boundaries, tools, write confirmation, audit, or usage enforcement.

Provider credentials, endpoints, model IDs, routing, and secret configuration remain server-only/platform-admin concerns.

## Data and safety boundaries

- Chat history is personal to the signed-in user and current company.
- Clearing chat history expires pending AI actions before deleting the user's conversations/messages.
- Confirmed business action audit records may remain for operational accountability.
- Memory is separate from chat history and can be cleared independently.
- SaMi AI cannot use raw SQL or bypass app, record, tenant, company, or permission boundaries.
