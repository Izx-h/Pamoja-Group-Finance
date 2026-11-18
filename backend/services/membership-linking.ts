import { and, eq, isNull, sql } from "drizzle-orm";
import { auditLogs, contributionSchedules, groupMembers } from "../../database/schema";
import { getDb } from "../db";
import { createCurrentObligations } from "./groups";

export async function linkInvitedGroups(user: { id: number; email?: string | null }) {
  const email = user.email?.trim().toLowerCase();
  if (!email) return { linked: 0 };
  const db = await getDb();
  if (!db) return { linked: 0 };
  return db.transaction(async tx => {
    const invites = await tx.select({ id: groupMembers.id, groupId: groupMembers.groupId }).from(groupMembers).where(and(
      isNull(groupMembers.userId),
      sql`LOWER(${groupMembers.email}) = ${email}`,
      eq(groupMembers.status, "invited"),
    ));
    const linkedGroups = new Set<number>();
    for (const invite of invites) {
      const [existing] = await tx.select({ id: groupMembers.id }).from(groupMembers).where(and(
        eq(groupMembers.groupId, invite.groupId),
        eq(groupMembers.userId, user.id),
      )).limit(1);
      if (existing) continue;
      await tx.update(groupMembers).set({ userId: user.id, status: "active" }).where(and(
        eq(groupMembers.id, invite.id),
        isNull(groupMembers.userId),
        eq(groupMembers.status, "invited"),
      ));
      linkedGroups.add(invite.groupId);
      await tx.insert(auditLogs).values({
        groupId: invite.groupId,
        actorUserId: user.id,
        action: "member.invitation_accepted",
        entityType: "group_member",
        entityId: String(invite.id),
        details: { emailMatched: true },
      });
    }
    for (const groupId of linkedGroups) {
      const schedules = await tx.select({ id: contributionSchedules.id }).from(contributionSchedules).where(and(
        eq(contributionSchedules.groupId, groupId),
        eq(contributionSchedules.active, true),
      ));
      for (const schedule of schedules) await createCurrentObligations(tx, { groupId, scheduleId: schedule.id });
    }
    return { linked: linkedGroups.size };
  });
}
