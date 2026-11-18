import { describe, expect, it } from "vitest";
import { scopeDashboardObligations, summarizeDashboardObligations } from "./dashboard";

const obligations = [
  { id: 1, memberId: 10, amountDueMinor: 1_000, amountPaidMinor: 400 },
  { id: 2, memberId: 20, amountDueMinor: 2_000, amountPaidMinor: 1_250 },
];

describe("dashboard obligation privacy", () => {
  it("limits a member's rows and derived totals to that member", () => {
    const visible = scopeDashboardObligations(obligations, 10, false);
    expect(visible).toEqual([obligations[0]]);
    expect(summarizeDashboardObligations(visible)).toEqual({
      totalExpectedMinor: 1_000,
      totalReceivedMinor: 400,
      outstandingMinor: 600,
    });
  });

  it("allows authorized readers to summarize all group obligations", () => {
    const visible = scopeDashboardObligations(obligations, 10, true);
    expect(visible).toEqual(obligations);
    expect(summarizeDashboardObligations(visible)).toEqual({
      totalExpectedMinor: 3_000,
      totalReceivedMinor: 1_650,
      outstandingMinor: 1_350,
    });
  });
});
