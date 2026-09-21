# SaMi Automation Runtime

Category 19 keeps Automation inside the SaMi workspace authority model.

## Security boundary

Automation never gains more authority than its run-as user.

Every interactive, scheduled, approval-resumed, or retried execution is bounded by:

1. active internal workspace membership
2. current company access
3. `automation.manage` for the run-as user
4. currently installed and accessible modules
5. action-specific permissions
6. code-owned trigger/action registrations
7. any module resource / record / field policy enforced by the action handler

Database rows may select registered trigger/action keys, but cannot supply executable code, raw SQL, browser automation, or arbitrary tool names.

## Worker switches

Scheduling and background retry processing are disabled unless the deployment explicitly enables the worker.

Server-only environment variables:

```text
SAMI_AUTOMATION_WORKER_ENABLED=true
SAMI_AUTOMATION_WORKER_SECRET=<strong-random-secret>
```

The worker route also accepts `CRON_SECRET` as the bearer secret when the deployment platform already provides that convention.

Optional bounded worker tuning:

```text
SAMI_AUTOMATION_WORKER_TENANT_BATCH=100
SAMI_AUTOMATION_WORKER_ITEM_BATCH=25
```

These values affect only internal batch processing. They are not workspace settings and must not be shown to ordinary users.

## Internal invocation

The hosting scheduler calls:

```text
GET /api/internal/automation/tick
Authorization: Bearer <server-only-worker-secret>
```

The endpoint accepts no tenant, workspace, company, user, action, SQL, or workflow selector. The worker discovers eligible work internally from trusted registries.

## Schedules

The first supported schedule is a bounded interval:

- minimum: 1 minute
- maximum: 30 days
- IANA timezone required
- run-as user captured on activation
- live authority revalidated at every execution
- no arbitrary cron expression parser
- no overlapping run while the same workflow is already running, waiting for approval, or waiting for retry

If the run-as user loses workspace/company/Automation authority, the schedule fails closed and is paused.

## Retries

Each workflow version defines:

- maximum attempts: 1–5
- backoff seconds: 0–86,400

Failed runs use a lease before retry so concurrent worker invocations cannot process the same retry simultaneously. Successful steps are preserved and skipped when a run resumes.

## Human approval

Actions may declare:

- `never`
- `optional`
- `always`

A pending approval does not grant business authority. The approver must have `automation.manage` and the action's required business permissions. After approval, SaMi resumes under the original run-as user's current authority.

Expired approvals are cancelled by the worker so runs do not remain stuck indefinitely.

## Versioning

Saving a workflow creates a new immutable version.

`latest_version` is editable/publishable work.
`active_version` is the version production execution uses.

Saving a new draft never changes the active version until the user explicitly activates it.
