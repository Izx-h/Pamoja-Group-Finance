# Pamoja Group Finance

Ledger-first finance workspace for Kenyan SACCOs, chamas, investment groups, and merry-go-round savings groups. It is built on the initialized Manus WebDev project: React 19, TypeScript, Tailwind, Wouter, Express, tRPC, Drizzle ORM, Manus OAuth, and the platform-managed MySQL-compatible database. The platform database is shared between development and published environments.

## Current operating boundary

This MVP provides isolated group workspaces, configurable roles, contribution schedules and obligations, a signed Paystack webhook adapter, independently verified payment reconciliation, double-entry journal posting for confirmed contributions, rotation schedules, governed payout requests, a loan application foundation, TOTP-protected payout approvals, audit events, and private in-app notifications. Payout execution, custody/escrow, loan disbursement/repayment, email/SMS/WhatsApp delivery, reversals, and regulatory licensing are not enabled or claimed. A provider-confirmed collection is a receivable until its settlement is independently verified; it is never shown as verified custodian cash by implication.

See [Architecture](docs/architecture.md), [API reference](docs/api.md), and [Paystack and Kenyan regulatory notes](docs/payments-and-regulatory.md). The detailed, clause-preserving acceptance backlog is [TODO.md](TODO.md); incomplete outcomes remain open.

## Runtime and installation

Use Node.js compatible with the lockfile, pnpm 10.18.0, and the managed Manus environment for OAuth, database connectivity, and platform configuration. Install dependencies with:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

In the configured hosted project, `pnpm dev` starts the Express/Vite application on `PORT` (default 3000). `pnpm start` runs the compiled production server. `/api/health` is an unauthenticated readiness endpoint. Browser requests use relative paths through the WebDev proxy. Standalone local execution does not automatically provide Manus OAuth credentials or the managed database; do not create a demo-auth bypass to work around that limitation.

## Repository layout

- `frontend/` contains the React/Vite application, browser routes, and public assets.
- `backend/` contains the Express/tRPC API, authorization, domain services, integrations, and tests.
- `database/` contains the Drizzle schema, SQL migrations, journal, and snapshots.
- `shared/` contains the small cross-cutting types and client/server-safe contracts. Root-level package and build configuration orchestrates the application.

## Environment and provider setup

The Manus runtime supplies the OAuth/session configuration and `DATABASE_URL`. Do not commit runtime credentials. Optional server-side payment variables:

- `PAYSTACK_SECRET_KEY`: Paystack secret key. An `sk_test_…` key enables provider sandbox calls. With no key in non-production, the app creates clearly labelled local test-only instructions and does not contact a payment provider or credit contributions. In production with no key, payment initiation is refused.
- `PAYSTACK_LIVE_ENABLED`: must be the literal `true` before a non-test key is allowed to initialize a live provider call. This flag is not onboarding, account approval, channel enablement, legal clearance, or authorization to launch. Do not set it until those prerequisites have been independently established.

Paystack webhook endpoint: `POST /api/webhooks/paystack`. Configure that exact HTTPS URL with the provider. The endpoint verifies Paystack’s HMAC-SHA512 signature over the raw request body using the server key, persists event metadata, and independently verifies successful transactions against Paystack before posting a contribution. Persisted `received` and `verification_failed` events can be reprocessed on provider retry; terminal duplicates are acknowledged without duplicate posting. Referenced unknown event types are flagged `unknown_event`; signed events without a reference are flagged `unmatched`. No browser redirect or UI success state is evidence of payment. Provider refund/dispute/reversal notices are retained for review and do not currently generate ledger reversals.

No live provider key was supplied or used for this work. No live collection, payout transfer, custody, escrow, or loan disbursement has occurred.

## Database and migration safety

Schema source is `database/schema.ts`; checked-in SQL and Drizzle snapshots are under `database/`. Generate migrations for review with `pnpm exec drizzle-kit generate` (requires the configured database URL for this project). **Generation is not application.** Review the entire generated SQL and snapshot diff, confirm deployment timing and backups, then use the platform’s controlled migration process.

`pnpm db:migrate` applies checked-in migrations. `pnpm db:push` generates and applies schema changes and is intentionally not part of routine validation. Development, tests, and production share the managed database: do not apply a migration, seed/delete fixtures, or run destructive integration tests as part of development validation. In this project, the checked-in finance migration (`0001`) and notification-index migration (`0002`) have been applied to the shared database. A separate database must be initialized through a controlled migration process; do not assume its migration state or run `db:push` blindly.

## Verification

- `pnpm check` — TypeScript diagnostics.
- `pnpm test` — isolated domain, provider-signature, platform and authentication tests; tests do not seed the shared database.
- `pnpm build` — production frontend/server bundle.

A passing unit suite is not evidence of live Paystack onboarding, custodian statements, settlement timing, a payout transfer, or regulatory authorization. Provider sandbox end-to-end testing requires an authorized test merchant account and credentials.
Application-level request rate limiting and broader abuse controls are not implemented; do not expose this MVP to broad public production use until those controls are added and tested.

## API and application routes

The typed authenticated tRPC API is mounted at `/api/trpc`; page routes are declared in `frontend/public/manus-routes.json` and implemented in `frontend/src/App.tsx`. The webhook and health route are REST endpoints. See [API reference](docs/api.md) for the procedure map, authorization rules, event semantics, and current omissions.

## Deployment checklist

1. Review/approve and apply migrations in a controlled environment only after taking an appropriate backup and verifying the target database.
2. Configure OAuth, database, and protected provider variables in the platform’s secret manager; never expose provider secrets to browser code or logs.
3. Run sandbox payment and webhook tests; review the project’s Paystack and regulatory notes, merchant onboarding, enabled Kenyan channels, settlement/custody model, and applicable legal advice.
4. Keep transfer, custody, and lending capabilities disabled until the required providers, licensing/partner approvals, operations, and reconciliation procedures are established.
5. Run checks and build, verify `/api/health` and `/manus-routes.json`, then checkpoint. Publication is a separate action.
