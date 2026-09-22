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
