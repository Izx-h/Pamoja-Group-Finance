import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userSecurity } from "../../database/schema";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { beginTotpEnrollment, confirmTotpEnrollment } from "../services/security";
import { verifyUserTotp } from "../services/security";

export const securityRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [row] = await db.select({ enabled: userSecurity.totpEnabled, confirmedAt: userSecurity.confirmedAt }).from(userSecurity).where(eq(userSecurity.userId, ctx.user.id)).limit(1);
    return { totpEnabled: row?.enabled ?? false, confirmedAt: row?.confirmedAt ?? null };
  }),

  beginTotp: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const enrollment = await beginTotpEnrollment({ userId: ctx.user.id, account: ctx.user.email || ctx.user.name || `member-${ctx.user.id}` });
      return { ...enrollment, message: "Add this account to an authenticator app, then enter its current six-digit code to confirm." };
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Could not start TOTP enrollment." });
    }
  }),

  confirmTotp: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
    const confirmed = await confirmTotpEnrollment({ userId: ctx.user.id, code: input.code });
    if (!confirmed) throw new TRPCError({ code: "BAD_REQUEST", message: "The code did not verify. Check your authenticator clock and try again." });
    return { success: true };
  }),

  disableTotp: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
    const verified = await verifyUserTotp(ctx.user.id, input.code);
    if (!verified) throw new TRPCError({ code: "FORBIDDEN", message: "A valid current authenticator code is required." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    await db.delete(userSecurity).where(eq(userSecurity.userId, ctx.user.id));
    return { success: true };
  }),
});
