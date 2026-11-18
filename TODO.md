# Pamoja MVP — Delivery Backlog

All outcomes begin **open**. Update status only when the corresponding behavior is implemented and evidenced; retain the complete acceptance clauses when updating.

## 1. Group registration, membership, roles, and isolation — open

- Register and manage multiple independent groups. Each group stores name, supported type (merry-go-round, rotating savings, accumulated savings, SACCO, or investment group), optional registration details, description, KES currency initially, administrators, members, contribution rules, due dates, late-payment rules, optional payout schedule, optional loan rules, and approval requirements.
- Manage members with registered phone numbers and group membership status. Support configurable governance rather than assuming every group has the same administrator structure. The primary roles are member, chairperson, treasurer, and secretary, with only permissions granted for that group.
- Members can only access records permitted by their membership and privacy settings. Administrators can perform only authorized group actions. One group cannot read or change another group's private financial records.
- Use secure authentication and session handling, role-based permissions, independent approval authentication factors where supported, encryption in transit and at rest, rate limiting, secrets management, audit trails, session management, and safe backup practices. Do not hardcode credentials or expose server secrets to the browser.

## 2. Contribution schedules and member obligations — open

- Configure contribution amount, frequency, due dates, late-payment rules, and active periods for each group. Assign predefined obligations to members and support scheduled contribution periods.
- Calculate expected contributions, amounts received, outstanding balances, partial payments, overpayments, late contributions, and individual histories using integer minor currency units; do not use floating-point money arithmetic.
- Provide a contribution dashboard with member name, registered phone, expected amount, amount contributed, outstanding balance, payment date, payment reference, and status. Supported statuses include pending, initiated, processing, confirmed, settled, partially paid, failed, reversed, and unmatched.
- Support contribution records and statements downloadable by members and administrators, subject to privacy permissions.

## 3. Payment initiation, verification, and reconciliation — open

- Implement Paystack behind a server-side provider abstraction. Any Paystack feature must be verified against current official Kenya documentation and remain conditional on the actual business account's approval and enabled channels. Support M-Pesa and bank methods only where enabled for the specific Kenyan account; do not assume collection implies escrow or custody.
- A member selects a group and amount not exceeding the applicable obligation unless overpayments are allowed. The server creates a unique payment reference and initiates checkout. Provider status is received by a signed webhook and independently verified server-side before contribution balances or posted journals change. Browser success messages alone never confirm payment.
- Verify webhook signatures, enforce idempotency and duplicate-transaction protection, persist payment events and provider references, and handle asynchronous processing, failures, reversals, and unsettled funds. Never simulate a successful external payment or payout.
- Match transactions using the unique reference, registered phone, metadata, expected amount, and timestamp; payer name may support but never determine a match alone. Detect duplicate payments, wrong references, unregistered payers, partial contributions, overpayments, unmatched transactions, and reversals.
- Provide an administrator workflow to resolve unmatched transactions. Every manual match/rejection records the actor, prior and new state, reason, timestamp, and related transaction in an audit log.
- Clearly distinguish verified external custodian-held balances, internal virtual allocations, pending payment instructions, and unsettled payments. A development/test adapter is always labelled and cannot present virtual balances as money held in escrow.

## 4. Append-only double-entry ledger and financial statements — open

- Every posted financial event creates balanced double-entry journal lines within one atomic database transaction. Use integer minor units and unique transaction identifiers. Posted lines are immutable and append-only; corrections use reversing entries rather than deleting or overwriting entries.
- Account for member contributions and savings liabilities, verified custodian cash or payment-clearing assets, loan disbursements and outstanding loan assets, principal repayments, interest repayments and interest income, payout obligations and settlement, fees, refunds, and payment reversals.
- Each journal is traceable to a source event and group. Reject unbalanced entries and duplicate postings. Reconcile ledger balances against verified provider/custodian balances; a virtual accounting allocation is not represented as safeguarded or withdrawable funds.
- Provide a shared group activity ledger for permitted contributions, payouts, loans, repayments, interest, expenses, and current financial position, with date, reference, description, category, amount, status, initiator, approval history, filters, and downloadable reports. Protect private member details.

## 5. Merry-go-round schedules and payout approvals — open

