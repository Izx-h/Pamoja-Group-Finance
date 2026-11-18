import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLogs, custodianAccounts, groupMembers, groupRoles, groupSettings, loanApplications, loanProducts, loans, payouts } from "../../database/schema";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { getGroupAccess } from "../services/groups";
import { createInAppNotifications } from "../services/notifications";

async function requireGroup(userId: number, groupId: number, permission?: string) {
  const access = await getGroupAccess(groupId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "This account is not an active member of the requested group." });
  if (permission && !access.permissions.includes(permission)) throw new TRPCError({ code: "FORBIDDEN", message: `The group role does not grant ${permission}.` });
  return access;
}

async function availableVerifiedFunds(db: any, groupId: number) {
  const accounts = await db.select().from(custodianAccounts).where(and(eq(custodianAccounts.groupId, groupId), eq(custodianAccounts.isDevelopmentMock, false), eq(custodianAccounts.currency, "KES")));
  const now = Date.now();
  const balance = accounts.reduce((sum: number, account: typeof accounts[number]) => account.verifiedAt && account.verifiedAt.getTime() <= now && now - account.verifiedAt.getTime() <= 24 * 60 * 60 * 1000 ? sum + account.verifiedBalanceMinor : sum, 0);
  const reservedPayouts = await db.select({ amount: payouts.amountMinor }).from(payouts).where(and(eq(payouts.groupId, groupId), inArray(payouts.status, ["approved", "approved_waiting_funds", "processing"])));
  const pendingLoans = await db.select({ amount: loans.principalMinor }).from(loans).where(and(eq(loans.groupId, groupId), eq(loans.status, "pending_disbursement")));
  const reserved = [...reservedPayouts, ...pendingLoans].reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
  return Math.max(0, balance - reserved);
}

