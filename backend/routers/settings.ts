import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLogs, groupMembers, groupRoles, groupSettings } from "../../database/schema";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { getGroupAccess } from "../services/groups";
import { PERMISSIONS } from "../domain/permissions";

async function requireManager(userId: number, groupId: number) {
  const access = await getGroupAccess(groupId, userId);
  if (!access || !access.permissions.includes("group:manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Only a group manager can change governance settings." });
  return access;
}

export const settingsRouter = router({
  get: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireManager(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [settings] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
    const roles = await db.select().from(groupRoles).where(eq(groupRoles.groupId, input.groupId));
    return { settings: settings ?? null, roles };
  }),

  update: protectedProcedure.input(z.object({
    groupId: z.number().int().positive(),
    approvalThreshold: z.number().int().min(1).max(3),
    approvalRoleKeys: z.array(z.string().min(1).max(64)).min(1).max(12),
    prohibitSelfApproval: z.boolean(),
    allowOverpayments: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    await requireManager(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const roles = await db.select().from(groupRoles).where(eq(groupRoles.groupId, input.groupId));
    const eligibleApprovers = roles.filter(role => role.permissions.includes("payout:approve"));
    if (input.approvalRoleKeys.some(key => !eligibleApprovers.some(role => role.roleKey === key))) throw new TRPCError({ code: "BAD_REQUEST", message: "Approval roles must belong to this group and have payout-approval permission." });
    if (new Set(input.approvalRoleKeys).size !== input.approvalRoleKeys.length || input.approvalThreshold > input.approvalRoleKeys.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least as many distinct eligible roles as the approval threshold." });
    const [current] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Group settings not found." });
    await db.update(groupSettings).set({ approvalThreshold: input.approvalThreshold, approvalRoleKeys: input.approvalRoleKeys, prohibitSelfApproval: input.prohibitSelfApproval, allowOverpayments: input.allowOverpayments, updatedAt: new Date() }).where(eq(groupSettings.groupId, input.groupId));
    await db.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "group.settings.updated", entityType: "group_settings", entityId: String(current.id), details: { approvalThreshold: input.approvalThreshold, approvalRoleKeys: input.approvalRoleKeys, prohibitSelfApproval: input.prohibitSelfApproval, allowOverpayments: input.allowOverpayments } });
    return { success: true };
  }),

  updateRole: protectedProcedure.input(z.object({
    groupId: z.number().int().positive(),
    roleId: z.number().int().positive(),
    label: z.string().trim().min(2).max(80),
    permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  })).mutation(async ({ ctx, input }) => {
    await requireManager(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const roles = await db.select().from(groupRoles).where(eq(groupRoles.groupId, input.groupId));
    const role = roles.find(item => item.id === input.roleId);
    if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found in this group." });
    const [settings] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
    if (settings?.approvalRoleKeys.includes(role.roleKey) && !input.permissions.includes("payout:approve")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Remove this role from payout approval settings before revoking its payout-approval permission." });
    const activeMembers = await db.select({ roleId: groupMembers.roleId }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
    const managerRemains = activeMembers.some(member => {
      const assignment = roles.find(item => item.id === member.roleId);
      return assignment && assignment.id !== role.id && assignment.permissions.includes("group:manage");
    }) || (activeMembers.some(member => member.roleId === role.id) && input.permissions.includes("group:manage"));
    if (!managerRemains) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "At least one active group member must retain group-management permission." });
    await db.update(groupRoles).set({ label: input.label, permissions: input.permissions }).where(and(eq(groupRoles.id, role.id), eq(groupRoles.groupId, input.groupId)));
    await db.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "group.role.updated", entityType: "group_role", entityId: String(role.id), details: { roleKey: role.roleKey, label: input.label, permissions: input.permissions } });
    return { success: true };
  }),
});
