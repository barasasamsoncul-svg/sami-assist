# SaMi Communications

SaMi communications are a shared platform service used by every business app.
ERP, CRM, HR, marketing, support, collaboration and future apps must use the
same notification pipeline rather than implementing private email/SMS logic.

## Channels

SaMi currently supports:

- in-app notifications
- email notifications
- SMS notifications
- delivery state in `notification_deliveries`

Ordinary workspace alerts follow the user's notification preferences for both
email and SMS.

Critical service alerts are transactional and are not controlled by ordinary
notification opt-outs. Critical events explicitly request both email and SMS;
each configured transport records its own delivery result. Examples include:

- subscription payment failed / succeeded
- workspace suspended for overdue payment
- password changed
- sign-in email changed
- two-factor authentication enabled / disabled

Critical alerts can use in-app, email and SMS because they protect account or
service continuity.

## Messages and announcements

Direct messages and company announcements already create SaMi notifications.
If a user enables email and/or SMS notifications, those communication events
use the same shared delivery pipeline. Email may carry the richer SaMi
notification; SMS stays concise and does not copy private workspace message
bodies onto the carrier channel.

Business apps should emit trusted SaMi notifications instead of calling an SMS
provider directly.

## Email transport

Email is a first-class SaMi notification channel, not a separate fallback.
The same trusted notification emitter used by Billing, Security, Messages and
future business apps queues an `email` delivery record and sends through the
central SMTP transport.

Required production SMTP configuration:

```env
APP_URL=https://your-sami-domain.example
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASSWORD=<smtp-password>
EMAIL_FROM=SaMi <notifications@your-sami-domain.example>
EMAIL_REPLY_TO=<support-or-no-reply-address>
```

`EMAIL_FROM` is optional when `SMTP_USER` is already a valid sender, but a
dedicated SaMi sender identity is recommended. In production, SaMi treats
missing SMTP configuration as a delivery configuration error rather than
silently pretending email was sent.

Workspace notification email is SaMi-branded, includes the configured SaMi
logo and an `Open in SaMi` action. Security-code and verification emails keep
their stricter dedicated templates while sharing the trusted SMTP transport.

## SMS provider selection

The provider is selected through:

```env
SAMI_SMS_PROVIDER=africastalking
```

Supported values:

- `africastalking`
- `twilio`

If the variable is absent, SMS delivery is disabled while in-app/email continue
to function.

### Phone normalization

SaMi stores user phone numbers on the account and sends providers E.164-style
numbers.

For Kenya:

```env
SAMI_SMS_DEFAULT_COUNTRY_CODE=254
```

This lets a profile number such as `0712345678` normalize to
`+254712345678`.

### Africa's Talking

Sandbox:

```env
SAMI_SMS_PROVIDER=africastalking
SAMI_SMS_DEFAULT_COUNTRY_CODE=254
AFRICASTALKING_ENVIRONMENT=sandbox
AFRICASTALKING_USERNAME=sandbox
AFRICASTALKING_API_KEY=<sandbox-api-key>
```

Production:

```env
SAMI_SMS_PROVIDER=africastalking
SAMI_SMS_DEFAULT_COUNTRY_CODE=254
AFRICASTALKING_ENVIRONMENT=production
AFRICASTALKING_USERNAME=<application-username>
AFRICASTALKING_API_KEY=<production-api-key>
AFRICASTALKING_SENDER_ID=SaMi
```

`AFRICASTALKING_SENDER_ID` must be a sender ID approved for the networks where
SaMi will send branded messages. Until the sender is approved, omit it rather
than pretending the SaMi brand is available.

`AFRICASTALKING_SMS_ENDPOINT` is optional and is intended only for controlled
provider endpoint overrides. Normal deployments should leave it unset.

### Twilio

```env
SAMI_SMS_PROVIDER=twilio
SAMI_SMS_DEFAULT_COUNTRY_CODE=254
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>

# Use one:
TWILIO_MESSAGING_SERVICE_SID=<messaging-service-sid>
# TWILIO_FROM_NUMBER=<e164-number>
```

## Provider boundary

SaMi application services never own Africa's Talking or Twilio credentials.
They create a trusted SaMi notification; the communications service resolves
the selected provider from environment configuration.

Changing the SMS provider therefore does not change Messages, Billing, Security
or any future business app's notification code.
