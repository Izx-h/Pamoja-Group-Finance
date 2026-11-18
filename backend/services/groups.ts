import { and, eq } from "drizzle-orm";
import { DEFAULT_GROUP_ROLES } from "../domain/permissions";
import { contributionStatus } from "../domain/finance";
import {
  auditLogs,
  contributionSchedules,
  contributions,
  groupMembers,
  groupRoles,
  groupSettings,
  groups,
  ledgerAccounts,
} from "../../database/schema";
import { getDb } from "../db";

export function periodFor(frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual", date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (frequency === "monthly") return `${year}-${String(month + 1).padStart(2, "0")}`;
  if (frequency === "quarterly") return `${year}-Q${Math.floor(month / 3) + 1}`;
  if (frequency === "annual") return `${year}`;
  if (frequency === "biweekly") {
    const dayOfYear = Math.floor((Date.UTC(year, month, date.getUTCDate()) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
    return `${year}-BW${String(Math.floor((dayOfYear - 1) / 14) + 1).padStart(2, "0")}`;
  }
  const janFirst = new Date(Date.UTC(year, 0, 1));
  const isoYearStart = new Date(Date.UTC(year, 0, 1 - ((janFirst.getUTCDay() + 6) % 7)));
  const week = Math.floor((Date.UTC(year, month, date.getUTCDate()) - isoYearStart.getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function dueDateFor(
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual",
  dueDay: number,
  date = new Date(),
) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (frequency === "weekly") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(year, month, date.getUTCDate() - mondayOffset));
    return new Date(Date.UTC(year, monday.getUTCMonth(), monday.getUTCDate() + Math.max(0, Math.min(6, dueDay - 1)), 17));
  }
  let targetMonth = month;
  if (frequency === "quarterly") targetMonth = Math.floor(month / 3) * 3 + 2;
  if (frequency === "annual") targetMonth = 11;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.max(1, Math.min(lastDay, dueDay)), 17));
}

export async function createCurrentObligations(tx: any, input: { groupId: number; scheduleId: number; now?: Date }) {
  const now = input.now ?? new Date();
  const [schedule] = await tx.select().from(contributionSchedules)
    .where(and(eq(contributionSchedules.id, input.scheduleId), eq(contributionSchedules.groupId, input.groupId))).limit(1);
  if (!schedule || !schedule.active || now < schedule.startsOn || (schedule.endsOn && now > schedule.endsOn)) {
    throw new Error("An active contribution schedule in its configured date range was not found in this group.");
  }
  const members = await tx.select({ id: groupMembers.id }).from(groupMembers)
    .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
  const periodKey = periodFor(schedule.frequency, now);
  const dueDate = dueDateFor(schedule.frequency, schedule.dueDay, now);
  const status = contributionStatus(schedule.amountMinor, 0, dueDate, now);
  if (members.length) {
    await tx.insert(contributions).values(members.map((member: { id: number }) => ({
      groupId: input.groupId,
      memberId: member.id,
      scheduleId: schedule.id,
      periodKey,
      dueDate,
      amountDueMinor: schedule.amountMinor,
      amountPaidMinor: 0,
      status,
    }))).onDuplicateKeyUpdate({ set: { updatedAt: now } });
  }
  return { periodKey, obligationsCreatedFor: members.length };
}

export async function createGroup(input: {
  userId: number;
  userName: string;
  userEmail?: string | null;
  name: string;
  type: "merry_go_round" | "rotating_savings" | "accumulated_savings" | "sacco" | "investment";
  description?: string;
  registrationDetails?: string;
  amountMinor: number;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  dueDay: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  return db.transaction(async tx => {
    const [{ id: groupId }] = await tx.insert(groups).values({
      name: input.name.trim(),
      type: input.type,
      description: input.description?.trim() || null,
      registrationDetails: input.registrationDetails?.trim() || null,
      currency: "KES",
      createdByUserId: input.userId,
    }).$returningId();

    await tx.insert(groupRoles).values(DEFAULT_GROUP_ROLES.map(role => ({
      groupId,
      roleKey: role.roleKey,
      label: role.label,
      permissions: [...role.permissions],
      isDefault: true,
    })));
    const roles = await tx.select().from(groupRoles).where(eq(groupRoles.groupId, groupId));
    const chair = roles.find((role: { roleKey: string }) => role.roleKey === "chairperson");
    if (!chair) throw new Error("Default chairperson role could not be created.");

    await tx.insert(groupMembers).values({
      groupId,
      userId: input.userId,
      roleId: chair.id,
      fullName: input.userName.trim() || "Group administrator",
      phone: null,
      email: input.userEmail ?? null,
      status: "active",
    });
    await tx.insert(groupSettings).values({
      groupId,
      approvalThreshold: 2,
      approvalRoleKeys: ["chairperson", "secretary"],
      prohibitSelfApproval: true,
      allowOverpayments: true,
    });
    await tx.insert(ledgerAccounts).values([
      { groupId, code: "provider_receivable", name: "Provider collections receivable", type: "asset", isCash: false },
      { groupId, code: "verified_custodian_cash", name: "Verified custodian cash", type: "asset", isCash: true },
      { groupId, code: "member_savings_liability", name: "Member savings liability", type: "liability", isCash: false },
      { groupId, code: "member_unapplied_funds", name: "Member unapplied funds liability", type: "liability", isCash: false },
      { groupId, code: "loan_principal_receivable", name: "Loan principal receivable", type: "asset", isCash: false },
      { groupId, code: "loan_interest_receivable", name: "Loan interest receivable", type: "asset", isCash: false },
      { groupId, code: "interest_income", name: "Interest income", type: "income", isCash: false },
      { groupId, code: "payout_payable", name: "Payout obligations", type: "liability", isCash: false },
      { groupId, code: "group_expenses", name: "Group expenses", type: "expense", isCash: false },
      { groupId, code: "payment_fees", name: "Payment fees", type: "expense", isCash: false },
    ]);
    await tx.insert(auditLogs).values({
      groupId,
      actorUserId: input.userId,
      action: "group.created",
      entityType: "group",
      entityId: String(groupId),
      details: { type: input.type, currency: "KES" },
    });

    if (input.amountMinor > 0) {
      const now = new Date();
      const [{ id: scheduleId }] = await tx.insert(contributionSchedules).values({
        groupId,
        label: "Regular contribution",
        amountMinor: input.amountMinor,
        frequency: input.frequency,
        dueDay: input.dueDay,
        lateAfterDays: 0,
        startsOn: now,
        active: true,
      }).$returningId();
      await createCurrentObligations(tx, { groupId, scheduleId, now });
    }
    return { groupId };
  });
}

export async function getGroupAccess(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({
    groupId: groupMembers.groupId,
    memberId: groupMembers.id,
    memberStatus: groupMembers.status,
    roleKey: groupRoles.roleKey,
    roleLabel: groupRoles.label,
    permissions: groupRoles.permissions,
  }).from(groupMembers)
    .innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id))
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.status, "active"),
    )).limit(1);
  return row ?? null;
}
