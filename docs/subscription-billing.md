# SaMi Subscription & Billing

Category 22 keeps SaMi's commercial rules independent from any payment company.

## Authority

SaMi owns:

- plan selection and entitlement
- active-user seat count
- app/dependency entitlement
- AI entitlement contract
- multi-company entitlement
- Developer API entitlement
- billing price and amount calculation
- subscription state and paid-period dates
- payment history and provider references

A payment provider only performs payment-provider operations such as checkout,
payment-method authorization, recurring billing where supported, and webhook
delivery.

Browser-supplied amounts are never authoritative.

## Plan contract

### Free

- KES 0
- one active internal user
- one installed business app, after required dependencies are resolved
- single company
- no external Developer API
- limited AI allowance
- cloud hosted; storage enforcement belongs to Category 23

### Standard

- default KES 2,500 per active internal user per month
- first month free
- all business apps
- single company
- standard AI allowance
- no external Developer API
- cloud hosted; storage enforcement belongs to Category 23

### Custom

- default KES 4,500 per active internal user per month
- first month free
- all business apps
- multi-company
- external Developer API
- customization capability
- advanced AI allowance with cost controls
- cloud hosted; storage enforcement belongs to Category 23

Paid prices are deliberately server-configurable.

## Environment configuration

Canonical price variables:

```env
SAMI_BILLING_STANDARD_PRICE_PER_USER_MONTHLY=2500
SAMI_BILLING_CUSTOM_PRICE_PER_USER_MONTHLY=4500
```

Provider selection:

```env
SAMI_BILLING_PROVIDER=stripe
```

Supported provider keys are:

- `stripe`
- `paystack`
- `pesapal`

For rollout safety, an unset `SAMI_BILLING_PROVIDER` currently falls back to
PesaPal. Set it explicitly in production once the chosen provider is fully
configured.

### Stripe

```env
SAMI_BILLING_PROVIDER=stripe

STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Optional. If omitted, SaMi resolves/creates plan products through Stripe.
STRIPE_STANDARD_PRODUCT_ID=...
STRIPE_CUSTOM_PRODUCT_ID=...
```

Webhook endpoint:

```text
/api/billing/stripe/webhook
```

Stripe is considered configured only when the secret key, publishable key and
webhook secret are all present.

SaMi uses a SetupIntent for zero-charge payment-method authorization during an
eligible free trial/current paid period. The provider state is then re-read
server-side before SaMi creates recurring billing.

### Paystack

```env
SAMI_BILLING_PROVIDER=paystack

PAYSTACK_SECRET_KEY=...
```

Callback/webhook endpoint:

```text
/api/billing/paystack/callback
```

The current SaMi Paystack adapter supports checkout, including M-PESA-capable
checkout, but does not advertise automatic recurring billing yet. SaMi must
never claim a provider capability that the adapter cannot safely complete.

### PesaPal

Existing PesaPal credentials remain supported through the PesaPal adapter.

PesaPal does not own SaMi pricing. Legacy provider-specific price variables are ignored by Category 22. Only the canonical `SAMI_BILLING_*` price variables may override the default SaMi plan prices.

New PesaPal checkouts persist the server-calculated active-seat count and per-user price snapshot. The callback also validates one-time checkout amounts against the current SaMi billing contract before subscription access can be activated.

## Provider switching

Changing:

```env
SAMI_BILLING_PROVIDER=...
```

selects the provider for new billing operations.

It does **not** migrate an existing recurring mandate. Existing recurring
billing is pinned in `subscription_billing_profiles` to the provider that
created it. A cross-provider migration requires an explicit cancellation /
re-authorization flow.

This prevents an existing Stripe subscription from being silently treated as a
Paystack or PesaPal subscription after an environment change.

## Recurring billing and changing seats

Paid billing is per active internal user.

For providers that support variable recurring billing, SaMi reconciliation
keeps the provider subscription aligned to:

```text
current server-configured price per user × current active billable users
```

The provider profile stores the last synchronized price and seat quantity.
Verified recurring invoices must match that SaMi billing profile before they
can extend subscription access.

## Plan changes

- Free → first paid plan: immediate one-month free trial.
- Free → paid after a prior paid trial: payment is required; the free month is
  not reset by cycling through Free.
- Paid trial → another paid plan: immediate, preserving the original trial end.
- Paid trial → Free: immediate and any recurring trial mandate is cancelled.
- Active paid → another plan: scheduled for the current paid-period boundary.
- Active paid → Free: provider cancellation is scheduled at period end.
- Downgrades are blocked if active users, installed apps/dependencies or active
  companies exceed the target plan's capacity.

The subscription plan in SaMi remains the entitlement authority even when a
provider has its own recurring subscription object.

## Cancelling a plan change vs cancelling the subscription

These are deliberately separate lifecycle operations.

### Cancel a pending upgrade or downgrade

If an active paid subscription has a plan change scheduled for the current
period boundary, a billing manager may cancel that pending change before it
takes effect.

SaMi then:

- clears the scheduled target plan and effective date
- keeps the current plan active
- restores the current provider renewal settings where a recurring provider
  had already been prepared for the scheduled change