export const loansRouter = router({
  list: protectedProcedure.input(z.object({ groupId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await requireGroup(ctx.user.id, input.groupId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const allProducts = await db.select().from(loanProducts).where(eq(loanProducts.groupId, input.groupId)).orderBy(desc(loanProducts.createdAt));
    const products = access.permissions.includes("loan:review") ? allProducts : allProducts.filter(product => product.requiresGuarantors === 0);
    const applications = access.permissions.includes("loan:review")
      ? await db.select({ application: loanApplications, memberName: groupMembers.fullName, productName: loanProducts.name }).from(loanApplications)
        .innerJoin(groupMembers, eq(loanApplications.memberId, groupMembers.id)).innerJoin(loanProducts, eq(loanApplications.productId, loanProducts.id))
        .where(eq(loanApplications.groupId, input.groupId)).orderBy(desc(loanApplications.createdAt))
      : await db.select({ application: loanApplications, memberName: groupMembers.fullName, productName: loanProducts.name }).from(loanApplications)
        .innerJoin(groupMembers, eq(loanApplications.memberId, groupMembers.id)).innerJoin(loanProducts, eq(loanApplications.productId, loanProducts.id))
        .where(and(eq(loanApplications.groupId, input.groupId), eq(loanApplications.memberId, access.memberId))).orderBy(desc(loanApplications.createdAt));
    const activeLoans = await db.select().from(loans).where(access.permissions.includes("loan:review")
      ? and(eq(loans.groupId, input.groupId), inArray(loans.status, ["pending_disbursement", "active"]))
      : and(eq(loans.groupId, input.groupId), eq(loans.memberId, access.memberId), inArray(loans.status, ["pending_disbursement", "active"])));
    return { products, applications, activeLoans };
  }),

  createProduct: protectedProcedure.input(z.object({
    groupId: z.number().int().positive(),
    name: z.string().trim().min(2).max(120),
    annualRateBps: z.number().int().min(0).max(100_000),
    maxAmountMinor: z.number().int().safe().positive(),
    termMonths: z.number().int().min(1).max(120),
    requiresGuarantors: z.number().int().min(0).max(10),
  })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "loan:review");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    if (input.requiresGuarantors > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Guarantor acceptance and verification are not implemented; configure this product with zero required guarantors." });
    const [{ id }] = await db.insert(loanProducts).values({ ...input, active: true }).$returningId();
    await db.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "loan_product.created", entityType: "loan_product", entityId: String(id), details: { annualRateBps: input.annualRateBps, maxAmountMinor: input.maxAmountMinor, termMonths: input.termMonths } });
    return { id };
  }),

  submitApplication: protectedProcedure.input(z.object({
    groupId: z.number().int().positive(),
    productId: z.number().int().positive(),
    requestedAmountMinor: z.number().int().safe().positive(),
    purpose: z.string().trim().min(4).max(1000),
  })).mutation(async ({ ctx, input }) => {
    const access = await requireGroup(ctx.user.id, input.groupId, "loan:apply");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    const [product] = await db.select().from(loanProducts).where(and(eq(loanProducts.id, input.productId), eq(loanProducts.groupId, input.groupId), eq(loanProducts.active, true))).limit(1);
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Loan product is unavailable." });
    if (product.requiresGuarantors > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This product’s guarantor prerequisites cannot yet be accepted or verified." });
    if (input.requestedAmountMinor > product.maxAmountMinor) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested amount exceeds this product's configured limit." });
    const outstanding = await db.select().from(loans).where(and(eq(loans.groupId, input.groupId), eq(loans.memberId, access.memberId), inArray(loans.status, ["pending_disbursement", "active"])));
    if (outstanding.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "An existing loan must be settled before another application." });
    const id = await db.transaction(async tx => {
      const [{ id: applicationId }] = await tx.insert(loanApplications).values({ groupId: input.groupId, memberId: access.memberId, productId: product.id, requestedAmountMinor: input.requestedAmountMinor, status: "submitted", purpose: input.purpose }).$returningId();
      await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: "loan_application.submitted", entityType: "loan_application", entityId: String(applicationId), details: { productId: product.id, requestedAmountMinor: input.requestedAmountMinor } });
      const reviewers = await tx.select({ userId: groupMembers.userId, permissions: groupRoles.permissions }).from(groupMembers).innerJoin(groupRoles, eq(groupMembers.roleId, groupRoles.id)).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));
      await createInAppNotifications(tx, { groupId: input.groupId, userIds: reviewers.filter(row => row.permissions.includes("loan:review")).map(row => row.userId), type: "loan_application_submitted", title: "Loan application submitted", body: "A group member submitted a loan application for administrator review. No credit approval or disbursement has occurred.", metadata: { applicationId, requestedAmountMinor: input.requestedAmountMinor } });
      return applicationId;
    });
    return { id, status: "submitted" as const };
  }),

  review: protectedProcedure.input(z.object({
    groupId: z.number().int().positive(),
    applicationId: z.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
    approvedAmountMinor: z.number().int().safe().positive().optional(),
    reviewNote: z.string().trim().max(1000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireGroup(ctx.user.id, input.groupId, "loan:review");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
    return db.transaction(async tx => {
      const [governance] = await tx.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1).for("update");
      if (!governance) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Group approval settings are unavailable." });
      const [application] = await tx.select().from(loanApplications).where(and(eq(loanApplications.id, input.applicationId), eq(loanApplications.groupId, input.groupId))).limit(1).for("update");
      if (!application || !["submitted", "under_review"].includes(application.status)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Application is not awaiting a decision." });
      let approvedAmountMinor: number | null = null;
      if (input.decision === "approved") {
        const [product] = await tx.select().from(loanProducts).where(and(eq(loanProducts.id, application.productId), eq(loanProducts.groupId, input.groupId))).limit(1);
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Loan product not found." });
        if (product.requiresGuarantors > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This product requires guarantor workflows that are not currently supported." });
        const [outstandingLoan] = await tx.select({ id: loans.id }).from(loans).where(and(eq(loans.groupId, input.groupId), eq(loans.memberId, application.memberId), inArray(loans.status, ["pending_disbursement", "active"]))).limit(1);
        if (outstandingLoan) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This member already has an outstanding loan or pending disbursement." });
        approvedAmountMinor = input.approvedAmountMinor ?? application.requestedAmountMinor;
        if (approvedAmountMinor > application.requestedAmountMinor || approvedAmountMinor > product.maxAmountMinor) throw new TRPCError({ code: "BAD_REQUEST", message: "Approved amount cannot exceed the requested amount or configured product limit." });
        const available = await availableVerifiedFunds(tx, input.groupId);
        if (available < approvedAmountMinor) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Recent verified custodian funds are insufficient. Loan approval/disbursement remains blocked." });
        const interestMinor = Number((BigInt(approvedAmountMinor) * BigInt(product.annualRateBps) * BigInt(product.termMonths) + 60_000n) / 120_000n);
        await tx.insert(loans).values({ groupId: input.groupId, applicationId: application.id, memberId: application.memberId, principalMinor: approvedAmountMinor, interestMinor, outstandingPrincipalMinor: approvedAmountMinor, outstandingInterestMinor: interestMinor, status: "pending_disbursement" });
      }
      await tx.update(loanApplications).set({ status: input.decision, approvedAmountMinor, reviewedByUserId: ctx.user.id, reviewNote: input.reviewNote || null, updatedAt: new Date() }).where(eq(loanApplications.id, application.id));
      await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: ctx.user.id, action: `loan_application.${input.decision}`, entityType: "loan_application", entityId: String(application.id), details: { approvedAmountMinor, reviewNote: input.reviewNote || null, disbursed: false } });
      const [member] = await tx.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.id, application.memberId), eq(groupMembers.groupId, input.groupId))).limit(1);
      await createInAppNotifications(tx, { groupId: input.groupId, userIds: [member?.userId], type: `loan_application_${input.decision}`, title: input.decision === "approved" ? "Loan application approved" : "Loan application declined", body: input.decision === "approved" ? "The application was approved and funds are reserved pending a provider integration. No disbursement was sent." : "A group administrator recorded a decision on your loan application.", metadata: { applicationId: application.id, approvedAmountMinor, status: input.decision } });
      return { status: input.decision, approvedAmountMinor, disbursed: false, message: input.decision === "approved" ? "Application approved; no disbursement has been initiated." : "Application rejected." };
    });
  }),
});
