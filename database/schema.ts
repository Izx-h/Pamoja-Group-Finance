import {
  bigint,
  boolean,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** User identity remains the starter's Manus OAuth identity. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userSecurity = mysqlTable("user_security", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  encryptedTotpSecret: text("encryptedTotpSecret"),
  totpEnabled: boolean("totpEnabled").default(false).notNull(),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("user_security_user_uq").on(table.userId)]);

export const groups = mysqlTable("groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("type", ["merry_go_round", "rotating_savings", "accumulated_savings", "sacco", "investment"]).notNull(),
  description: text("description"),
  registrationDetails: text("registrationDetails"),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("groups_created_by_idx").on(table.createdByUserId)]);

export const groupRoles = mysqlTable("group_roles", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  roleKey: varchar("roleKey", { length: 64 }).notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  permissions: json("permissions").$type<string[]>().notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("group_roles_group_key_uq").on(table.groupId, table.roleKey)]);

export const groupMembers = mysqlTable("group_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  roleId: int("roleId").notNull().references(() => groupRoles.id, { onDelete: "restrict" }),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  status: mysqlEnum("status", ["invited", "active", "suspended", "exited"]).default("active").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, table => [
  index("group_members_group_idx").on(table.groupId),
  index("group_members_user_idx").on(table.userId),
  uniqueIndex("group_members_group_user_uq").on(table.groupId, table.userId),
]);

export const groupSettings = mysqlTable("group_settings", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  approvalThreshold: int("approvalThreshold").default(2).notNull(),
  approvalRoleKeys: json("approvalRoleKeys").$type<string[]>().notNull(),
  prohibitSelfApproval: boolean("prohibitSelfApproval").default(true).notNull(),
  allowOverpayments: boolean("allowOverpayments").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("group_settings_group_uq").on(table.groupId)]);

export const contributionSchedules = mysqlTable("contribution_schedules", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  frequency: mysqlEnum("frequency", ["weekly", "biweekly", "monthly", "quarterly", "annual"]).notNull(),
  dueDay: int("dueDay").default(1).notNull(),
  lateAfterDays: int("lateAfterDays").default(0).notNull(),
  startsOn: timestamp("startsOn").notNull(),
  endsOn: timestamp("endsOn"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("contribution_schedules_group_active_idx").on(table.groupId, table.active)]);

