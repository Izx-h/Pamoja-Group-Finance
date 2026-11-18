import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { financeRouter } from "./routers/finance";
import { groupsRouter } from "./routers/groups";
import { loansRouter } from "./routers/loans";
import { notificationsRouter } from "./routers/notifications";
import { rotationsRouter } from "./routers/rotations";
import { securityRouter } from "./routers/security";
import { settingsRouter } from "./routers/settings";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  groups: groupsRouter,
  finance: financeRouter,
  loans: loansRouter,
  notifications: notificationsRouter,
  rotations: rotationsRouter,
  settings: settingsRouter,
  security: securityRouter,
});

export type AppRouter = typeof appRouter;
