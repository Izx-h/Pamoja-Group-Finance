import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  auditLogs,
  contributions,
  groupMembers,
  groupSettings,
  paymentEvents,
  paymentTransactions,
  reconciliationRecords,
} from "../../database/schema";
import { applyContributionPayment, contributionStatus } from "../domain/finance";
import { getDb } from "../db";
import { getGroupAccess } from "./groups";
import { postJournal } from "./ledger";
import { initializePaystackTransaction, isPaystackTestKey, verifyPaystackTransaction, type PaystackMethod } from "../payments/paystack";
import { createInAppNotifications } from "./notifications";
import { isRetryableProviderEvent } from "../domain/provider-events";

const formatKes = (minor: number) => `KES ${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

export async function createContributionIntent(input: {
  groupId: number;
  contributionId: number;
  amountMinor: number;
  method: PaystackMethod;
  userId: number;
  phone?: string;
  email?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const access = await getGroupAccess(input.groupId, input.userId);
  if (!access) throw new Error("You are not an active member of this group.");
  const [obligation] = await db.select().from(contributions).where(and(
    eq(contributions.id, input.contributionId),
    eq(contributions.groupId, input.groupId),
  )).limit(1);
  if (!obligation) throw new Error("Contribution obligation was not found in this group.");
  const isGroupAdmin = access.permissions.includes("contributions:manage");
  if (!isGroupAdmin && obligation.memberId !== access.memberId) throw new Error("You can only contribute to your own obligation.");
  const [settings] = await db.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
  const allowOverpayments = settings?.allowOverpayments ?? false;
  const amountAvailable = Math.max(0, obligation.amountDueMinor - obligation.amountPaidMinor);
  if (input.amountMinor <= 0 || !Number.isSafeInteger(input.amountMinor)) throw new Error("Amount must be a positive integer number of minor units.");
  if (!allowOverpayments && input.amountMinor > amountAvailable) throw new Error("Amount exceeds the outstanding contribution.");
  if (amountAvailable <= 0 && !allowOverpayments) throw new Error("This contribution is already settled.");

  const reference = `PAM-${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
  const paystackConfigured = Boolean(process.env.PAYSTACK_SECRET_KEY);
  const testOnly = !paystackConfigured || isPaystackTestKey();
  if (!paystackConfigured && process.env.NODE_ENV === "production") {
    throw new Error("Paystack is not configured. No payment was initiated.");
  }
  const [{ id: paymentId }] = await db.insert(paymentTransactions).values({
    groupId: input.groupId,
    memberId: obligation.memberId,
    contributionId: obligation.id,
    provider: paystackConfigured ? "paystack" : "sandbox",
    providerReference: reference,
    method: input.method,
    phone: input.phone ?? null,
    amountMinor: input.amountMinor,
    currency: "KES",
    status: "pending",
    testOnly,
    metadata: testOnly ? { note: paystackConfigured ? "Paystack test-key transaction. It is diagnostic only and will not be credited as a real group receipt." : "Test-only instruction. No external payment was initiated." } : { groupId: input.groupId, contributionId: obligation.id },
  }).$returningId();

  if (!paystackConfigured) {
    await db.update(paymentTransactions).set({ status: "initiated", updatedAt: new Date() }).where(eq(paymentTransactions.id, paymentId));
    await db.insert(auditLogs).values({
      groupId: input.groupId,
      actorUserId: input.userId,
      action: "payment.test_instruction_created",
      entityType: "payment",
      entityId: String(paymentId),
      details: { reference, amountMinor: input.amountMinor, testOnly: true },
    });
    return { paymentId, reference, status: "initiated" as const, checkoutUrl: null, testOnly: true, message: "Test-only instruction created. No money was collected." };
  }

  try {
    const result = await initializePaystackTransaction({
      email: input.email || `member-${obligation.memberId}@pamoja.invalid`,
      amountMinor: input.amountMinor,
      reference,
      phone: input.phone,
      method: input.method,
      groupId: input.groupId,
      contributionId: obligation.id,
    });
    await db.update(paymentTransactions).set({
      status: "initiated",
      checkoutUrl: result.authorization_url,
      metadata: { groupId: input.groupId, contributionId: obligation.id, accessCode: result.access_code, testMode: isPaystackTestKey() },
      updatedAt: new Date(),
    }).where(eq(paymentTransactions.id, paymentId));
    await db.insert(auditLogs).values({
      groupId: input.groupId,
      actorUserId: input.userId,
      action: "payment.initiated",
      entityType: "payment",
      entityId: String(paymentId),
      details: { reference, amountMinor: input.amountMinor, testMode: isPaystackTestKey() },
    });
    return { paymentId, reference, status: "initiated" as const, checkoutUrl: result.authorization_url, testOnly: isPaystackTestKey(), message: "Payment is pending provider confirmation." };
  } catch (error) {
    await db.update(paymentTransactions).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentTransactions.id, paymentId));
    const message = error instanceof Error ? error.message : "Payment provider is unavailable.";
    throw new Error(message);
  }
}

