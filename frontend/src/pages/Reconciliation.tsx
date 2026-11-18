import { FormEvent, useState } from "react";
import { AlertCircle, ArrowRightLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useActiveGroup } from "@/contexts/GroupContext";
import { EmptyState, formatDate, formatKES, PageHeading, SectionCard, StatusPill } from "@/lib/finance-ui";

export default function ReconciliationPage() {
  const { groupId } = useActiveGroup();
  const utils = trpc.useUtils();
  const queue = trpc.finance.unmatched.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const providerReviews = trpc.finance.providerReviewEvents.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const obligations = trpc.groups.contributions.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const [target, setTarget] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const resolve = trpc.finance.resolveUnmatched.useMutation({ onSuccess: async () => { await utils.invalidate(); toast.success("Manual reconciliation recorded"); }, onError: error => toast.error(error.message) });
  const rows = queue.data ?? [];
  const submit = (event: FormEvent, paymentId: number) => {
    event.preventDefault();
    const contributionId = Number(target[paymentId]);
    if (!contributionId || !reasons[paymentId]?.trim()) { toast.error("Select an obligation and enter a reconciliation reason."); return; }
    resolve.mutate({ groupId: groupId!, paymentId, contributionId, reason: reasons[paymentId] });
  };
  return <div><PageHeading eyebrow="Payment operations" title="Reconciliation review" description="Only signed and provider-verified unmatched transactions can be manually allocated. Each decision is recorded with its reason and administrator."/>
    <div className="mb-4 flex gap-3 rounded-xl border border-[#f0dfbd] bg-[#fff9ea] px-4 py-3 text-xs leading-5 text-[#7b673b]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><p>Review the verified reference and amount before assigning an obligation. A manual match cannot change the provider’s underlying result.</p></div>
    <SectionCard title="Unmatched transactions" description="This queue is scoped to your active group and reconciliation permission.">
      {queue.isLoading ? <p className="py-5 text-sm text-[#849088]">Loading unmatched receipts…</p> : rows.length === 0 ? <EmptyState title="No unmatched receipts" description="Provider-verified receipts that cannot be reconciled automatically will appear here. Test-only instructions are not eligible for manual reconciliation."/> : <div className="space-y-4">{rows.map(({ payment, memberName }) => <form key={payment.id} onSubmit={event => submit(event, payment.id)} className="rounded-xl border border-[#e8ece8] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-mono text-xs text-[#43594a]">{payment.providerReference}</span><StatusPill status={payment.status}/></div><p className="mt-2 text-xs text-[#718078]">{memberName || "Unidentified member"} · {payment.method} · {formatDate(payment.confirmedAt ?? payment.createdAt)}</p><p className="mt-1 text-sm font-semibold tabular-nums text-[#293f33]">{formatKES(payment.amountMinor)} <span className="text-[10px] font-normal text-[#8b968f]">{payment.currency}</span></p></div><span className="rounded-lg bg-[#f5f7f5] px-2.5 py-1 text-[10px] text-[#78847d]">{payment.provider}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]"><label className="text-[11px] font-medium text-[#68766d]">Match to contribution<select required value={target[payment.id] ?? ""} onChange={e => setTarget(prev => ({ ...prev, [payment.id]: e.target.value }))} className={field}><option value="">Select an obligation…</option>{(obligations.data ?? []).map(item => <option key={item.id} value={item.id}>{item.memberName ?? "Member"} · {item.scheduleLabel} · {item.periodKey} · {formatKES(item.amountDueMinor)}</option>)}</select></label><label className="text-[11px] font-medium text-[#68766d]">Reason for manual match<input required minLength={6} maxLength={1000} value={reasons[payment.id] ?? ""} onChange={e => setReasons(prev => ({ ...prev, [payment.id]: e.target.value }))} placeholder="Explain how the receipt was identified" className={field}/></label><div className="flex items-end"><Button disabled={resolve.isPending} className="w-full bg-[#0f503d] hover:bg-[#0b3e2e] lg:w-auto"><ArrowRightLeft className="h-4 w-4"/>Resolve</Button></div></div></form>)}</div>}
    </SectionCard>
    <SectionCard title="Provider event review" description="Signed provider notices are retained for investigation; reversals and disputes do not automatically rewrite the ledger.">
      {(providerReviews.data ?? []).length === 0 ? <EmptyState title="No provider events awaiting review" description="Refund, dispute, reversal, duplicate-transaction, or verification-failure notices associated with this group will appear here."/> : <div className="space-y-3">{providerReviews.data!.map(event => <article key={event.eventId} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#f0dfbd] bg-[#fffdf7] p-4"><div className="flex min-w-0 gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#987740]"/><div><p className="text-sm font-semibold text-[#4b4030]">{event.eventType}</p><p className="mt-1 text-xs text-[#786d5b]">Reference {event.providerReference || "not supplied"} · Event #{event.eventId}</p><p className="mt-1 text-[11px] text-[#8c806c]">Received {formatDate(event.receivedAt)} · Payment state: {event.paymentStatus ?? "unknown"}</p></div></div><div className="text-right"><StatusPill status={event.verificationStatus}/>{event.amountMinor != null && <p className="mt-2 text-xs font-semibold tabular-nums text-[#43594a]">{formatKES(event.amountMinor)} {event.currency}</p>}</div></article>)}</div>}
    </SectionCard>
  </div>;
}

const field = "mt-1.5 w-full rounded-lg border border-[#dfe7df] bg-white px-3 py-2.5 text-xs text-[#263a30] outline-none focus:border-[#75a886] focus:ring-2 focus:ring-[#d9ecdd]";
