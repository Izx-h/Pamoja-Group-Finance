import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { assertBalanced, type JournalLineDraft } from "../domain/finance";
import { journalEntries, journalLines, ledgerAccounts } from "../../database/schema";

export async function postJournal(tx: any, input: {
  groupId: number;
  sourceType: string;
  sourceId: string;
  description: string;
  currency?: string;
  postedByUserId?: number | null;
  reversalOfId?: number | null;
  lines: JournalLineDraft[];
}) {
  assertBalanced(input.lines);
  const accounts = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.groupId, input.groupId));
  const accountsByCode = new Map(accounts.map((account: { code: string; id: number }) => [account.code, account.id]));
  for (const line of input.lines) {
    if (!accountsByCode.has(line.accountCode)) throw new Error(`Ledger account ${line.accountCode} is not configured for this group.`);
  }
  const [{ id: entryId }] = await tx.insert(journalEntries).values({
    groupId: input.groupId,
    transactionId: randomUUID(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    description: input.description,
    currency: input.currency ?? "KES",
    postedByUserId: input.postedByUserId ?? null,
    reversalOfId: input.reversalOfId ?? null,
  }).$returningId();
  await tx.insert(journalLines).values(input.lines.map((line, index) => ({
    journalEntryId: entryId,
    accountId: accountsByCode.get(line.accountCode)!,
    lineNumber: index + 1,
    debitMinor: line.debitMinor,
    creditMinor: line.creditMinor,
    description: line.description ?? null,
  })));
  return { entryId };
}

export async function findJournalBySource(db: any, groupId: number, sourceType: string, sourceId: string) {
  const [entry] = await db.select().from(journalEntries).where(and(
    eq(journalEntries.groupId, groupId),
    eq(journalEntries.sourceType, sourceType),
    eq(journalEntries.sourceId, sourceId),
  )).limit(1);
  return entry ?? null;
}