function methodFromChannel(channel: string | undefined): "mpesa" | "pesalink" | "card" | "bank" | "unknown" {
  const value = (channel ?? "").toLowerCase();
  if (value.includes("mobile_money") || value.includes("mpesa")) return "mpesa";
  if (value.includes("bank_transfer") || value.includes("pesalink")) return "pesalink";
  if (value.includes("card")) return "card";
  if (value.includes("bank")) return "bank";
  return "unknown";
}

export async function recordPaystackWebhook(input: {
  eventKey: string;
  eventType: string;
  reference?: string;
  payload: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const existingEvent = await db.select({ id: paymentEvents.id, verificationStatus: paymentEvents.verificationStatus }).from(paymentEvents).where(and(
    eq(paymentEvents.provider, "paystack"),
    eq(paymentEvents.eventKey, input.eventKey),
  )).limit(1);

  let eventId: number;
  if (existingEvent.length) {
    const existing = existingEvent[0];
    if (!isRetryableProviderEvent(existing.verificationStatus)) return { duplicate: true };
    eventId = existing.id;
    await db.update(paymentEvents).set({ verificationStatus: "received" }).where(eq(paymentEvents.id, eventId));
  } else {
    try {
      const [eventResult] = await db.insert(paymentEvents).values({
        provider: "paystack",
        eventKey: input.eventKey,
        eventType: input.eventType,
        providerReference: input.reference ?? null,
        signatureValid: true,
        verificationStatus: "received",
        payload: input.payload,
      }).$returningId();
      eventId = eventResult.id;
    } catch (error) {
      const [racedEvent] = await db.select({ id: paymentEvents.id, verificationStatus: paymentEvents.verificationStatus }).from(paymentEvents).where(and(
        eq(paymentEvents.provider, "paystack"),
        eq(paymentEvents.eventKey, input.eventKey),
      )).limit(1);
      if (!racedEvent) throw error;
      if (!isRetryableProviderEvent(racedEvent.verificationStatus)) return { duplicate: true };
      eventId = racedEvent.id;
      await db.update(paymentEvents).set({ verificationStatus: "received" }).where(eq(paymentEvents.id, eventId));
    }
  }

  if (!input.reference) {
    await db.update(paymentEvents).set({ verificationStatus: "unmatched" }).where(eq(paymentEvents.id, eventId));
    return { duplicate: false, matched: false };
  }

  const [existingPayment] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.providerReference, input.reference)).limit(1);
  if (input.eventType !== "charge.success") {
    if (existingPayment && input.eventType === "charge.failed" && existingPayment.status !== "confirmed" && existingPayment.status !== "settled") {
      await db.update(paymentTransactions).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentTransactions.id, existingPayment.id));
    }
    const needsReview = ["charge.refunded", "refund.processed", "refund.success", "refund.pending", "refund.processing", "charge.dispute.create", "charge.dispute.resolve", "charge.reversed"].includes(input.eventType);
    await db.update(paymentEvents).set({
      paymentId: existingPayment?.id ?? null,
      verificationStatus: input.eventType === "charge.failed" ? "provider_failed" : needsReview ? "review_required" : "unknown_event",
    }).where(eq(paymentEvents.id, eventId));
    if (needsReview) await db.insert(auditLogs).values({ groupId: existingPayment?.groupId ?? null, actorUserId: null, action: "payment.provider_review_required", entityType: "payment_event", entityId: String(eventId), details: { eventType: input.eventType, reference: input.reference, paymentId: existingPayment?.id ?? null, note: "Refund/dispute event retained for review; no contribution or ledger balance was altered." } });
    return { duplicate: false, matched: Boolean(existingPayment) };
  }

  const verified = await verifyPaystackTransaction(input.reference);
  if (verified.status !== "success" || verified.reference !== input.reference || verified.currency !== "KES" || !Number.isSafeInteger(verified.amount) || verified.amount <= 0) {
    await db.update(paymentEvents).set({ paymentId: existingPayment?.id ?? null, verificationStatus: "verification_failed" }).where(eq(paymentEvents.id, eventId));
    if (existingPayment) await db.update(paymentTransactions).set({ status: "unmatched", updatedAt: new Date() }).where(eq(paymentTransactions.id, existingPayment.id));
    return { duplicate: false, matched: false };
  }

  const result = await db.transaction(async tx => {
    const [payment] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.providerReference, input.reference!)).limit(1).for("update");
    const [usedProviderTransaction] = await tx.select({ id: paymentTransactions.id, groupId: paymentTransactions.groupId }).from(paymentTransactions).where(eq(paymentTransactions.providerTransactionId, String(verified.id))).limit(1);
    if (usedProviderTransaction && usedProviderTransaction.id !== payment?.id) {
      if (payment) await tx.update(paymentTransactions).set({ status: "unmatched", metadata: { ...(payment.metadata as Record<string, unknown> ?? {}), duplicateProviderTransactionId: String(verified.id) }, updatedAt: new Date() }).where(eq(paymentTransactions.id, payment.id));
      await tx.update(paymentEvents).set({ paymentId: usedProviderTransaction.id, verificationStatus: "duplicate_provider_transaction" }).where(eq(paymentEvents.id, eventId));
      await tx.insert(auditLogs).values({ groupId: payment?.groupId ?? usedProviderTransaction.groupId, actorUserId: null, action: "payment.duplicate_provider_transaction", entityType: "payment_event", entityId: String(eventId), details: { reference: input.reference, providerTransactionId: String(verified.id), previouslyLinkedPaymentId: usedProviderTransaction.id } });
      return { matched: false, duplicate: true, reason: "Provider transaction ID was already recorded." };
    }
    if (!payment) {
      const [{ id: unmatchedId }] = await tx.insert(paymentTransactions).values({
        provider: "paystack",
        providerReference: input.reference!,
        providerTransactionId: String(verified.id),
        method: methodFromChannel(verified.channel),
        amountMinor: verified.amount,
        currency: verified.currency,
        status: "unmatched",
        testOnly: isPaystackTestKey(),
        confirmedAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
        metadata: { providerStatus: verified.status, note: isPaystackTestKey() ? "Test-key diagnostic only. No real funds were received or credited." : "Provider-verified payment has no matching platform instruction." },
      }).$returningId();
      await tx.update(paymentEvents).set({ paymentId: unmatchedId, verificationStatus: isPaystackTestKey() ? "test_only_verified" : "verified_unmatched" }).where(eq(paymentEvents.id, eventId));
      await tx.insert(auditLogs).values({ groupId: null, actorUserId: null, action: isPaystackTestKey() ? "payment.test_verified_not_credited" : "payment.verified_unmatched", entityType: "payment", entityId: String(unmatchedId), details: { reference: input.reference, amountMinor: verified.amount, testOnly: isPaystackTestKey() } });
      return { matched: false, testOnly: isPaystackTestKey(), reason: "No matching platform instruction." };
    }
    if (payment.testOnly || isPaystackTestKey()) {
      const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
      await tx.update(paymentTransactions).set({
        status: "unmatched",
        providerTransactionId: String(verified.id),
        method: methodFromChannel(verified.channel),
        confirmedAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
        metadata: { ...metadata, providerStatus: verified.status, testOnly: true, note: "Test-key verification is diagnostic only. It is not a real receipt and never credits group balances." },
        updatedAt: new Date(),
      }).where(eq(paymentTransactions.id, payment.id));
      await tx.update(paymentEvents).set({ paymentId: payment.id, verificationStatus: "test_only_verified" }).where(eq(paymentEvents.id, eventId));
      await tx.insert(auditLogs).values({ groupId: payment.groupId, actorUserId: null, action: "payment.test_verified_not_credited", entityType: "payment", entityId: String(payment.id), details: { reference: input.reference, amountMinor: verified.amount, testOnly: true } });
      return { matched: false, testOnly: true, reason: "Test-only provider transaction was not credited." };
    }
    if (["confirmed", "settled", "reversed"].includes(payment.status)) {
      await tx.update(paymentEvents).set({ paymentId: payment.id, verificationStatus: "duplicate_success" }).where(eq(paymentEvents.id, eventId));
      return { matched: payment.status === "confirmed" || payment.status === "settled", duplicate: true };
    }
    const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
    const exactAmount = verified.amount === payment.amountMinor;
    const exactCurrency = verified.currency === payment.currency;
    if (!exactAmount || !exactCurrency || !payment.groupId || !payment.contributionId || !payment.memberId) {
      await tx.update(paymentTransactions).set({
        status: "unmatched",
        providerTransactionId: String(verified.id),
        method: methodFromChannel(verified.channel),
        metadata: { ...metadata, providerAmountMinor: verified.amount, providerCurrency: verified.currency, providerStatus: verified.status },
        updatedAt: new Date(),
      }).where(eq(paymentTransactions.id, payment.id));
      await tx.update(paymentEvents).set({ paymentId: payment.id, verificationStatus: "verified_unmatched" }).where(eq(paymentEvents.id, eventId));
      await tx.insert(auditLogs).values({ groupId: payment.groupId, actorUserId: null, action: "payment.verified_unmatched", entityType: "payment", entityId: String(payment.id), details: { reference: input.reference, exactAmount, exactCurrency } });
      return { matched: false, reason: "Provider-verified amount or currency does not match the instruction." };
    }
    const [obligation] = await tx.select().from(contributions).where(and(
      eq(contributions.id, payment.contributionId),
      eq(contributions.groupId, payment.groupId),
      eq(contributions.memberId, payment.memberId),
    )).limit(1).for("update");
    if (!obligation) {
      await tx.update(paymentTransactions).set({ status: "unmatched", providerTransactionId: String(verified.id), updatedAt: new Date() }).where(eq(paymentTransactions.id, payment.id));
      await tx.update(paymentEvents).set({ paymentId: payment.id, verificationStatus: "verified_unmatched" }).where(eq(paymentEvents.id, eventId));
      return { matched: false, reason: "No matching obligation." };
    }
    const [settings] = await tx.select().from(groupSettings).where(eq(groupSettings.groupId, payment.groupId)).limit(1);
    let allocation;
    try {
      allocation = applyContributionPayment({
        dueMinor: obligation.amountDueMinor,
        paidMinor: obligation.amountPaidMinor,
        incomingMinor: verified.amount,
        allowOverpayment: settings?.allowOverpayments ?? false,
      });
    } catch (error) {
      await tx.update(paymentTransactions).set({ status: "unmatched", providerTransactionId: String(verified.id), method: methodFromChannel(verified.channel), metadata: { ...metadata, providerAmountMinor: verified.amount, providerStatus: verified.status, reconciliationReason: error instanceof Error ? error.message : "Allocation rejected by group policy." }, updatedAt: new Date() }).where(eq(paymentTransactions.id, payment.id));
      await tx.update(paymentEvents).set({ paymentId: payment.id, verificationStatus: "verified_unmatched" }).where(eq(paymentEvents.id, eventId));
      await tx.insert(auditLogs).values({ groupId: payment.groupId, actorUserId: null, action: "payment.verified_unmatched", entityType: "payment", entityId: String(payment.id), details: { reference: input.reference, reason: error instanceof Error ? error.message : "Allocation rejected by group policy." } });
      return { matched: false, reason: "Provider-verified payment cannot be allocated under the group’s current overpayment policy." };
    }
    const nextStatus = contributionStatus(obligation.amountDueMinor, allocation.amountPaidMinor, obligation.dueDate);
    await tx.update(contributions).set({ amountPaidMinor: allocation.amountPaidMinor, status: nextStatus, updatedAt: new Date() }).where(eq(contributions.id, obligation.id));
    await tx.update(paymentTransactions).set({
      status: "confirmed",
      providerTransactionId: String(verified.id),
      method: methodFromChannel(verified.channel),
      amountMinor: verified.amount,
      currency: verified.currency,
      confirmedAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
      metadata: { ...metadata, providerStatus: verified.status },
      updatedAt: new Date(),
    }).where(eq(paymentTransactions.id, payment.id));
    await postJournal(tx, {
      groupId: payment.groupId,
      sourceType: "payment",
      sourceId: String(payment.id),
      description: `Verified contribution payment ${payment.providerReference}`,
      lines: [
        { accountCode: "provider_receivable", debitMinor: verified.amount, creditMinor: 0, description: "Provider-confirmed receivable; not verified cash" },
        ...(allocation.amountAppliedMinor > 0 ? [{ accountCode: "member_savings_liability", debitMinor: 0, creditMinor: allocation.amountAppliedMinor, description: "Member contribution allocation" }] : []),
        ...(allocation.overpaymentMinor > 0 ? [{ accountCode: "member_unapplied_funds", debitMinor: 0, creditMinor: allocation.overpaymentMinor, description: "Unapplied member funds" }] : []),
      ],
    });
    await tx.insert(reconciliationRecords).values({ groupId: payment.groupId, paymentId: payment.id, contributionId: obligation.id, actorUserId: null, action: "matched", reason: "Automatically matched using the provider reference and independently verified transaction." });
    await tx.insert(auditLogs).values({ groupId: payment.groupId, actorUserId: null, action: "payment.reconciled", entityType: "payment", entityId: String(payment.id), details: { contributionId: obligation.id, amountMinor: verified.amount, appliedMinor: allocation.amountAppliedMinor, overpaymentMinor: allocation.overpaymentMinor } });
    await tx.update(paymentEvents).set({ paymentId: payment.id, verificationStatus: "verified_and_reconciled" }).where(eq(paymentEvents.id, eventId));
    const [member] = await tx.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.id, obligation.memberId)).limit(1);
    await createInAppNotifications(tx, { groupId: payment.groupId, userIds: [member?.userId], type: "contribution_confirmed", title: "Contribution provider-confirmed", body: `${formatKes(verified.amount)} has been provider-confirmed and recorded as a receivable. It is not a verified custodian cash balance.`, metadata: { paymentId: payment.id, contributionId: obligation.id, amountMinor: verified.amount } });
    return { matched: true, paymentId: payment.id, contributionId: obligation.id };
  });
  return { duplicate: false, ...result };
}

