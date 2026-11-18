import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, contributions, contributionSchedules, groupMembers, groupRoles, groups, journalLines, ledgerAccounts, paymentTransactions, payouts, custodianAccounts, loans } from "../../database/schema";
import { scopeDashboardObligations, summarizeDashboardObligations } from "../domain/dashboard";
import { router, protectedProcedure } from "../_core/trpc";
import { createCurrentObligations, createGroup, getGroupAccess, periodFor } from "../services/groups";
import { getDb } from "../db";

const groupIdInput = z.object({ groupId: z.number().int().positive() });
const scheduleFrequency = z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]);

async function requireAccess(userId: number, groupId: number, permission?: string) {
  const access = await getGroupAccess(groupId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "This account is not an active member of the requested group." });
  if (permission && !access.permissions.includes(permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `The group role does not grant ${permission}.` });
  }
  return access;
}

export const groupsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.select({
      id: groups.id,
      name: groups.name,
      type: groups.type,
      description: groups.description,
      currency: groups.currency,
      memberId: groupMembers.id,
      roleKey: groupRoles.roleKey,
      roleLabel: groupRoles.label,
      permissions: groupRoles.permissions,
      createdAt: groups.createdAt,
    }).from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id))
      .where(and(eq(groupMembers.userId, ctx.user.id), eq(groupMembers.status, "active")));
  }),

  create: protectedProcedure.input(z.object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(["merry_go_round", "rotating_savings", "accumulated_savings", "sacco", "investment"]),
    description: z.string().max(1000).optional(),
    registrationDetails: z.string().max(1000).optional(),
    amountMinor: z.number().int().safe().nonnegative(),
    frequency: scheduleFrequency,
    dueDay: z.number().int().min(1).max(31),
  })).mutation(async ({ ctx, input }) => {
    try {
      const created = await createGroup({ ...input, userId: ctx.user.id, userName: ctx.user.name ?? "Group administrator", userEmail: ctx.user.email });
      return { ...created, currency: "KES" as const };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Group could not be created." });
    }
  }),

  dashboard: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    const access = await requireAccess(ctx.user.id, input.groupId);
    const canReadLedgerSummary = access.permissions.includes("ledger:read_all") || access.permissions.includes("ledger:read_summary");
    const canReadAllContributions = access.permissions.includes("contributions:read_all");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
    if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
    const [members] = await db.select({ count: sql<number>`COUNT(*)` }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
    const obligations = await db.select().from(contributions).where(eq(contributions.groupId, input.groupId));
    const payments = await db.select({ status: paymentTransactions.status, count: sql<number>`COUNT(*)` }).from(paymentTransactions).where(canReadAllContributions
      ? eq(paymentTransactions.groupId, input.groupId)
      : and(eq(paymentTransactions.groupId, input.groupId), eq(paymentTransactions.memberId, access.memberId))).groupBy(paymentTransactions.status);
    const payoutRows = await db.select().from(payouts).where(eq(payouts.groupId, input.groupId));
    const scheduleRows = await db.select().from(contributionSchedules).where(and(eq(contributionSchedules.groupId, input.groupId), eq(contributionSchedules.active, true)));
    const ledgerRows = canReadLedgerSummary ? await db.select({
      accountType: ledgerAccounts.type,
      accountCode: ledgerAccounts.code,
      debitMinor: journalLines.debitMinor,
      creditMinor: journalLines.creditMinor,
    }).from(journalLines)
      .innerJoin(ledgerAccounts, eq(journalLines.accountId, ledgerAccounts.id))
      .where(eq(ledgerAccounts.groupId, input.groupId)) : [];
    // Asset/liability values below are reconstructed from posted journal lines.
    let assetsMinor = 0;
    let savingsLiabilityMinor = 0;
    let loanAssetsMinor = 0;
    for (const row of ledgerRows) {
      const debit = Number(row.debitMinor);
      const credit = Number(row.creditMinor);
      if (row.accountType === "asset") assetsMinor += debit - credit;
      if (row.accountType === "asset" && row.accountCode.startsWith("loan_")) loanAssetsMinor += debit - credit;
      if (row.accountType === "liability") savingsLiabilityMinor += credit - debit;
    }
    const verifiedCustodyRows = canReadLedgerSummary ? await db.select().from(custodianAccounts).where(and(eq(custodianAccounts.groupId, input.groupId), eq(custodianAccounts.isDevelopmentMock, false), eq(custodianAccounts.currency, "KES"))) : [];
    const now = Date.now();
    const verifiedCustodianMinor = verifiedCustodyRows.filter(account => account.verifiedAt !== null && account.verifiedAt.getTime() <= now && now - account.verifiedAt.getTime() <= 24 * 60 * 60 * 1000).reduce((sum, account) => sum + account.verifiedBalanceMinor, 0);
    const approvedPayoutMinor = payoutRows.filter(payout => ["approved", "approved_waiting_funds", "processing"].includes(payout.status)).reduce((sum, payout) => sum + payout.amountMinor, 0);
    const pendingLoanRows = await db.select({ amountMinor: loans.principalMinor }).from(loans).where(and(eq(loans.groupId, input.groupId), eq(loans.status, "pending_disbursement")));
    const pendingLoanMinor = pendingLoanRows.reduce((sum, loan) => sum + loan.amountMinor, 0);
    const currentKeyBySchedule = new Map(scheduleRows.map(schedule => [schedule.id, periodFor(schedule.frequency)]));
    const currentObligations = obligations.filter(row => currentKeyBySchedule.get(row.scheduleId) === row.periodKey);
    const visibleCurrentObligations = scopeDashboardObligations(currentObligations, access.memberId, canReadAllContributions);
    const { totalExpectedMinor, totalReceivedMinor, outstandingMinor } = summarizeDashboardObligations(visibleCurrentObligations);
    const pendingPaymentCount = payments.filter(row => ["pending", "initiated", "processing", "unmatched"].includes(row.status)).reduce((sum, row) => sum + Number(row.count), 0);
    const pendingPayoutCount = payoutRows.filter(row => ["pending_approval", "approved_waiting_funds", "approved", "processing"].includes(row.status)).length;
    return {
      group,
      role: { key: access.roleKey, label: access.roleLabel, permissions: access.permissions },
      stats: {
        activeMemberCount: Number(members?.count ?? 0),
        totalExpectedMinor,
        totalReceivedMinor,
        outstandingMinor,
        ...(canReadLedgerSummary ? {
          ledgerAssetsMinor: Math.max(0, assetsMinor),
          savingsLiabilityMinor: Math.max(0, savingsLiabilityMinor),
          outstandingLoanAssetsMinor: loanAssetsMinor,
          verifiedCustodianMinor,
          availableLiquidityMinor: Math.max(0, verifiedCustodianMinor - approvedPayoutMinor - pendingLoanMinor),
        } : {}),
        pendingPaymentCount,
        pendingPayoutCount,
      },
      currentObligations: visibleCurrentObligations,
    };
  }),

  members: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    const access = await requireAccess(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    if (!access.permissions.includes("members:manage")) {
      return db.select({ id: groupMembers.id, groupId: groupMembers.groupId, userId: groupMembers.userId, fullName: groupMembers.fullName, phone: groupMembers.phone, email: groupMembers.email, status: groupMembers.status, joinedAt: groupMembers.joinedAt, roleKey: groupRoles.roleKey, roleLabel: groupRoles.label })
        .from(groupMembers).innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id))
        .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, ctx.user.id))).limit(1);
    }
    return db.select({ id: groupMembers.id, groupId: groupMembers.groupId, userId: groupMembers.userId, fullName: groupMembers.fullName, phone: groupMembers.phone, email: groupMembers.email, status: groupMembers.status, joinedAt: groupMembers.joinedAt, roleKey: groupRoles.roleKey, roleLabel: groupRoles.label })
      .from(groupMembers).innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id))
      .where(eq(groupMembers.groupId, input.groupId)).orderBy(groupMembers.fullName);
  }),

  addMember: protectedProcedure.input(groupIdInput.extend({
    fullName: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().email().max(320).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireAccess(ctx.user.id, input.groupId, "members:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [role] = await db.select().from(groupRoles).where(and(eq(groupRoles.groupId, input.groupId), eq(groupRoles.roleKey, "member"))).limit(1);
    if (!role) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Default member role is missing." });
    const normalizedEmail = input.email?.trim().toLowerCase();
    if (normalizedEmail) {
      const duplicate = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
        eq(groupMembers.groupId, input.groupId),
        sql`LOWER(${groupMembers.email}) = ${normalizedEmail}`,
      )).limit(1);
      if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: "A member record with this email already exists in the group." });
    }
    const status = input.email ? "invited" as const : "active" as const;
    try {
      const [{ id: memberId }] = await db.insert(groupMembers).values({
        groupId: input.groupId,
        userId: null,
        roleId: role.id,
        fullName: input.fullName,
        phone: input.phone || null,
        email: normalizedEmail || null,
        status,
      }).$returningId();
      await db.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "member.added", entityType: "group_member", entityId: String(memberId), details: { invitedByEmail: Boolean(input.email) } });
      return { memberId, status };
    } catch {
      throw new TRPCError({ code: "CONFLICT", message: "A matching member record already exists or could not be created." });
    }
  }),

  assignMemberRole: protectedProcedure.input(groupIdInput.extend({
    memberId: z.number().int().positive(),
    roleKey: z.string().trim().min(2).max(64),
  })).mutation(async ({ ctx, input }) => {
    await requireAccess(ctx.user.id, input.groupId, "members:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.transaction(async tx => {
      const [member] = await tx.select().from(groupMembers).where(and(
        eq(groupMembers.id, input.memberId),
        eq(groupMembers.groupId, input.groupId),
      )).limit(1).for("update");
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member was not found in this group." });
      const [role] = await tx.select().from(groupRoles).where(and(
        eq(groupRoles.groupId, input.groupId),
        eq(groupRoles.roleKey, input.roleKey),
      )).limit(1);
      if (!role) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a role configured in this group." });
      if (member.roleId === role.id) return { success: true, roleKey: role.roleKey };
      const managers = await tx.select({ memberId: groupMembers.id, permissions: groupRoles.permissions }).from(groupMembers)
        .innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id))
        .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
      const managerRemains = managers.some(row => row.memberId !== member.id && row.permissions.includes("group:manage"));
      if (member.status === "active" && !role.permissions.includes("group:manage") && !managerRemains) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "At least one active member must retain group-management permission." });
      }
      await tx.update(groupMembers).set({ roleId: role.id }).where(and(eq(groupMembers.id, member.id), eq(groupMembers.groupId, input.groupId)));
      await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "member.role_changed", entityType: "group_member", entityId: String(member.id), details: { previousRoleId: member.roleId, nextRoleKey: role.roleKey } });
      return { success: true, roleKey: role.roleKey };
    });
  }),

  schedules: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    await requireAccess(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.select().from(contributionSchedules).where(eq(contributionSchedules.groupId, input.groupId)).orderBy(desc(contributionSchedules.createdAt));
  }),

  createSchedule: protectedProcedure.input(groupIdInput.extend({
    label: z.string().trim().min(2).max(120),
    amountMinor: z.number().int().safe().positive(),
    frequency: scheduleFrequency,
    dueDay: z.number().int().min(1).max(31),
  })).mutation(async ({ ctx, input }) => {
    await requireAccess(ctx.user.id, input.groupId, "contributions:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.transaction(async tx => {
      const now = new Date();
      const [{ id: scheduleId }] = await tx.insert(contributionSchedules).values({ groupId: input.groupId, label: input.label, amountMinor: input.amountMinor, frequency: input.frequency, dueDay: input.dueDay, startsOn: now, active: true }).$returningId();
      const obligations = await createCurrentObligations(tx, { groupId: input.groupId, scheduleId, now });
      await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "contribution_schedule.created", entityType: "contribution_schedule", entityId: String(scheduleId), details: { amountMinor: input.amountMinor, frequency: input.frequency, periodKey: obligations.periodKey } });
      return { scheduleId, ...obligations };
    });
  }),

  generateCurrentPeriod: protectedProcedure.input(groupIdInput.extend({ scheduleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireAccess(ctx.user.id, input.groupId, "contributions:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.transaction(tx => createCurrentObligations(tx, input));
  }),

  contributions: protectedProcedure.input(groupIdInput).query(async ({ ctx, input }) => {
    const access = await requireAccess(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const isAdmin = access.permissions.includes("contributions:read_all");
    const whereClause = isAdmin ? eq(contributions.groupId, input.groupId) : and(eq(contributions.groupId, input.groupId), eq(contributions.memberId, access.memberId));
    const rows = await db.select({ contribution: contributions, memberName: groupMembers.fullName, phone: groupMembers.phone, scheduleLabel: contributionSchedules.label })
      .from(contributions).innerJoin(groupMembers, eq(contributions.memberId, groupMembers.id)).innerJoin(contributionSchedules, eq(contributions.scheduleId, contributionSchedules.id))
      .where(whereClause).orderBy(desc(contributions.dueDate));
    return rows.map(row => ({ ...row.contribution, memberName: isAdmin ? row.memberName : undefined, phone: isAdmin ? row.phone : undefined, scheduleLabel: row.scheduleLabel }));
  }),
});
