import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { contributions, contributionSchedules, groupMembers, groupRoles, groups, payoutSchedules } from "../../database/schema";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { getGroupAccess, periodFor } from "../services/groups";

async function requireGroup(userId: number, groupId: number, permission?: string) {
  const access = await getGroupAccess(groupId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "This account is not an active member of the requested group." });
  if (permission && !access.permissions.includes(permission)) throw new TRPCError({ code: "FORBIDDEN", message: `The group role does not grant ${permission}.` });
  return access;
}

function addPeriod(date: Date, frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual", index: number) {
  const result = new Date(date);
  if (frequency === "weekly") result.setUTCDate(result.getUTCDate() + 7 * index);
  else if (frequency === "biweekly") result.setUTCDate(result.getUTCDate() + 14 * index);
  else {
    const months = frequency === "monthly" ? index : frequency === "quarterly" ? index * 3 : index * 12;
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  }
  return result;
}

export const rotationsRouter = router({
  list: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const rows = await db.select({ schedule: payoutSchedules, beneficiaryName: groupMembers.fullName, memberPhone: groupMembers.phone })
      .from(payoutSchedules).innerJoin(groupMembers, eq(payoutSchedules.beneficiaryMemberId, groupMembers.id))
      .where(eq(payoutSchedules.groupId, input.groupId)).orderBy(payoutSchedules.sequence);
    const enriched = [];
    for (const row of rows) {
      const periodContributions = await db.select().from(contributions).where(and(
        eq(contributions.groupId, input.groupId),
        eq(contributions.scheduleId, row.schedule.contributionScheduleId),
        eq(contributions.periodKey, row.schedule.periodKey),
      ));
      const activeMembers = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
      const settledCount = periodContributions.filter(item => item.amountPaidMinor >= item.amountDueMinor).length;
      const collectionComplete = activeMembers.length > 0 && periodContributions.length === activeMembers.length && settledCount === activeMembers.length;
      const progressMinor = periodContributions.reduce((sum, item) => sum + item.amountPaidMinor, 0);
      const expectedMinor = periodContributions.reduce((sum, item) => sum + item.amountDueMinor, 0);
      enriched.push({
        ...row.schedule,
        beneficiaryName: row.beneficiaryName,
        memberPhone: row.memberPhone,
        settledMembers: settledCount,
        activeMembers: activeMembers.length,
        collectedMinor: progressMinor,
        expectedContributionsMinor: expectedMinor,
        displayStatus: row.schedule.status === "paid" ? "paid" : collectionComplete ? "eligible" : "scheduled",
      });
    }
    return enriched;
  }),

  create: protectedProcedure.input(z.object({
    groupId: z.number().int().positive(),
    contributionScheduleId: z.number().int().positive(),
    firstPayoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    memberOrder: z.array(z.number().int().positive()).min(2).max(200),
  })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "group:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [group] = await db.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
    if (!group || !["merry_go_round", "rotating_savings"].includes(group.type)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Rotation schedules apply only to merry-go-round or rotating-savings groups." });
    const [contributionSchedule] = await db.select().from(contributionSchedules).where(and(eq(contributionSchedules.id, input.contributionScheduleId), eq(contributionSchedules.groupId, input.groupId), eq(contributionSchedules.active, true))).limit(1);
    if (!contributionSchedule) throw new TRPCError({ code: "NOT_FOUND", message: "Active contribution schedule not found in this group." });
    const members = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
    const expectedIds = members.map(member => member.id).sort((a, b) => a - b);
    const receivedIds = [...input.memberOrder].sort((a, b) => a - b);
    if (expectedIds.length !== receivedIds.length || expectedIds.some((id, index) => id !== receivedIds[index])) throw new TRPCError({ code: "BAD_REQUEST", message: "Rotation order must include every active member exactly once." });
    const parsedDate = new Date(`${input.firstPayoutDate}T12:00:00.000Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.firstPayoutDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid first payout date." });
    const [{ count }] = await db.select({ count: (await import("drizzle-orm")).sql<number>`COUNT(*)` }).from(payoutSchedules).where(eq(payoutSchedules.groupId, input.groupId));
    if (Number(count) > 0) throw new TRPCError({ code: "CONFLICT", message: "A rotation already exists for this group. Existing payout schedules are retained." });
    const expectedAmountMinor = contributionSchedule.amountMinor * members.length;
    if (!Number.isSafeInteger(expectedAmountMinor)) throw new TRPCError({ code: "BAD_REQUEST", message: "Expected pool exceeds the supported safe integer range." });
    const rows = input.memberOrder.map((beneficiaryMemberId, index) => {
      const payoutDate = addPeriod(parsedDate, contributionSchedule.frequency, index);
      return {
        groupId: input.groupId,
        contributionScheduleId: contributionSchedule.id,
        periodKey: periodFor(contributionSchedule.frequency, payoutDate),
        beneficiaryMemberId,
        sequence: index + 1,
        payoutDate,
        expectedAmountMinor,
        status: "scheduled" as const,
      };
    });
    try {
      const inserted = await db.insert(payoutSchedules).values(rows).$returningId();
      const { auditLogs } = await import("../../database/schema");
      await db.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "rotation.created", entityType: "payout_schedule", entityId: String(inserted[0]?.id), details: { count: rows.length, contributionScheduleId: contributionSchedule.id, frequency: contributionSchedule.frequency, memberOrder: input.memberOrder } });
      return { count: rows.length, expectedAmountMinor, period: contributionSchedule.frequency };
    } catch {
      throw new TRPCError({ code: "CONFLICT", message: "Rotation could not be saved; existing schedules were not modified." });
    }
  }),

  refreshEligibility: protectedProcedure.input(z.object({ groupId: z.number().int().positive(), scheduleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "contributions:manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [schedule] = await db.select().from(payoutSchedules).where(and(eq(payoutSchedules.id, input.scheduleId), eq(payoutSchedules.groupId, input.groupId))).limit(1);
    if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Rotation schedule not found." });
    if (schedule.status === "paid") return { status: "paid" as const };
    const activeMembers = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
    const rows = await db.select().from(contributions).where(and(eq(contributions.groupId, input.groupId), eq(contributions.scheduleId, schedule.contributionScheduleId), eq(contributions.periodKey, schedule.periodKey)));
    const complete = activeMembers.length > 0 && rows.length === activeMembers.length && rows.every(row => row.amountPaidMinor >= row.amountDueMinor);
    const status = complete ? "eligible" as const : "scheduled" as const;
    await db.update(payoutSchedules).set({ status }).where(eq(payoutSchedules.id, schedule.id));
    return { status, settledMembers: rows.filter(row => row.amountPaidMinor >= row.amountDueMinor).length, activeMembers: activeMembers.length };
  }),
});
