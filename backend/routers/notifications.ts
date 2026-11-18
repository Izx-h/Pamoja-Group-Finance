import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { groupMembers, notifications } from "../../database/schema";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

export const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const memberships = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.userId, ctx.user.id), eq(groupMembers.status, "active")));
    const activeGroupIds = [...new Set(memberships.map(row => row.groupId))];
    const groupScope = activeGroupIds.length ? or(isNull(notifications.groupId), inArray(notifications.groupId, activeGroupIds)) : isNull(notifications.groupId);
    const rows = await db.select().from(notifications).where(and(eq(notifications.userId, ctx.user.id), groupScope)).orderBy(desc(notifications.createdAt)).limit(100);
    return { notifications: rows, unreadCount: rows.filter(row => row.status !== "read").length };
  }),

  markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.transaction(async tx => {
      const [notification] = await tx.select().from(notifications).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user.id))).limit(1).for("update");
      if (!notification || notification.status === "read") return { success: true };
      if (notification.groupId !== null) {
        const [membership] = await tx.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, notification.groupId), eq(groupMembers.userId, ctx.user.id), eq(groupMembers.status, "active"))).limit(1);
        if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "Notification is unavailable." });
      }
      await tx.update(notifications).set({ status: "read" }).where(eq(notifications.id, notification.id));
      return { success: true };
    });
  }),
});
