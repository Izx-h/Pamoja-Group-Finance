export const PERMISSIONS = [
  "group:manage",
  "members:manage",
  "contributions:read_all",
  "contributions:manage",
  "payments:initiate",
  "reconciliation:manage",
  "ledger:read_all",
  "ledger:read_summary",
  "payout:initiate",
  "payout:approve",
  "loan:apply",
  "loan:review",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_GROUP_ROLES: Array<{ roleKey: string; label: string; permissions: Permission[] }> = [
  { roleKey: "chairperson", label: "Chairperson", permissions: ["group:manage", "members:manage", "contributions:read_all", "contributions:manage", "reconciliation:manage", "ledger:read_all", "payout:approve", "loan:review"] },
  { roleKey: "treasurer", label: "Treasurer", permissions: ["contributions:read_all", "contributions:manage", "payments:initiate", "reconciliation:manage", "ledger:read_all", "payout:initiate", "loan:review"] },
  { roleKey: "secretary", label: "Secretary", permissions: ["members:manage", "contributions:read_all", "ledger:read_all", "payout:approve"] },
  { roleKey: "member", label: "Member", permissions: ["payments:initiate", "ledger:read_summary", "loan:apply"] },
];