- records the reversal in audit history
- sends critical in-app, email and SMS notification to workspace owners

For a scheduled move to Free, restoring the current plan also removes the
provider's period-end cancellation where the provider supports that operation.

### Cancel the paid subscription

Cancelling the subscription means **stop future paid renewal**. It does not
mean "downgrade to Free" and it never deletes the workspace.

Cancellation is always allowed even when the workspace is too large for Free.
This prevents plan-capacity rules from trapping a customer in recurring
billing.

For a valid paid trial or active paid period:

- renewal is stopped
- the cancellation request is recorded in `cancelled_at`
- paid access remains entitled until the applicable trial/paid-period boundary
- renewal/due-soon reminders and recurring seat/price synchronization stop
- at the boundary SaMi finalizes the subscription to `cancelled`
- normal paid workspace work then stops
- Billing, account/security and recovery access remain available
- workspace data, files, settings, app data and payment/audit history are
  retained

If there is no valid remaining paid/trial period, cancellation may take effect
immediately.

### Keep the subscription

Before a scheduled cancellation reaches its effective boundary, a billing
manager may choose **Keep subscription**. SaMi clears the pending cancellation
and restores provider renewal where the provider supports recurring billing.

After cancellation has already taken effect, it cannot be "undone". Instead,
the owner may reactivate the paid subscription, which returns it to
payment-recovery state; verified payment starts a new paid period.

### Move an ended subscription to Free

An ended paid subscription may be explicitly moved to Free without first
reactivating paid billing, but only after the workspace fits Free's plan
capacity:

- no more than one active internal user
- no more than one installed business app, including required dependencies
- one active company

This explicit capacity-checked transition is different from subscription
cancellation itself. SaMi never silently deletes users, apps, companies, files
or business data to force a cancelled workspace into Free.

## Past-due workspace suspension

A paid workspace remains fully operational during its valid trial or paid
period. When its effective subscription status becomes `past_due`, SaMi
switches the workspace into recovery-only mode.

Available while suspended:

- sign in and sign out
- personal account and security
- Billing and payment recovery
- Help/support

Paused while suspended:

- dashboard business work
- business apps and business records
- Files, Search and Activity
- Messages and ordinary Notification Center work
- SaMi AI execution
- Automation and Integrations
- Developer API
- app installation/enabling
- adding/reactivating internal users
- creating/reactivating companies

SaMi does not delete tenant data or uninstall apps during billing suspension.
A verified successful payment returns the subscription to `active`; normal
workspace access is then restored automatically from the subscription state.

Critical billing notifications are sent to workspace owners through SaMi's
shared communications service, including transactional SMS when an SMS provider
is configured.

## Dependency and access order

Business app authority follows:

```text
registered app
  → required dependency graph
  → subscription entitlement
  → seat / plan capacity
  → workspace permission
  → company scope
  → install / use
```

A required dependency counts toward Free's one-app allowance. Optional
dependencies do not.

Custom-only capabilities such as multi-company and Developer API are enforced
below the UI. Role permissions alone cannot bypass the commercial plan.

## Transactional communication

SaMi uses one trusted notification pipeline for in-app alerts, email and SMS.

- Ordinary workspace messages and announcements follow each user's Email/SMS notification preferences.
- Critical billing and account-security events force in-app + transactional email + transactional SMS.
- SMS providers are selected with `SAMI_SMS_PROVIDER`.
- Africa's Talking and Twilio are supported by the current provider layer.
- A branded SMS sender such as `SaMi` requires provider/mobile-network approval before production use.
- Email uses the shared SMTP transport configured with `SMTP_*`, `EMAIL_FROM` and `EMAIL_REPLY_TO`.

## Past-due dunning and suspension

SaMi uses a platform-wide dunning lifecycle rather than immediately deleting or dismantling a workspace when payment becomes overdue.

- The default grace period is 14 days.
- Override it with `SAMI_BILLING_PAST_DUE_GRACE_DAYS` (0–90).
- Billing reconciliation sends due-soon reminders before the billing boundary.
- After the boundary, owners receive overdue and final-warning notifications.
- Critical billing notices are delivered through in-app, transactional email and transactional SMS.
- During grace, normal workspace work remains available.
- After grace expires, normal business work is suspended platform-wide.
- Sign-in, personal account/security, Billing, payment recovery, Help and logout remain available.
- Workspace data, configuration and installed-app state are retained.
- Verified successful payment changes the subscription back to active; normal access is restored automatically.
- A failed checkout does not shorten an already-paid period. Dunning begins only after the applicable trial or paid-period boundary has expired.

## Internal reconciliation

The internal billing reconciliation route is:

```text
POST /api/internal/billing/reconcile
```

and requires:

```env
SAMI_BILLING_WORKER_SECRET=...
```

This worker reconciles effective billing state and provider-pinned recurring
price/seat quantities. It never relies on a browser session.

## Category 23 boundary

Category 22 defines the commercial entitlement contract.

Category 23 owns metering and hard usage enforcement for costly resources such
as:

- AI usage
- storage/cloud usage
- other metered resource allowances

A `null` quota in Category 22 is not an unlimited-cost promise. Its quota mode
describes how Category 23 must enforce it.
