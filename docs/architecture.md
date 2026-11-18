# Pamoja MVP — Architecture and implementation plan

## Scope and hosting choices

The first release is a ledger-first group-finance application. It will prioritize group isolation, group/member administration, contribution schedules and obligations, payment-event recording and reconciliation, append-only journals, transparent summaries, and a merry-go-round approval foundation. Loan functionality is a foundation only. The system does not claim to hold funds, provide escrow, or execute payouts without an approved provider and verified provider result.

The initialized Manus Webdev starter supplies React + TypeScript + Tailwind, Express, tRPC, Drizzle, Manus OAuth, and a managed MySQL-compatible database. This is a concrete platform constraint against the preferred Next.js/FastAPI/PostgreSQL/Supabase stack. The MVP retains TypeScript, React, Tailwind, an authenticated server API, Drizzle migrations, and durable relational persistence, and uses the platform-managed MySQL service to make the initialized app actually operable. This alternative and its SQL dialect are explicit; the domain model uses portable relational types and integer minor currency units where practical. A future PostgreSQL adapter can preserve the domain services, but this release does not claim PostgreSQL compatibility without a port and migration.

Authentication uses the starter's Manus OAuth and application session. There is no invented demo user or development bypass. Groups and roles are application data. Secrets such as a future Paystack test key remain server-side environment variables; no provider key is required for local development and no live payment is enabled by default.

## Core transaction flow

A group admin creates a group, invites or records its members, configures contribution rules, and generates period obligations. A member can see only their group-authorized data. A payment initiation creates a unique provider reference and a pending payment instruction. Provider webhooks are signature-checked, deduplicated, and independently verified against Paystack before any payment event is eligible for reconciliation. An authenticated administrator may resolve an existing unmatched, verified event; the resolution is audited.

A financial event posts through one domain service in a database transaction. The service validates source state, tenant scope, and amount; writes a unique journal header and immutable debit/credit lines; checks the total debits equal credits; and commits state changes and audit events together. Reversals use new journal entries. The double-entry ledger tracks accounting claims; it is not itself evidence that a custodian holds cash. Pay-out requests remain pending until approval, available-funds and eligibility checks pass. A provider transfer must return verified final status before the payout is marked settled or a settlement journal is posted.

## Data model and boundaries

- `users` preserve the starter's OAuth identity.
- `groups`, `group_members`, `group_roles`, and `group_settings` hold isolated group identity, membership, configurable permissions and governance rules.
- `contribution_schedules`, `contributions`, `payment_transactions`, `payment_events`, and `reconciliation_records` represent the schedule, member obligations, provider instructions/events, and audited matching decisions. Payment allocations make partial contributions and overpayments explicit.
- `payout_schedules`, `payouts`, and `payout_approvals` represent the rotation, request, exact approval payload, and provider execution/settlement states.
- `loan_products`, `loan_applications`, `loans`, `loan_repayments`, and `guarantors` provide the extensible loan workflow and distinguish principal from interest.
- `ledger_accounts`, `journal_entries`, and `journal_lines` form the append-only double-entry ledger.
- `custodian_accounts` describe an external institution and the verification date/source of its reported balance; they do not create custody.
- `notifications` and `audit_logs` retain delivery/state-change metadata and administrative actions.

All monetary values are integer minor units (KES cents), never binary floating-point. Every row and every query that contains group information is scoped to a group the caller is authorized to access. The shared managed database is used by development and publication, so tests must not seed/delete production-shared data. Schema changes are additive and migration-controlled.

## Project structure

- `frontend/src/pages/` contains dashboard pages for groups, contributions, reconciliation, rotation/payouts, loans, ledger, and settings.
- `frontend/src/components/` contains shared navigation, responsive tables, cards, status chips, and safe financial summaries.
- `frontend/src/lib/` contains tRPC wiring and client formatting helpers.
- `backend/routers.ts` exposes typed public/authenticated procedures. Group-scoped feature routers call domain services rather than performing accounting inline.
- `backend/domain/` contains pure currency, schedule, permission, reconciliation, approval, loan-calculation, and ledger-invariant logic.
- `backend/services/` contains transactional workflows and the Paystack/provider interface.
- `backend/_core/` remains responsible for OAuth, request context, server boot, platform callbacks, and provider webhook routing.
- `backend/db.ts` owns persistence queries; `database/schema.ts` and committed `database/` migrations define the MySQL-compatible database model.
- `docs/` records the architecture, verified provider/regulatory constraints, and operational setup.
- `frontend/public/manus-routes.json` declares all page routes for Webdev Preview and is kept in sync with the client router.