- Groups can define member count, contribution amount and frequency, rotation order, payout dates, beneficiaries, monthly collection progress, and payout completion. The scheduled member becomes eligible only when the collection period is complete. Example: 12 members x KES 10,000 monthly = KES 120,000.
- Configure approval thresholds and multi-administrator rules, including a two-out-of-three approval model. A treasurer may initiate while a chairperson and secretary approve. Each approval is independently authenticated and bound to the exact group, transaction ID, amount, and beneficiary. Prevent self-approval whenever group policy prohibits it.
- Record payout ID, group, beneficiary, amount, initiator, required approvals, provider references, execution status, and settlement status. Before sending a payout instruction, validate all approvals, payout eligibility, and appropriately available funds. Post settlement only after provider confirmation. Notify the recipient and group administrators after relevant state changes.
- Do not execute or claim a payout before all required approvals and actual provider confirmation. If Paystack Kenya cannot support the approved flow, preserve a provider abstraction for a licensed partner and keep execution disabled rather than simulating success.

## 6. Loan management foundation and servicing — open

- Members can apply for a loan, specify amount and product, view deterministic eligibility and terms, and track approved amount, rate, repayment schedule, principal, interest, repayment history, arrears, and settlement statement. Members can submit repayments with provider references.
- Administrators can review, approve or reject applications; set amount, rate, period, guarantor requirements, and monitor arrears. Backend checks eligibility, outstanding loans, loan limits, guarantors, available group funds, and approval permissions.
- Disburse only after authorization and confirmation that funds are available; provider settlement timing governs actual payment availability, including weekends and public holidays. Never create a successful disbursement without provider confirmation.
- Track principal and interest separately. Support repayment schedules, late payments, early repayment, loan settlement statements, and automatic reconciliation of repayments using verified references and transactions.
- Do not assume the platform or group is licensed to lend. Keep lending and disbursement unavailable where the entity's Kenyan regulatory classification and approvals have not been established.

## 7. Financial dashboards, schedules, and notifications — open

- Show total group funds, verified custodian balance, total member savings liabilities, outstanding loan assets, loan repayments received, interest income, pending contributions, pending payouts, available liquidity, monthly income and expenditure, member contribution performance, and loan repayment performance.
- Clearly distinguish available verified cash from outstanding loan assets, payment clearing/receivables, liabilities, internal allocations, and pending instructions. Do not fabricate financial balances.
- Show upcoming merry-go-round payout dates, contribution reminders, successful/failed payments, unmatched receipts, payout approvals, loan application updates, loan disbursements, repayment reminders, and security events. Prepare provider adapters for email, SMS, and WhatsApp without pretending unconfigured delivery occurred.
- Use deterministic reporting and forecasting for the MVP. Future machine-learning risk or cash-flow signals remain advisory and cannot initiate transfers, override approvals, or execute money movement.

## 8. Connected product interfaces and responsive design — open

- Provide a modern, professional, mobile-responsive interface with a light background, deep navy typography, green accent, clear financial visualizations, and usability for members and administrators.
- Connect the landing page, registration/login, group creation, member dashboard, administrator dashboard, contributions, payment reconciliation, merry-go-round, payout authorization, loans, financial ledger, analytics, group settings, and profile/security settings to real backend operations or accurate permission-aware empty states. Do not deliver a static screen collection.
- Users can view permitted financial summaries, individual contribution history, upcoming payout schedules, loan balances and repayment schedules, and download their statements.

## 9. Database, API, testing, and deployment documentation — open

- Maintain a normalized persistent relational schema with foreign keys, indexes, constraints, and group access isolation. Core entities include users, groups, memberships and roles, settings, contribution schedules and obligations, payment transactions/events, reconciliation records, payout schedules/requests/approvals, loan products/applications/loans/repayments/guarantors, ledger accounts/journals/lines, custodian accounts, notifications, and audit logs.
- Deliver backend API documentation, database schema/migrations, installation/deployment instructions, environment-variable documentation, architecture documentation, complete source, and a clear completed/outstanding feature record.
- Automated tests cover authentication, group isolation, contribution calculations, duplicate payments, webhook signatures, reconciliation, partial payments, overpayments, reversals, ledger balancing, payout approval requirements and unauthorized prevention, loan eligibility/disbursement/repayments, concurrent payment events, and transactional integrity. Payment provider integration must be exercised in sandbox before any live deployment.
- Use official provider test/sandbox mode for payments. Keep all provider credentials in protected environment variables. Document that a live Paystack key, merchant activation, method enablement, written use-case approval, and any required partner/regulatory approvals are prerequisites to live transactions.
