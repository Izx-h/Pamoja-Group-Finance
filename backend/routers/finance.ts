import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  auditLogs,
  contributions,
  custodianAccounts,
  groupMembers,
  groupRoles,
  groupSettings,
  journalEntries,
  journalLines,
  ledgerAccounts,
  loans,
  paymentTransactions,
  paymentEvents,
  payoutApprovals,
  payoutSchedules,
  payouts,
  reconciliationRecords,
  users,
} from "../../database/schema";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { getGroupAccess } from "../services/groups";
import { createContributionIntent, resolveUnmatchedPayment } from "../services/payments";
import { verifyUserTotp } from "../services/security";
import { createInAppNotifications } from "../services/notifications";

const groupIdSchema = z.object({ groupId: z.number().int().positive() });
const formatKes = (minor: number) => `KES ${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
async function requireGroup(userId: number, groupId: number, permission?: string) {
  const access = await getGroupAccess(groupId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "This account is not an active member of the requested group." });
  if (permission && !access.permissions.includes(permission)) throw new TRPCError({ code: "FORBIDDEN", message: `The group role does not grant ${permission}.` });
  return access;
}

async function availableVerifiedFunds(db: any, groupId: number) {
  const now = Date.now();
  const accounts = await db.select().from(custodianAccounts).where(and(eq(custodianAccounts.groupId, groupId), eq(custodianAccounts.isDevelopmentMock, false), eq(custodianAccounts.currency, "KES")));
  const balance = accounts.reduce((sum: number, account: typeof accounts[number]) => {
    if (!account.verifiedAt || account.verifiedAt.getTime() > now || now - account.verifiedAt.getTime() > 24 * 60 * 60 * 1000) return sum;
    return sum + account.verifiedBalanceMinor;
  }, 0);
  const reserved = await db.select({ amount: payouts.amountMinor }).from(payouts).where(and(
    eq(payouts.groupId, groupId),
    inArray(payouts.status, ["approved", "approved_waiting_funds", "processing"]),
  ));
  const pendingLoans = await db.select({ amount: loans.principalMinor }).from(loans).where(and(eq(loans.groupId, groupId), eq(loans.status, "pending_disbursement")));
  const totalReserved = [...reserved, ...pendingLoans].reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
  return Math.max(0, balance - totalReserved);
}

export const financeRouter = router({
  paymentIntent: protectedProcedure.input(groupIdSchema.extend({
    contributionId: z.number().int().positive(),
    amountMinor: z.number().int().safe().positive(),
    method: z.enum(["mpesa", "pesalink", "card"]),
    phone: z.string().trim().max(32).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "payments:initiate");
    try {
      return await createContributionIntent({ ...input, userId: ctx.user.id, email: ctx.user.email ?? undefined });
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Could not create payment instruction." });
    }
  }),

  payments: protectedProcedure.input(groupIdSchema).query(async ({ ctx, input }) => {
    const access = await requireGroup(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const isAdmin = access.permissions.includes("reconciliation:manage");
    return db.select({
      id: paymentTransactions.id,
      groupId: paymentTransactions.groupId,
      memberId: paymentTransactions.memberId,
      contributionId: paymentTransactions.contributionId,
      provider: paymentTransactions.provider,
      providerReference: paymentTransactions.providerReference,
      method: paymentTransactions.method,
      amountMinor: paymentTransactions.amountMinor,
      currency: paymentTransactions.currency,
      status: paymentTransactions.status,
      testOnly: paymentTransactions.testOnly,
      createdAt: paymentTransactions.createdAt,
      memberName: groupMembers.fullName,
    }).from(paymentTransactions).leftJoin(groupMembers, eq(paymentTransactions.memberId, groupMembers.id))
      .where(isAdmin ? eq(paymentTransactions.groupId, input.groupId) : and(eq(paymentTransactions.groupId, input.groupId), eq(paymentTransactions.memberId, access.memberId)))
      .orderBy(desc(paymentTransactions.createdAt)).limit(100);
  }),

  unmatched: protectedProcedure.input(groupIdSchema).query(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "reconciliation:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.select({
      payment: paymentTransactions,
      memberName: groupMembers.fullName,
    }).from(paymentTransactions).leftJoin(groupMembers, eq(paymentTransactions.memberId, groupMembers.id))
      .where(and(eq(paymentTransactions.groupId, input.groupId), eq(paymentTransactions.status, "unmatched")))
      .orderBy(desc(paymentTransactions.createdAt));
  }),

  resolveUnmatched: protectedProcedure.input(groupIdSchema.extend({
    paymentId: z.number().int().positive(),
    contributionId: z.number().int().positive(),
    reason: z.string().trim().min(6).max(1000),
  })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "reconciliation:manage");
    try {
      return await resolveUnmatchedPayment({ ...input, actorUserId: ctx.user.id });
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Could not reconcile payment." });
    }
  }),

  ledger: protectedProcedure.input(groupIdSchema).query(async ({ ctx, input }) => {
    const access = await requireGroup(ctx.user.id, input.groupId);
    const canSeeLedger = access.permissions.includes("ledger:read_all") || access.permissions.includes("ledger:read_summary");
    if (!canSeeLedger) throw new TRPCError({ code: "FORBIDDEN", message: "Your group role cannot view the shared ledger." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    if (!access.permissions.includes("ledger:read_all")) {
      const summaries = await db.select({
        accountCode: ledgerAccounts.code,
        accountName: ledgerAccounts.name,
        debitMinor: sql<number>`COALESCE(SUM(${journalLines.debitMinor}), 0)`,
        creditMinor: sql<number>`COALESCE(SUM(${journalLines.creditMinor}), 0)`,
      }).from(ledgerAccounts).leftJoin(journalLines, eq(journalLines.accountId, ledgerAccounts.id))
        .where(eq(ledgerAccounts.groupId, input.groupId)).groupBy(ledgerAccounts.code, ledgerAccounts.name).orderBy(ledgerAccounts.code);
      return { mode: "summary" as const, accounts: summaries.map(row => ({ ...row, debitMinor: Number(row.debitMinor), creditMinor: Number(row.creditMinor) })) };
    }
    const rows = await db.select({
      entryId: journalEntries.id,
      transactionId: journalEntries.transactionId,
      sourceType: journalEntries.sourceType,
      description: journalEntries.description,
      postedAt: journalEntries.postedAt,
      accountCode: ledgerAccounts.code,
      accountName: ledgerAccounts.name,
      debitMinor: journalLines.debitMinor,
      creditMinor: journalLines.creditMinor,
    }).from(journalEntries)
      .innerJoin(journalLines, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(ledgerAccounts, eq(journalLines.accountId, ledgerAccounts.id))
      .where(eq(journalEntries.groupId, input.groupId))
      .orderBy(desc(journalEntries.postedAt), journalLines.lineNumber).limit(300);
    const byEntry = new Map<number, { transactionId: string; sourceType: string; description: string; postedAt: Date; totalDebitMinor: number; totalCreditMinor: number; lines: Array<{ accountCode: string; accountName: string; debitMinor: number; creditMinor: number }> }>();
    for (const row of rows) {
      const existing = byEntry.get(row.entryId) ?? { transactionId: row.transactionId, sourceType: row.sourceType, description: row.description, postedAt: row.postedAt, totalDebitMinor: 0, totalCreditMinor: 0, lines: [] };
      const debit = Number(row.debitMinor);
      const credit = Number(row.creditMinor);
      existing.totalDebitMinor += debit;
      existing.totalCreditMinor += credit;
      existing.lines.push({ accountCode: row.accountCode, accountName: row.accountName, debitMinor: debit, creditMinor: credit });
      byEntry.set(row.entryId, existing);
    }
    return { mode: "detailed" as const, entries: [...byEntry.entries()].map(([id, entry]) => ({ id, ...entry })) };
  }),

  payouts: protectedProcedure.input(groupIdSchema).query(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const rows = await db.select({ payout: payouts, beneficiaryName: groupMembers.fullName })
      .from(payouts).innerJoin(groupMembers, eq(payouts.beneficiaryMemberId, groupMembers.id))
      .where(eq(payouts.groupId, input.groupId)).orderBy(desc(payouts.createdAt));
    const [settings] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
    const payoutIds = rows.map(row => row.payout.id);
    const approvals = payoutIds.length ? await db.select({
      id: payoutApprovals.id,
      payoutId: payoutApprovals.payoutId,
      transactionId: payoutApprovals.transactionId,
      amountMinor: payoutApprovals.amountMinor,
      beneficiaryMemberId: payoutApprovals.beneficiaryMemberId,
      decision: payoutApprovals.decision,
      createdAt: payoutApprovals.createdAt,
      approverName: users.name,
    }).from(payoutApprovals).leftJoin(users, eq(payoutApprovals.userId, users.id)).where(and(eq(payoutApprovals.groupId, input.groupId), inArray(payoutApprovals.payoutId, payoutIds))) : [];
    return {
      approvalThreshold: settings?.approvalThreshold ?? 2,
      approvalRoleKeys: settings?.approvalRoleKeys ?? [],
      payouts: rows.map(row => ({ ...row, approvals: approvals.filter(approval => approval.payoutId === row.payout.id) })),
    };
  }),

  initiatePayout: protectedProcedure.input(groupIdSchema.extend({
    beneficiaryMemberId: z.number().int().positive(),
    scheduleId: z.number().int().positive().optional(),
    amountMinor: z.number().int().safe().positive(),
  })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "payout:initiate");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [beneficiary] = await db.select().from(groupMembers).where(and(eq(groupMembers.id, input.beneficiaryMemberId), eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active"))).limit(1);
    if (!beneficiary) throw new TRPCError({ code: "BAD_REQUEST", message: "Beneficiary must be an active member of this group." });
    if (input.scheduleId) {
      const [schedule] = await db.select().from(payoutSchedules).where(and(eq(payoutSchedules.id, input.scheduleId), eq(payoutSchedules.groupId, input.groupId))).limit(1);
      if (!schedule || schedule.beneficiaryMemberId !== beneficiary.id || schedule.status === "paid" || schedule.expectedAmountMinor !== input.amountMinor) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The rotation schedule is not eligible for this beneficiary." });
      }
      const activeMembers = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
      const obligations = await db.select().from(contributions).where(and(eq(contributions.groupId, input.groupId), eq(contributions.scheduleId, schedule.contributionScheduleId), eq(contributions.periodKey, schedule.periodKey)));
      const eligible = activeMembers.length > 0 && obligations.length === activeMembers.length && obligations.every(obligation => obligation.amountPaidMinor >= obligation.amountDueMinor);
      if (!eligible) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every active member’s linked contribution obligation must be settled before this payout can be requested." });
      const existing = await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.groupId, input.groupId), eq(payouts.scheduleId, schedule.id))).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "A payout request already exists for this rotation slot." });
    }
    const transactionId = randomUUID();
    let id: number;
    try {
      id = await db.transaction(async tx => {
      const [{ id: payoutId }] = await tx.insert(payouts).values({
        transactionId,
        groupId: input.groupId,
        scheduleId: input.scheduleId ?? null,
        beneficiaryMemberId: beneficiary.id,
        amountMinor: input.amountMinor,
        status: "pending_approval",
        initiatedByUserId: ctx.user.id,
      }).$returningId();
      await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "payout.requested", entityType: "payout", entityId: String(payoutId), details: { transactionId, amountMinor: input.amountMinor, beneficiaryMemberId: beneficiary.id } });
      const [governance] = await tx.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
      const roleMembers = await tx.select({ userId: groupMembers.userId, roleKey: groupRoles.roleKey, permissions: groupRoles.permissions }).from(groupMembers).innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id)).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
      const approverIds = roleMembers.filter(row => row.permissions.includes("payout:approve") && (!(governance?.approvalRoleKeys.length) || governance.approvalRoleKeys.includes(row.roleKey))).map(row => row.userId);
      await createInAppNotifications(tx, {
        groupId: input.groupId,
        userIds: [ctx.user.id, beneficiary.userId, ...approverIds],
        type: "payout_requested",
        title: "Payout request recorded",
        body: `A ${formatKes(input.amountMinor)} payout request is awaiting approval. No transfer instruction has been sent.`,
        metadata: { payoutId, transactionId },
      });
      return payoutId;
      });
    } catch (error) {
      if (input.scheduleId) {
        const [existing] = await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.groupId, input.groupId), eq(payouts.scheduleId, input.scheduleId))).limit(1);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "A payout request already exists for this rotation slot." });
      }
      throw error;
    }
    return { id, transactionId, status: "pending_approval" as const, message: "Payout request saved. No payment instruction was sent." };
  }),

  approvePayout: protectedProcedure.input(groupIdSchema.extend({
    payoutId: z.number().int().positive(),
    transactionId: z.string().uuid(),
    amountMinor: z.number().int().safe().positive(),
    beneficiaryMemberId: z.number().int().positive(),
    totpCode: z.string().regex(/^\d{6}$/),
  })).mutation(async ({ ctx, input }) => {
    const access = await requireGroup(ctx.user.id, input.groupId, "payout:approve");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const mfaOk = await verifyUserTotp(ctx.user.id, input.totpCode);
    if (!mfaOk) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Enable TOTP and enter a current authenticator code before approving payouts." });
    return db.transaction(async tx => {
      const [payout] = await tx.select().from(payouts).where(and(eq(payouts.id, input.payoutId), eq(payouts.groupId, input.groupId))).limit(1).for("update");
      if (!payout) throw new TRPCError({ code: "NOT_FOUND", message: "Payout request was not found." });
      if (payout.transactionId !== input.transactionId || payout.amountMinor !== input.amountMinor || payout.beneficiaryMemberId !== input.beneficiaryMemberId) throw new TRPCError({ code: "CONFLICT", message: "Approval details do not match the exact payout request." });
      if (!["pending_approval", "approved_waiting_funds"].includes(payout.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payout is not awaiting approval." });
      const [settings] = await tx.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1).for("update");
      if (settings?.prohibitSelfApproval && payout.initiatedByUserId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Group policy prohibits self-approval." });
      const allowedRoles = settings?.approvalRoleKeys ?? [];
      if (allowedRoles.length && !allowedRoles.includes(access.roleKey)) throw new TRPCError({ code: "FORBIDDEN", message: "This administrator role is not eligible to approve the payout." });
    try {
        await tx.insert(payoutApprovals).values({
        payoutId: payout.id,
        groupId: input.groupId,
        userId: ctx.user.id,
        decision: "approved",
        transactionId: payout.transactionId,
        amountMinor: payout.amountMinor,
        beneficiaryMemberId: payout.beneficiaryMemberId,
      });
    } catch {
      throw new TRPCError({ code: "CONFLICT", message: "This administrator has already approved or rejected this payout." });
    }
    const [{ count }] = await tx.select({ count: sql<number>`COUNT(*)` }).from(payoutApprovals).where(and(eq(payoutApprovals.payoutId, payout.id), eq(payoutApprovals.decision, "approved")));
    const required = settings?.approvalThreshold ?? 2;
    let nextStatus: "pending_approval" | "approved_waiting_funds" | "approved" = "pending_approval";
    if (Number(count) >= required) {
      const availableMinor = await availableVerifiedFunds(tx, input.groupId);
      nextStatus = availableMinor >= payout.amountMinor ? "approved" : "approved_waiting_funds";
    }
      await tx.update(payouts).set({ status: nextStatus, updatedAt: new Date() }).where(eq(payouts.id, payout.id));
      await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "payout.approved", entityType: "payout", entityId: String(payout.id), details: { transactionId: payout.transactionId, amountMinor: payout.amountMinor, beneficiaryMemberId: payout.beneficiaryMemberId, approvalCount: Number(count), requiredApprovals: required, status: nextStatus, mfa: "totp" } });
      const [beneficiary] = await tx.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.id, payout.beneficiaryMemberId), eq(groupMembers.groupId, input.groupId))).limit(1);
      await createInAppNotifications(tx, {
        groupId: input.groupId,
        userIds: [payout.initiatedByUserId, beneficiary?.userId],
        type: "payout_approval_recorded",
        title: "Payout approval updated",
        body: `Approval ${Number(count)} of ${required} was recorded. Current state: ${nextStatus}. No transfer was sent.`,
        metadata: { payoutId: payout.id, transactionId: payout.transactionId, status: nextStatus, approvalCount: Number(count), requiredApprovals: required },
      });
    return {
      status: nextStatus,
      approvalCount: Number(count),
      requiredApprovals: required,
      message: nextStatus === "approved" ? "Approval threshold met and verified funds appear sufficient. No transfer was sent." : nextStatus === "approved_waiting_funds" ? "Approval threshold met, but recent verified custodian funds are insufficient. No transfer was sent." : "Approval recorded for the exact payout request.",
    };
    });
  }),

  reconciliationHistory: protectedProcedure.input(groupIdSchema.extend({ paymentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "reconciliation:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.select({ record: reconciliationRecords, actorName: users.name }).from(reconciliationRecords)
      .leftJoin(users, eq(reconciliationRecords.actorUserId, users.id))
      .where(and(eq(reconciliationRecords.groupId, input.groupId), eq(reconciliationRecords.paymentId, input.paymentId))).orderBy(desc(reconciliationRecords.createdAt));
  }),

  providerReviewEvents: protectedProcedure.input(groupIdSchema).query(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "reconciliation:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.select({
      eventId: paymentEvents.id,
      eventType: paymentEvents.eventType,
      providerReference: paymentEvents.providerReference,
      verificationStatus: paymentEvents.verificationStatus,
      receivedAt: paymentEvents.receivedAt,
      paymentId: paymentTransactions.id,
      paymentStatus: paymentTransactions.status,
      amountMinor: paymentTransactions.amountMinor,
      currency: paymentTransactions.currency,
    }).from(paymentEvents).innerJoin(paymentTransactions, eq(paymentEvents.paymentId, paymentTransactions.id))
      .where(and(eq(paymentTransactions.groupId, input.groupId), inArray(paymentEvents.verificationStatus, ["review_required", "verification_failed", "duplicate_provider_transaction", "received", "unmatched", "unknown_event"])))
      .orderBy(desc(paymentEvents.receivedAt)).limit(100);
  }),

  unlinkedProviderEvents: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Platform administrator access is required." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.select({ eventId: paymentEvents.id, provider: paymentEvents.provider, eventType: paymentEvents.eventType, providerReference: paymentEvents.providerReference, verificationStatus: paymentEvents.verificationStatus, receivedAt: paymentEvents.receivedAt })
      .from(paymentEvents).where(and(isNull(paymentEvents.paymentId), inArray(paymentEvents.verificationStatus, ["received", "unmatched", "verification_failed", "review_required", "unknown_event"])))
      .orderBy(desc(paymentEvents.receivedAt)).limit(100);
  }),
});