## Design direction

**Movement:** restrained editorial financial software, adapted for Kenyan collective savings rather than a consumer bank. **Core principles:** numbers remain legible; permissions and status are visible; data density is balanced with whitespace; every financial state has a clear source. **Color philosophy:** warm white and pale stone surfaces reduce visual noise; deep navy conveys administrative clarity; an ownable forest-green accent signals verified/healthy states without implying guaranteed returns. **Layout paradigm:** a left-rail workspace with a narrow contextual header and horizontally grouped work areas; summary cards lead into an aligned activity table, while mobile navigation collapses into a compact menu. **Signature elements:** a linked-ring Pamoja mark; fine ledger rules with aligned currency figures; distinct outlined chips for pending, verified, failed, and internal-only values. **Interaction:** visible asynchronous/pending states, clear confirm language, and no success styling until server-verified; keyboard and touch targets remain comfortable. **Animation:** short, quiet transitions for navigation/loading only; no count-up animations that could imply money arrived; honor reduced-motion preferences. **Typography:** Inter for UI and a tabular-numeral-capable sans (Inter with `font-variant-numeric: tabular-nums`) for balances; compact but readable hierarchy with clear section headings. **Brand essence:** “Shared finances, clear records” for savings groups and cooperatives; grounded, transparent, practical. **Voice:** direct and non-promissory. Example: “Your contribution is recorded after the provider confirms it.” “KES 0 is available to pay out until verified funds are reported.” **Wordmark:** a simple Pamoja wordmark with two offset links meeting at a center point, evoking members connected through a shared ledger. **Signature color:** deep forest green, reserved for verified positive states and key actions.

## Payment and legal constraints

The official-source review and implementation boundary are recorded in [Payments and regulatory notes](payments-and-regulatory.md). Paystack M-Pesa/Pesalink access, merchant settlement, transfers, account limits, and compliance status are account-dependent. The app must not conflate hosted collection with escrow, member custody, or an authorized lending/SACCO activity. Configure sandbox mode only with a real Paystack test key; never invent a successful provider result. Live external transfers remain disabled until proper onboarding, provider approval, and legal/regulatory review are completed.

## Environment variables

- `DATABASE_URL` is provided by the managed database at runtime and must not be committed.
- `MANUS_PROJECT_ID`, `MANUS_OAUTH_API_URL`, `MANUS_OAUTH_PORTAL_URL`, and `MANUS_JWT_SECRET` are platform-provided for authentication.
- `PAYSTACK_SECRET_KEY` is optional and server-only. Use a Paystack test key (`sk_test_…`) to exercise the sandbox adapter; keep live keys out of non-production environments. If absent, payment initiation reports that provider configuration is unavailable and does not pretend to process a payment.
- `PAYSTACK_WEBHOOK_SECRET` is optional only if the chosen webhook signature configuration requires a distinct value; otherwise document the exact Paystack key used for HMAC signature verification.

## Incremental delivery

The implemented MVP slice includes group creation and membership, contribution obligations and summaries, signed/independently verified Paystack collection handling, unmatched-payment workflows, balanced contribution journals, connected group/ledger views, configurable rotation and payout approval records, a loan-application and pending-reservation foundation, TOTP checks, audit trails, and private in-app notices. Payout transfers, provider settlement/custody verification, reversals, loan disbursement/repayments, email/SMS/WhatsApp, statement exports, and regulatory clearance remain incomplete or disabled. Advanced ML remains advisory-only. Incomplete integrations or regulatory prerequisites are blockers, not finished capabilities.