export async function resolveUnmatchedPayment(input: {
  groupId: number;
  paymentId: number;
  contributionId: number;
  actorUserId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  return db.transaction(async tx => {
    const [payment] = await tx.select().from(paymentTransactions).where(and(
      eq(paymentTransactions.id, input.paymentId),
      eq(paymentTransactions.groupId, input.groupId),
      eq(paymentTransactions.status, "unmatched"),
    )).limit(1).for("update");
    if (!payment || payment.testOnly || payment.provider !== "paystack" || !payment.providerTransactionId) {
      throw new Error("Only a provider-verified, group-linked unmatched Paystack payment can be reconciled.");
    }
    const [obligation] = await tx.select().from(contributions).where(and(
      eq(contributions.id, input.contributionId),
      eq(contributions.groupId, input.groupId),
    )).limit(1).for("update");
    if (!obligation) throw new Error("The selected obligation is not in this group.");
    const [settings] = await tx.select().from(groupSettings).where(eq(groupSettings.groupId, input.groupId)).limit(1);
    const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
    const amount = typeof metadata.providerAmountMinor === "number" ? metadata.providerAmountMinor : payment.amountMinor;
    const allocation = applyContributionPayment({ dueMinor: obligation.amountDueMinor, paidMinor: obligation.amountPaidMinor, incomingMinor: amount, allowOverpayment: settings?.allowOverpayments ?? false });
    const nextStatus = contributionStatus(obligation.amountDueMinor, allocation.amountPaidMinor, obligation.dueDate);
    await tx.update(contributions).set({ amountPaidMinor: allocation.amountPaidMinor, status: nextStatus, updatedAt: new Date() }).where(eq(contributions.id, obligation.id));
    await tx.update(paymentTransactions).set({ status: "confirmed", contributionId: obligation.id, memberId: obligation.memberId, updatedAt: new Date() }).where(eq(paymentTransactions.id, payment.id));
    await postJournal(tx, {
      groupId: input.groupId,
      sourceType: "payment_manual_reconciliation",
      sourceId: String(payment.id),
      description: `Manually reconciled provider payment ${payment.providerReference}`,
      postedByUserId: input.actorUserId,
      lines: [
        { accountCode: "provider_receivable", debitMinor: amount, creditMinor: 0 },
        ...(allocation.amountAppliedMinor > 0 ? [{ accountCode: "member_savings_liability", debitMinor: 0, creditMinor: allocation.amountAppliedMinor }] : []),
        ...(allocation.overpaymentMinor > 0 ? [{ accountCode: "member_unapplied_funds", debitMinor: 0, creditMinor: allocation.overpaymentMinor }] : []),
      ],
    });
    await tx.insert(reconciliationRecords).values({ groupId: input.groupId, paymentId: payment.id, contributionId: obligation.id, actorUserId: input.actorUserId, action: "matched", reason: input.reason.trim() });
    await tx.insert(auditLogs).values({ groupId: input.groupId, actorUserId: input.actorUserId, action: "payment.manual_reconciliation", entityType: "payment", entityId: String(payment.id), details: { contributionId: obligation.id, reason: input.reason.trim(), amountMinor: amount } });
    const [member] = await tx.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.id, obligation.memberId)).limit(1);
    await createInAppNotifications(tx, { groupId: input.groupId, userIds: [member?.userId], type: "contribution_reconciled", title: "Contribution reconciliation recorded", body: `${formatKes(amount)} was matched to your contribution by a group administrator. Provider settlement remains separate from custodian cash verification.`, metadata: { paymentId: payment.id, contributionId: obligation.id, amountMinor: amount } });
    return { success: true, amountAppliedMinor: allocation.amountAppliedMinor, overpaymentMinor: allocation.overpaymentMinor };
  });
}
