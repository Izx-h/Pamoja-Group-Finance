import { FormEvent, useState } from "react";
import { Banknote, CircleAlert, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useActiveGroup } from "@/contexts/GroupContext";
import { EmptyState, formatKES, PageHeading, SectionCard, StatusPill } from "@/lib/finance-ui";

export default function LoansPage() {
  const { groupId, activeGroup } = useActiveGroup();
  const utils = trpc.useUtils();
  const data = trpc.loans.list.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const [product, setProduct] = useState({ name: "Member loan", annualRateBps: "1200", maxAmount: "", termMonths: "6" });
  const [application, setApplication] = useState({ productId: "", amount: "", purpose: "" });
  const createProduct = trpc.loans.createProduct.useMutation({ onSuccess: async () => { await utils.invalidate(); toast.success("Loan product created"); }, onError: error => toast.error(error.message) });
  const submit = trpc.loans.submitApplication.useMutation({ onSuccess: async () => { await utils.invalidate(); setApplication({ ...application, amount: "", purpose: "" }); toast.success("Loan application submitted"); }, onError: error => toast.error(error.message) });
  const review = trpc.loans.review.useMutation({ onSuccess: async result => { await utils.invalidate(); toast.message(result.message); }, onError: error => toast.error(error.message) });
  const canReview = activeGroup?.permissions?.includes("loan:review") ?? false;
  const canApply = activeGroup?.permissions?.includes("loan:apply") ?? false;

  function create(event: FormEvent) {
    event.preventDefault();
    if (!groupId) return;
    const amountMinor = parseAmount(product.maxAmount);
    if (amountMinor === null) return;
    const annualRateBps = Number(product.annualRateBps);
    if (!Number.isSafeInteger(annualRateBps)) { toast.error("Enter the annual interest rate in basis points (e.g. 1200 = 12%)."); return; }
    createProduct.mutate({ groupId, name: product.name, annualRateBps, maxAmountMinor: amountMinor, termMonths: Number(product.termMonths), requiresGuarantors: 0 });
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!groupId) return;
    const amountMinor = parseAmount(application.amount);
    if (amountMinor === null) return;
    submit.mutate({ groupId, productId: Number(application.productId), requestedAmountMinor: amountMinor, purpose: application.purpose });
  }

  return <div>
    <PageHeading eyebrow="Member lending foundation" title="Loans & applications" description="Applications and decisions are recorded in the group. No loan can be disbursed until licensing, verified available funds, and an approved provider execution path are established."/>
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#e1eae3] bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#406a4d]"><Banknote className="h-4 w-4"/>Product terms</div><p className="mt-1.5 text-[10px] leading-5 text-[#7e8b82]">Annual interest uses basis points. A simple annual-rate pro-rating is recorded in integer minor units. Accepted guarantor workflows, repayments, and payment collection are not enabled.</p></div>
      <div className="rounded-xl border border-[#ecdfc7] bg-[#fffaf0] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#8a6b34]"><CircleAlert className="h-4 w-4"/>Regulatory and funding gate</div><p className="mt-1.5 text-[10px] leading-5 text-[#7c715c]">This product is not a licensed lender or SACCO. Review is not a disbursement or credit offer; approved amounts remain reserved pending a provider integration.</p></div>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      {canReview && <SectionCard title="Configure loan product" description="Set a limit and terms for applications in this group."><form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[#607067] sm:col-span-2">Product name<input required minLength={2} maxLength={120} value={product.name} onChange={e => setProduct({ ...product, name: e.target.value })} className={field}/></label>
        <label className="text-xs font-medium text-[#607067]">Max amount (KES)<input required inputMode="decimal" value={product.maxAmount} onChange={e => setProduct({ ...product, maxAmount: e.target.value })} className={field}/></label>
        <label className="text-xs font-medium text-[#607067]">Annual rate (basis points)<input required type="number" min={0} max={100000} value={product.annualRateBps} onChange={e => setProduct({ ...product, annualRateBps: e.target.value })} className={field}/></label>
        <label className="text-xs font-medium text-[#607067]">Term (months)<input required type="number" min={1} max={120} value={product.termMonths} onChange={e => setProduct({ ...product, termMonths: e.target.value })} className={field}/></label>
        <div className="text-xs font-medium text-[#607067]">Required guarantors<input disabled value="Not available" className={`${field} cursor-not-allowed bg-[#f5f7f5]`}/><p className="mt-1 text-[10px] text-[#89948c]">Products are restricted to zero until guarantor acceptance is implemented.</p></div>
        <div className="sm:col-span-2"><Button disabled={createProduct.isPending} className="bg-[#0f503d] hover:bg-[#0b3e2e]">Create loan product</Button></div>
      </form></SectionCard>}

      {canApply && <SectionCard title="Apply for a loan" description="The API checks group membership, product status, amount limit, and existing outstanding loans."><form onSubmit={apply} className="space-y-3">
        <label className="block text-xs font-medium text-[#607067]">Loan product<select required value={application.productId} onChange={e => setApplication({ ...application, productId: e.target.value })} className={field}><option value="">Select product…</option>{(data.data?.products ?? []).filter(item => item.active && item.requiresGuarantors === 0).map(item => <option key={item.id} value={item.id}>{item.name} · up to {formatKES(item.maxAmountMinor)} · {item.annualRateBps / 100}% p.a.</option>)}</select></label>
        <label className="block text-xs font-medium text-[#607067]">Requested amount (KES)<input required inputMode="decimal" value={application.amount} onChange={e => setApplication({ ...application, amount: e.target.value })} className={field}/></label>
        <label className="block text-xs font-medium text-[#607067]">Purpose<textarea required minLength={4} maxLength={1000} rows={3} value={application.purpose} onChange={e => setApplication({ ...application, purpose: e.target.value })} className={`${field} resize-y`}/></label>
        <Button disabled={submit.isPending || !(data.data?.products ?? []).some(item => item.active && item.requiresGuarantors === 0)} className="bg-[#0f503d] hover:bg-[#0b3e2e]">Submit application</Button>
      </form></SectionCard>}
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <SectionCard title="Loan products" description="Terms configured by a group reviewer.">{data.data?.products.length ? <div className="space-y-2">{data.data.products.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8ece8] px-3.5 py-3"><div><p className="text-xs font-semibold text-[#314738]">{item.name}</p><p className="mt-1 text-[10px] text-[#869189]">{item.annualRateBps / 100}% per year · {item.termMonths} months · {item.requiresGuarantors} guarantors</p></div><p className="text-xs font-semibold tabular-nums text-[#3c5c45]">Up to {formatKES(item.maxAmountMinor)}</p></div>)}</div> : <EmptyState title="No loan products" description="A reviewer can configure an application product for this group."/>}</SectionCard>
      <SectionCard title="Applications and active loans" description="An approved application remains pending disbursement; it is not a settled loan payment.">{data.data?.applications.length ? <div className="space-y-3">{data.data.applications.map(row => { const app = row.application; return <div key={app.id} className="rounded-xl border border-[#e6ebe6] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[#2e4537]">{row.memberName} · {row.productName}</p><p className="mt-1 text-[10px] text-[#8a958e]">Requested {formatKES(app.requestedAmountMinor)}</p></div><StatusPill status={app.status}/></div><p className="mt-3 text-xs leading-5 text-[#68776e]">{app.purpose}</p>{canReview && app.status === "submitted" && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ groupId: groupId!, applicationId: app.id, decision: "approved" })}>Approve and reserve (no disbursement)</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ groupId: groupId!, applicationId: app.id, decision: "rejected", reviewNote: "Rejected by group reviewer." })}>Reject</Button></div>}</div>; })}</div> : <EmptyState title="No loan applications" description="Applications will appear here after a member submits one."/>}{data.data?.activeLoans.length ? <div className="mt-3 border-t border-[#edf1ed] pt-3">{data.data.activeLoans.map(loan => <p key={loan.id} className="text-xs text-[#607067]">Loan #{loan.id} · principal {formatKES(loan.principalMinor)} · outstanding principal {formatKES(loan.outstandingPrincipalMinor)} · {loan.status === "pending_disbursement" ? "funds reserved, not disbursed" : loan.status}</p>)}</div> : null}</SectionCard>
    </div>

    <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#e4eae4] bg-white px-4 py-3 text-[10px] leading-5 text-[#7f8b83]"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#68846d]"/>No repayment schedule, repayment collection, or provider loan transfer is enabled. A pending-disbursement reservation is not a transfer and is not posted as a loan receivable.</div>
  </div>;
}

const field = "mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm text-[#263a30] outline-none focus:border-[#75a886] focus:ring-2 focus:ring-[#d9ecdd]";

function parseAmount(value: string) {
  try {
    const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) throw new Error("Enter a KES amount with up to two decimal places.");
    const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Enter a positive amount.");
    return amount;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Invalid amount");
    return null;
  }
}
