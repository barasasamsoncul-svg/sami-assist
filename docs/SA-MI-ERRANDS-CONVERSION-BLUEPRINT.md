# SaMi Errands — Product Conversion Blueprint

## Goal
Convert SaMi from an ERP-style application into a mobile-friendly, multi-sided errands marketplace. Do not require a custom domain to develop or test; use the existing preview deployment until the product is ready.

## Hosting and database constraints
- Target ordinary managed shared hosting comparable to a cPanel package; do not require the founder to administer a VPS or server.
- Do not add a paid standalone database service by default.
- Use the database included in the eventual hosting package if it supports the selected application stack.
- Confirm the selected hosting plan's actual Node.js/Next.js support and deployment model before committing to the runtime. Truehost currently advertises Node.js support on shared hosting, but package-level compatibility must be checked.
- Existing application uses Next.js and PostgreSQL. Do not assume it can run on all shared-hosting plans or that a switch to MySQL is trivial.
- Do not migrate, drop, or overwrite production data as part of the product rebrand.

## Product roles
1. Customers: create errands, supply task details and locations, review and approve quotes, track progress, confirm completion, access history and receipts, and raise disputes.
2. Providers/runners: create provider profiles, set skills/categories/service areas/availability, receive invitations or assignments, accept or decline within policy, update job status, provide completion evidence, and track earnings and fees.
3. Operations/admin: review providers and requests, price tasks, assign/reassign providers, monitor deadlines, resolve cancellations/disputes, reconcile payments, and manage categories, service areas, policies and reporting.

## Errand categories
- Pickups and deliveries
- Shopping and authorized purchases
- Personal and administrative errands
- Business and office errands
- Service coordination and approved practical assistance
- Other legitimate tasks routed to manual review when the category or risk is unclear

Regulated or unsafe tasks must not be automatically accepted.

## Core workflow
1. Customer submits a task with description, locations, timing, size/cost details where relevant, and supporting instructions.
2. Server validates task eligibility and service area and calculates or prepares a quote.
3. Customer approves the quote and applicable payment terms.
4. Request enters an assignment queue.
5. Admin assigns a suitable provider initially; automated matching may be introduced later.
6. Provider accepts and sees only the information needed for that assigned job.
7. Provider records progress and submits completion evidence.
8. Customer confirms completion or raises an issue.
9. Platform records payment reconciliation, provider earnings/fees, receipts, feedback and audit history.

Handle no provider available, rejection, reassignment, cancellation, delay, failed completion, dispute and duplicate/out-of-order payment notifications.

## Initial release
- Public SaMi Errands landing pages and clear service explanation
- Customer registration/login and customer dashboard
- Provider registration/profile and provider dashboard
- Admin operations dashboard
- Errand request, quote approval, assignment, status history and completion proof
- Payment status records and receipts; add a gateway only after its requirements and costs are verified
- Notifications appropriate to the launch stage
- Responsive mobile and desktop layout
- Authorization, audit logging, backup and recovery plan

## Existing modules: disposition approach
- Landing/navigation: redesign for SaMi Errands.
- CRM: reuse only the customer/provider records and contact functions that fit.
- Sales/quotes: assess whether pricing and quote logic can be safely adapted.
- Invoicing: assess receipts and transaction records for reuse.
- Accounting: retain only required internal reconciliation/reporting.
- Inventory and unrelated ERP modules: remove from active navigation only after dependency and route checks; do not delete source code blindly.
- Authentication, permissions, APIs, database schemas, integrations and migrations: inspect before changing.

## Hosting and release strategy
- Develop and test on a non-production branch and existing preview infrastructure first.
- Keep the current production deployment and database intact until a rollback plan is verified.
- Before buying a domain, test the application through a preview URL.
- Before choosing shared hosting, verify support for the runtime, persistent database connections, environment variables, background tasks, scheduled work, uploads, SSL, backups and resource limits.
- Prefer a hosting-included PostgreSQL/MySQL database where compatible. Any database engine change requires an explicit migration plan and verified backups.
- Only connect a purchased domain after the build, customer/provider/admin workflows and hosting fit have been validated.

## Acceptance criteria
- Customer can create and follow an errand end to end.
- Provider can register, receive/accept an assignment, update it and submit completion evidence.
- Admin can price, assign/reassign and resolve exceptions.
- Customer/provider data access is enforced server-side.
- Pricing and payment state cannot be trusted solely from client input.
- Core workflow and failure cases are tested on mobile and desktop.
- Existing production data and deployment remain recoverable.
- Target hosting can run the actual app without introducing a VPS requirement.
