export type DashboardObligation = {
  memberId: number;
  amountDueMinor: number;
  amountPaidMinor: number;
};

export function scopeDashboardObligations<T extends DashboardObligation>(
  obligations: readonly T[],
  memberId: number,
  canReadAll: boolean,
): T[] {
  return canReadAll ? [...obligations] : obligations.filter(obligation => obligation.memberId === memberId);
}

export function summarizeDashboardObligations(obligations: readonly DashboardObligation[]) {
  const totalExpectedMinor = obligations.reduce((sum, obligation) => sum + obligation.amountDueMinor, 0);
  const totalReceivedMinor = obligations.reduce((sum, obligation) => sum + obligation.amountPaidMinor, 0);
  return {
    totalExpectedMinor,
    totalReceivedMinor,
    outstandingMinor: Math.max(0, totalExpectedMinor - totalReceivedMinor),
  };
}
