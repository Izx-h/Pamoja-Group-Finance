export type JournalLineDraft = {
  accountCode: string;
  debitMinor: number;
  creditMinor: number;
  description?: string;
};

const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;

export function parseKesToMinor(value: string): number {
  const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Enter a positive KES amount with up to two decimal places.");
  const major = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const minor = major * 100 + cents;
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_SAFE_MINOR) {
    throw new Error("Amount is outside the supported range.");
  }
  return minor;
}

export function formatKes(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Money must be an integer number of minor units.");
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function assertSafeMinor(value: number, field = "amount"): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_MINOR) {
    throw new Error(`${field} must be a non-negative integer number of minor units.`);
  }
}

export function assertBalanced(lines: JournalLineDraft[]): void {
  if (lines.length < 2) throw new Error("A posted journal requires at least two lines.");
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    assertSafeMinor(line.debitMinor, "debit");
    assertSafeMinor(line.creditMinor, "credit");
    if ((line.debitMinor > 0) === (line.creditMinor > 0)) {
      throw new Error("Each journal line must contain either a debit or a credit, but not both.");
    }
    debits += line.debitMinor;
    credits += line.creditMinor;
    if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits)) {
      throw new Error("Journal total exceeds the supported integer range.");
    }
  }
  if (debits <= 0 || debits !== credits) throw new Error("Journal debits and credits must be equal and positive.");
}

export function contributionStatus(amountDueMinor: number, amountPaidMinor: number, dueAt: Date, now = new Date()) {
  assertSafeMinor(amountDueMinor, "amount due");
  assertSafeMinor(amountPaidMinor, "amount paid");
  if (amountPaidMinor >= amountDueMinor) return "settled" as const;
  if (amountPaidMinor > 0) return "partially_paid" as const;
  if (dueAt.getTime() < now.getTime()) return "late" as const;
  return "pending" as const;
}

export function canApprovePayout(input: {
  initiatorUserId: number;
  approverUserId: number;
  prohibitSelfApproval: boolean;
  requiredApprovals: number;
  existingApprovals: number;
  groupMemberIsActive: boolean;
  payoutIsPending: boolean;
  amountMatches: boolean;
  beneficiaryMatches: boolean;
}): { allowed: boolean; reason?: string } {
  if (!input.groupMemberIsActive) return { allowed: false, reason: "Approver is not an active group member." };
  if (!input.payoutIsPending) return { allowed: false, reason: "Payout is not awaiting approval." };
  if (!input.amountMatches || !input.beneficiaryMatches) return { allowed: false, reason: "Approval payload no longer matches the payout." };
  if (input.prohibitSelfApproval && input.initiatorUserId === input.approverUserId) {
    return { allowed: false, reason: "Group policy prohibits self-approval." };
  }
  if (input.existingApprovals >= input.requiredApprovals) return { allowed: false, reason: "Approval threshold is already met." };
  return { allowed: true };
}

export function applyContributionPayment(input: {
  dueMinor: number;
  paidMinor: number;
  incomingMinor: number;
  allowOverpayment: boolean;
}) {
  assertSafeMinor(input.dueMinor, "amount due");
  assertSafeMinor(input.paidMinor, "amount paid");
  assertSafeMinor(input.incomingMinor, "incoming amount");
  const remaining = Math.max(0, input.dueMinor - input.paidMinor);
  if (!input.allowOverpayment && input.incomingMinor > remaining) {
    throw new Error("Payment exceeds the remaining contribution obligation.");
  }
  return {
    amountAppliedMinor: Math.min(remaining, input.incomingMinor),
    overpaymentMinor: Math.max(0, input.incomingMinor - remaining),
    amountPaidMinor: input.paidMinor + Math.min(remaining, input.incomingMinor),
  };
}
