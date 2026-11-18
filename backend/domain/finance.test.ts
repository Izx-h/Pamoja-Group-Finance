import { describe, expect, it } from "vitest";
import {
  applyContributionPayment,
  assertBalanced,
  canApprovePayout,
  contributionStatus,
  formatKes,
  parseKesToMinor,
} from "./finance";

describe("integer minor-unit money", () => {
  it("parses and formats KES without floating-point ledger math", () => {
    expect(() => parseKesToMinor("5,000.00")).toThrow();
    expect(parseKesToMinor("5000.05")).toBe(500005);
    expect(formatKes(500005)).toContain("5,000.05");
    expect(() => parseKesToMinor("1.001")).toThrow();
    expect(() => parseKesToMinor("-1")).toThrow();
  });
});

describe("double-entry invariant", () => {
  it("accepts a balanced journal", () => {
    expect(() => assertBalanced([
      { accountCode: "provider_receivable", debitMinor: 5000, creditMinor: 0 },
      { accountCode: "member_savings_liability", debitMinor: 0, creditMinor: 5000 },
    ])).not.toThrow();
  });

  it("rejects unbalanced or ambiguous journal lines", () => {
    expect(() => assertBalanced([
      { accountCode: "a", debitMinor: 5000, creditMinor: 0 },
      { accountCode: "b", debitMinor: 0, creditMinor: 4999 },
    ])).toThrow(/equal/);
    expect(() => assertBalanced([
      { accountCode: "a", debitMinor: 1, creditMinor: 1 },
      { accountCode: "b", debitMinor: 0, creditMinor: 0 },
    ])).toThrow(/either a debit or a credit/);
  });
});

describe("contribution calculation", () => {
  it("applies partial payments and records overpayment separately", () => {
    expect(applyContributionPayment({ dueMinor: 10000, paidMinor: 3000, incomingMinor: 9000, allowOverpayment: true })).toEqual({
      amountAppliedMinor: 7000,
      overpaymentMinor: 2000,
      amountPaidMinor: 10000,
    });
  });

  it("blocks overpayment when the group rule forbids it", () => {
    expect(() => applyContributionPayment({ dueMinor: 10000, paidMinor: 0, incomingMinor: 10001, allowOverpayment: false })).toThrow(/exceeds/);
  });

  it("calculates pending, partial, settled, and late states", () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(contributionStatus(100, 0, future)).toBe("pending");
    expect(contributionStatus(100, 50, future)).toBe("partially_paid");
    expect(contributionStatus(100, 100, past)).toBe("settled");
    expect(contributionStatus(100, 0, past)).toBe("late");
  });
});

describe("payout authorization policy", () => {
  const base = {
    initiatorUserId: 1,
    approverUserId: 2,
    prohibitSelfApproval: true,
    requiredApprovals: 2,
    existingApprovals: 0,
    groupMemberIsActive: true,
    payoutIsPending: true,
    amountMatches: true,
    beneficiaryMatches: true,
  };

  it("allows an independent active approver for the exact pending payload", () => {
    expect(canApprovePayout(base)).toEqual({ allowed: true });
  });

  it("blocks self-approval, stale payloads, and approvals after threshold", () => {
    expect(canApprovePayout({ ...base, approverUserId: 1 }).allowed).toBe(false);
    expect(canApprovePayout({ ...base, amountMatches: false }).allowed).toBe(false);
    expect(canApprovePayout({ ...base, existingApprovals: 2 }).allowed).toBe(false);
  });
});
