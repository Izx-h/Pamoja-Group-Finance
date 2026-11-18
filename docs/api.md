# API reference — Pamoja Group Finance

The Express server mounts the typed tRPC router at `/api/trpc`. Procedures require the existing Manus OAuth application session except the `auth.me`, `auth.logout`, system routes, and explicit REST endpoints. Inputs are validated with Zod; money arguments and returns use integer KES minor units. Every group operation must authorize the requested active group and its action-specific role permission on the server. Do not infer authorization from navigation visibility.

## Group and contribution operations

- `groups.list`, `groups.create`, `groups.dashboard`: list groups accessible to the session, create an independent group with its default roles/settings, and return a scoped summary. Without `contributions:read_all`, current obligation rows, derived contribution totals, and pending-payment counts are limited to the signed-in member. Ledger, loan-asset, custodian, and liquidity aggregates are returned only to roles with `ledger:read_all` or `ledger:read_summary`.
- `groups.members`, `groups.addMember`, `groups.assignMemberRole`: list/add members and assign a group role. The backend guards group scope and last-manager access.
- `groups.schedules`, `groups.createSchedule`, `groups.generateCurrentPeriod`, `groups.contributions`: configure schedules, generate current-period member obligations, and read group-authorized obligations.
- `finance.paymentIntent`: create a unique server-side payment instruction for an eligible contribution. Test-only mode is explicit; no local/test event can post a real contribution.
- `finance.payments`: list transactions visible to the member or, with reconciliation permission, the active group.

## Payment and reconciliation operations

- REST `POST /api/webhooks/paystack`: receives a raw JSON body, validates the Paystack HMAC-SHA512 signature using the server-side secret, idempotently persists the event, and independently verifies `charge.success` by querying the provider. Only a verified, exact-reference, exact-KES-amount, exact-currency, non-test payment can update an obligation and post a journal. Retries of persisted `received` or `verification_failed` events are reprocessed; terminal duplicates are acknowledged without posting twice. Referenced unrecognized event types are classified `unknown_event`; signed events without a reference are flagged `unmatched`. Duplicate provider transaction IDs are quarantined as unmatched.
- `finance.unmatched`: returns group-scoped unmatched transactions to users with `reconciliation:manage`.
- `finance.resolveUnmatched`: manually maps only a provider-verified, non-test, group-linked Paystack transaction to an obligation in that same group. The mutation locks affected records, applies the group overpayment policy, posts a balanced journal, records the reason/actor, and notifies the linked member.
- `finance.reconciliationHistory`: reads the audited reconciliation history for a group payment.
- `finance.providerReviewEvents`: shows associated nonfinal/unknown provider events, refund/dispute/reversal notices, and verification/duplicate anomalies for group reconciliation managers. Such events do not automatically alter balances or append a reversal.
- `finance.unlinkedProviderEvents`: metadata-only (no provider payload) view of unlinked signed events for platform administrators.

## Ledger, rotation, payouts, and loans

- `finance.ledger`: group-scoped ledger data for roles with `ledger:read_all` or `ledger:read_summary`. Detailed roles receive journal entries and lines; summary-only roles receive aggregate account totals without transaction references or member allocations.
- `rotations.list`, `rotations.create`, `rotations.refreshEligibility`: read/create rotation orders and refresh collection eligibility. A scheduled beneficiary is not a payout confirmation.
- `finance.payouts`, `finance.initiatePayout`, `finance.approvePayout`: create an approval request and record exact-payload administrator approvals. Each approver must have the group permission, pass the TOTP check, satisfy role/self-approval policy, and be unique per payout. The transaction ID, amount and beneficiary are compared to the persisted request. Approval/funds checks are serialized on the group settings record and only fresh non-mock custodian balances are considered; previously approved requests and pending loan reservations reduce the available amount. Notification and audit writes are atomic with the request/approval. No endpoint submits a transfer or marks a payout settled.
- `loans.list`, `loans.createProduct`, `loans.submitApplication`, `loans.review`: configure a product, submit an application, and record a review. Members receive only their own applications and active-loan details; reviewers can access group applications and loans. Products requiring guarantors are unavailable to applicants because that workflow is not supported. Approval requires recent verified funds, reserves a pending-disbursement loan amount, and records interest using the product’s configured annual rate and term. The current calculation uses simple annual-rate pro-rating with integer-minor-unit half-up rounding. It does not authorize or send a disbursement and no repayment API is currently enabled.

## Settings, security, and notifications

- `settings.get`, `settings.update`, `settings.updateRole`: read and update group governance settings/role permission sets.
- `security.status`, `security.beginTotp`, `security.confirmTotp`, `security.disableTotp`: enroll/confirm/remove a TOTP authenticator; secrets are encrypted server-side. Re-enrollment of an enabled authenticator requires reauthentication.
- `notifications.list`: return only the signed-in user’s latest in-app notifications and unread count.
- `notifications.markRead`: mark a notification read only when it belongs to the signed-in user. Email, SMS, and WhatsApp are not delivered by this MVP.

## REST infrastructure endpoints

- `GET /api/health` returns `{ "status": "ok" }` for readiness.
- `GET /manus-routes.json` serves the static page route manifest for the website origin.
- `GET /api/platform/config.js` returns platform-provided browser-safe configuration only.

## Error handling and idempotency notes

A successful mutation response means the described internal record/state change committed, not that external funds moved. Provider-confirmed collections are presented as receivables until custody verification is available. The webhook deduplicates provider/event keys and provider transaction IDs; retryable persisted events are reprocessed, while completed/terminal events are not posted twice. Payout requests enforce a unique schedule slot and approval user; application decisions lock the application and group approval settings, and pending loans reserve verified KES liquidity. Reconciliation and journal writes use database transactions and retain audit provenance.

Do not retry an ambiguous provider call by inventing a new success event. Query the provider using the original unique reference and resolve only through the signed-webhook/independent-verification path. Refunds, disputes, unmatched unlinked events, provider support intervention, and financial statement exports remain operationally incomplete; check [TODO.md](../TODO.md) before relying on a feature not expressly listed above. Application-level rate limiting has not been implemented; do not treat this MVP as ready for broad public production access until rate limiting and related abuse controls are added.