/** One row is one member's obligation for a schedule period. */
export const contributions = mysqlTable("contributions", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  memberId: int("memberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  scheduleId: int("scheduleId").notNull().references(() => contributionSchedules.id, { onDelete: "restrict" }),
  periodKey: varchar("periodKey", { length: 32 }).notNull(),
  dueDate: timestamp("dueDate").notNull(),
  amountDueMinor: bigint("amountDueMinor", { mode: "number" }).notNull(),
  amountPaidMinor: bigint("amountPaidMinor", { mode: "number" }).default(0).notNull(),
  status: mysqlEnum("status", ["pending", "partially_paid", "settled", "late", "failed", "reversed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("contributions_group_member_schedule_period_uq").on(table.groupId, table.memberId, table.scheduleId, table.periodKey),
  index("contributions_group_period_idx").on(table.groupId, table.periodKey),
  index("contributions_member_idx").on(table.memberId),
]);

export const paymentTransactions = mysqlTable("payment_transactions", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").references(() => groups.id, { onDelete: "set null" }),
  memberId: int("memberId").references(() => groupMembers.id, { onDelete: "set null" }),
  contributionId: int("contributionId").references(() => contributions.id, { onDelete: "set null" }),
  provider: mysqlEnum("provider", ["paystack", "sandbox"]).notNull(),
  providerReference: varchar("providerReference", { length: 128 }).notNull(),
  providerTransactionId: varchar("providerTransactionId", { length: 128 }),
  method: mysqlEnum("method", ["mpesa", "pesalink", "card", "bank", "unknown"]).default("unknown").notNull(),
  phone: varchar("phone", { length: 32 }),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  status: mysqlEnum("status", ["pending", "initiated", "processing", "confirmed", "settled", "failed", "reversed", "unmatched"]).default("pending").notNull(),
  checkoutUrl: text("checkoutUrl"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  testOnly: boolean("testOnly").default(false).notNull(),
  confirmedAt: timestamp("confirmedAt"),
  settledAt: timestamp("settledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("payment_provider_reference_uq").on(table.providerReference),
  uniqueIndex("payment_provider_transaction_uq").on(table.providerTransactionId),
  index("payment_group_status_idx").on(table.groupId, table.status),
  index("payment_contribution_idx").on(table.contributionId),
]);

export const paymentEvents = mysqlTable("payment_events", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  eventKey: varchar("eventKey", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  providerReference: varchar("providerReference", { length: 128 }),
  paymentId: int("paymentId").references(() => paymentTransactions.id, { onDelete: "set null" }),
  signatureValid: boolean("signatureValid").notNull(),
  verificationStatus: varchar("verificationStatus", { length: 32 }).default("pending").notNull(),
  payload: json("payload").$type<Record<string, unknown>>(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, table => [uniqueIndex("payment_event_provider_key_uq").on(table.provider, table.eventKey), index("payment_event_reference_idx").on(table.providerReference)]);

export const reconciliationRecords = mysqlTable("reconciliation_records", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  paymentId: int("paymentId").notNull().references(() => paymentTransactions.id, { onDelete: "restrict" }),
  contributionId: int("contributionId").references(() => contributions.id, { onDelete: "set null" }),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  action: mysqlEnum("action", ["matched", "rejected", "reversed"]).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("reconciliation_group_payment_idx").on(table.groupId, table.paymentId)]);

export const payoutSchedules = mysqlTable("payout_schedules", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  contributionScheduleId: int("contributionScheduleId").notNull(),
  periodKey: varchar("periodKey", { length: 32 }).notNull(),
  beneficiaryMemberId: int("beneficiaryMemberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  sequence: int("sequence").notNull(),
  payoutDate: timestamp("payoutDate").notNull(),
  expectedAmountMinor: bigint("expectedAmountMinor", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["scheduled", "eligible", "paid", "deferred"]).default("scheduled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  foreignKey({
    name: "payout_schedule_contribution_schedule_fk",
    columns: [table.contributionScheduleId],
    foreignColumns: [contributionSchedules.id],
  }).onDelete("restrict").onUpdate("no action"),
  uniqueIndex("payout_schedule_group_sequence_uq").on(table.groupId, table.sequence),
  index("payout_schedule_group_date_idx").on(table.groupId, table.payoutDate),
  index("payout_schedule_contribution_period_idx").on(table.groupId, table.contributionScheduleId, table.periodKey),
]);

export const payouts = mysqlTable("payouts", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: varchar("transactionId", { length: 64 }).notNull(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "restrict" }),
  scheduleId: int("scheduleId").references(() => payoutSchedules.id, { onDelete: "set null" }),
  beneficiaryMemberId: int("beneficiaryMemberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["draft", "pending_approval", "approved_waiting_funds", "approved", "processing", "settled", "failed", "cancelled"]).default("pending_approval").notNull(),
  initiatedByUserId: int("initiatedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  providerReference: varchar("providerReference", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("payout_transaction_id_uq").on(table.transactionId), uniqueIndex("payout_schedule_unique_uq").on(table.scheduleId), index("payout_group_status_idx").on(table.groupId, table.status)]);

export const payoutApprovals = mysqlTable("payout_approvals", {
  id: int("id").autoincrement().primaryKey(),
  payoutId: int("payoutId").notNull().references(() => payouts.id, { onDelete: "cascade" }),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: mysqlEnum("decision", ["approved", "rejected"]).notNull(),
  transactionId: varchar("transactionId", { length: 64 }).notNull(),
  amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
  beneficiaryMemberId: int("beneficiaryMemberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("payout_approval_payout_user_uq").on(table.payoutId, table.userId), index("payout_approval_group_idx").on(table.groupId)]);

export const loanProducts = mysqlTable("loan_products", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  annualRateBps: int("annualRateBps").default(0).notNull(),
  maxAmountMinor: bigint("maxAmountMinor", { mode: "number" }).notNull(),
  termMonths: int("termMonths").notNull(),
  requiresGuarantors: int("requiresGuarantors").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("loan_products_group_active_idx").on(table.groupId, table.active)]);

export const loanApplications = mysqlTable("loan_applications", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  memberId: int("memberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  productId: int("productId").notNull().references(() => loanProducts.id, { onDelete: "restrict" }),
  requestedAmountMinor: bigint("requestedAmountMinor", { mode: "number" }).notNull(),
  approvedAmountMinor: bigint("approvedAmountMinor", { mode: "number" }),
  status: mysqlEnum("status", ["submitted", "under_review", "approved", "rejected", "withdrawn", "disbursed"]).default("submitted").notNull(),
  purpose: text("purpose"),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id, { onDelete: "set null" }),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("loan_applications_group_status_idx").on(table.groupId, table.status), index("loan_applications_member_idx").on(table.memberId)]);

export const loans = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "restrict" }),
  applicationId: int("applicationId").notNull().references(() => loanApplications.id, { onDelete: "restrict" }),
  memberId: int("memberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  principalMinor: bigint("principalMinor", { mode: "number" }).notNull(),
  interestMinor: bigint("interestMinor", { mode: "number" }).notNull(),
  outstandingPrincipalMinor: bigint("outstandingPrincipalMinor", { mode: "number" }).notNull(),
  outstandingInterestMinor: bigint("outstandingInterestMinor", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["pending_disbursement", "active", "repaid", "defaulted"]).default("pending_disbursement").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("loans_application_uq").on(table.applicationId), index("loans_group_status_idx").on(table.groupId, table.status)]);

export const loanRepayments = mysqlTable("loan_repayments", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  loanId: int("loanId").notNull().references(() => loans.id, { onDelete: "restrict" }),
  paymentId: int("paymentId").references(() => paymentTransactions.id, { onDelete: "set null" }),
  principalMinor: bigint("principalMinor", { mode: "number" }).notNull(),
  interestMinor: bigint("interestMinor", { mode: "number" }).notNull(),
  paidAt: timestamp("paidAt"),
  status: mysqlEnum("status", ["pending", "confirmed", "reversed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("loan_repayments_group_loan_idx").on(table.groupId, table.loanId)]);

export const guarantors = mysqlTable("guarantors", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull().references(() => loanApplications.id, { onDelete: "cascade" }),
  guarantorMemberId: int("guarantorMemberId").notNull().references(() => groupMembers.id, { onDelete: "restrict" }),
  status: mysqlEnum("status", ["requested", "accepted", "declined"]).default("requested").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("guarantors_application_member_uq").on(table.applicationId, table.guarantorMemberId)]);

export const ledgerAccounts = mysqlTable("ledger_accounts", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 48 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("type", ["asset", "liability", "equity", "income", "expense"]).notNull(),
  isCash: boolean("isCash").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("ledger_accounts_group_code_uq").on(table.groupId, table.code)]);

export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "restrict" }),
  transactionId: varchar("transactionId", { length: 64 }).notNull(),
  sourceType: varchar("sourceType", { length: 48 }).notNull(),
  sourceId: varchar("sourceId", { length: 128 }).notNull(),
  description: text("description").notNull(),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  reversalOfId: int("reversalOfId").references((): any => journalEntries.id, { onDelete: "restrict" }),
  postedByUserId: int("postedByUserId").references(() => users.id, { onDelete: "set null" }),
  postedAt: timestamp("postedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("journal_entries_transaction_uq").on(table.groupId, table.transactionId),
  uniqueIndex("journal_entries_source_uq").on(table.groupId, table.sourceType, table.sourceId),
  index("journal_entries_group_date_idx").on(table.groupId, table.postedAt),
]);

export const journalLines = mysqlTable("journal_lines", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
  accountId: int("accountId").notNull().references(() => ledgerAccounts.id, { onDelete: "restrict" }),
  lineNumber: int("lineNumber").notNull(),
  debitMinor: bigint("debitMinor", { mode: "number" }).default(0).notNull(),
  creditMinor: bigint("creditMinor", { mode: "number" }).default(0).notNull(),
  description: varchar("description", { length: 255 }),
}, table => [uniqueIndex("journal_lines_entry_line_uq").on(table.journalEntryId, table.lineNumber), index("journal_lines_account_idx").on(table.accountId)]);

export const custodianAccounts = mysqlTable("custodian_accounts", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  institutionName: varchar("institutionName", { length: 160 }).notNull(),
  accountReferenceMasked: varchar("accountReferenceMasked", { length: 80 }),
  currency: varchar("currency", { length: 3 }).default("KES").notNull(),
  verifiedBalanceMinor: bigint("verifiedBalanceMinor", { mode: "number" }).default(0).notNull(),
  verifiedAt: timestamp("verifiedAt"),
  verificationSource: varchar("verificationSource", { length: 120 }),
  isDevelopmentMock: boolean("isDevelopmentMock").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("custodian_group_verified_idx").on(table.groupId, table.verifiedAt)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").references(() => groups.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: mysqlEnum("channel", ["in_app", "email", "sms", "whatsapp"]).default("in_app").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["queued", "sent", "failed", "read"]).default("queued").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notifications_user_status_date_idx").on(table.userId, table.status, table.createdAt), index("notifications_group_date_idx").on(table.groupId, table.createdAt)]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").references(() => groups.id, { onDelete: "cascade" }),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 128 }),
  details: json("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("audit_group_date_idx").on(table.groupId, table.createdAt), index("audit_entity_idx").on(table.entityType, table.entityId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
