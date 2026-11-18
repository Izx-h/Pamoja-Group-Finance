import { Link } from "wouter";
import { ArrowRight, CircleDollarSign, Landmark, ShieldCheck, Users, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useActiveGroup } from "@/contexts/GroupContext";
import { EmptyState, formatDate, formatKES, PageHeading, SectionCard, StatusPill } from "@/lib/finance-ui";

function Metric({ label, value, note, icon: Icon, tone = "green" }: { label: string; value: string; note: string; icon: typeof Users; tone?: "green" | "navy" | "amber" }) {
  const tones = { green: "bg-[#eaf4ed] text-[#31694c]", navy: "bg-[#eaf0f4] text-[#355c72]", amber: "bg-[#faf2e3] text-[#916b2e]" };
  return <div className="rounded-2xl border border-[#e5eae5] bg-white p-4 shadow-[0_2px_10px_rgba(22,52,36,.025)] sm:p-5"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-[#77847c]">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4"/></span></div><p className="mt-4 text-xl font-semibold tracking-tight tabular-nums text-[#192f25] sm:text-2xl">{value}</p><p className="mt-1.5 text-[10px] leading-4 text-[#87928b]">{note}</p></div>;
}

function displayFinancialAmount(value: number | undefined) {
  return value === undefined ? "Restricted" : formatKES(value);
}

export default function Home() {
  const { groupId, activeGroup, groups } = useActiveGroup();
  const groupQuery = trpc.groups.dashboard.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const ledgerQuery = trpc.finance.ledger.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const rotationQuery = trpc.rotations.list.useQuery({ groupId: groupId ?? 0 }, { enabled: Boolean(groupId) });
  const data = groupQuery.data;
  if (!groupId || groups.length === 0) return <div className="mx-auto max-w-3xl py-10"><PageHeading eyebrow="Your workspace" title="Start with a group" description="Pamoja keeps group records isolated and only displays financial information returned by the authenticated group services."/><div className="rounded-3xl border border-[#dfe9e0] bg-white p-7 sm:p-10"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f4ed] text-[#236245]"><Users className="h-6 w-6"/></div><h3 className="mt-5 text-xl font-semibold text-[#193329]">No group records yet</h3><p className="mt-2 max-w-lg text-sm leading-6 text-[#728077]">Create a group to configure members and contribution rules. You can also accept an invitation that matches your signed-in email.</p><Link href="/groups/new" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0f503d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a3e2f]">Create a group <ArrowRight className="h-4 w-4"/></Link></div></div>;
  if (groupQuery.isLoading) return <div className="space-y-4"><div className="h-8 w-56 animate-pulse rounded-lg bg-[#e7ece7]"/><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white"/>)}</div></div>;
  if (groupQuery.error) return <div className="rounded-2xl border border-[#f0d7d2] bg-white p-5 text-sm text-[#9c4b40]">{groupQuery.error.message}</div>;
  if (!data) return null;
  const stats = data.stats;
  const canReadAllContributions = data.role.permissions.includes("contributions:read_all");
  const percent = stats.totalExpectedMinor ? Math.min(100, Math.round(stats.totalReceivedMinor * 100 / stats.totalExpectedMinor)) : 0;
  const recentEntries = ledgerQuery.data?.mode === "detailed" ? ledgerQuery.data.entries.slice(0, 5) : [];
  const ledgerDetailsUnavailable = !data.role.permissions.includes("ledger:read_all") || Boolean(ledgerQuery.error);
  const nextRotation = rotationQuery.data?.find(item => item.displayStatus !== "paid");
  return <div>
    <PageHeading eyebrow={activeGroup?.type.replaceAll("_", " ") || "Group workspace"} title={data.group.name} description={data.group.description || "A shared view of contributions, approvals and the accounting record."} action={<Link href="/groups/new" className="inline-flex items-center gap-2 rounded-xl border border-[#dce5dd] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#345743] hover:bg-[#f7faf7]">Add another group <ArrowRight className="h-3.5 w-3.5"/></Link>}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={canReadAllContributions ? "Current group obligations" : "Your current obligations"} value={formatKES(stats.totalExpectedMinor)} note={canReadAllContributions ? "Current periods generated from active contribution schedules" : "Only obligations visible to your group role are included"} icon={CircleDollarSign}/>
      <Metric label={canReadAllContributions ? "Group contributions posted" : "Your contributions posted"} value={formatKES(stats.totalReceivedMinor)} note="Member savings allocations after provider verification" icon={WalletCards} tone="navy"/>
      <Metric label="Verified custodian cash" value={displayFinancialAmount(stats.verifiedCustodianMinor)} note={stats.verifiedCustodianMinor === undefined ? "Financial summary access is restricted by your group role" : "Recent non-development custodian balance; not a wallet balance"} icon={Landmark} tone="amber"/>
      <Metric label="Available liquidity" value={displayFinancialAmount(stats.availableLiquidityMinor)} note={stats.availableLiquidityMinor === undefined ? "Financial summary access is restricted by your group role" : "Verified KES balance less payout and pending-loan reservations"} icon={ShieldCheck}/>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_.9fr]">
      <SectionCard title={canReadAllContributions ? "Group contribution performance" : "Your contribution performance"} description={canReadAllContributions ? "Current group obligations compared with reconciled allocations." : "Only your current obligations and payment activity are shown."} action={<Link href="/contributions" className="text-xs font-semibold text-[#337051] hover:underline">View contributions</Link>}>
        {stats.totalExpectedMinor > 0 ? <div><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-2xl font-semibold tabular-nums text-[#19352a]">{percent}%</p><p className="mt-1 text-xs text-[#7a867e]">of scheduled amount allocated</p></div><div className="text-right"><p className="text-xs font-semibold tabular-nums text-[#426351]">{formatKES(stats.totalReceivedMinor)}</p><p className="mt-1 text-[10px] text-[#87928b]">of {formatKES(stats.totalExpectedMinor)}</p></div></div><div className="h-2.5 overflow-hidden rounded-full bg-[#edf1ed]"><div className="h-full rounded-full bg-[#39815b] transition-[width]" style={{ width: `${percent}%` }}/></div><div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#edf1ed] pt-4"><div><p className="text-[10px] text-[#87928b]">Outstanding</p><p className="mt-1 text-sm font-semibold tabular-nums text-[#253d31]">{formatKES(stats.outstandingMinor)}</p></div><div><p className="text-[10px] text-[#87928b]">Active members</p><p className="mt-1 text-sm font-semibold tabular-nums text-[#253d31]">{stats.activeMemberCount}</p></div><div><p className="text-[10px] text-[#87928b]">Pending payments</p><p className="mt-1 text-sm font-semibold tabular-nums text-[#253d31]">{stats.pendingPaymentCount}</p></div></div></div> : <EmptyState title={canReadAllContributions ? "No current group obligations" : "No current obligations visible to you"} description={canReadAllContributions ? "Create a contribution schedule in group settings to generate the first period’s member obligations." : "No current-period contribution obligation is linked to your membership."}/>}
      </SectionCard>
      <SectionCard title="Financial position" description="Accounting allocations and external cash are reported separately.">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium text-[#718078]">Ledger assets</p><p className="mt-1 text-[10px] text-[#98a29b]">Includes provider receivables; not all assets are available cash.</p></div><p className="text-sm font-semibold tabular-nums text-[#254132]">{displayFinancialAmount(stats.ledgerAssetsMinor)}</p></div>
          <div className="h-px bg-[#edf1ed]"/>
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium text-[#718078]">Member savings liabilities</p><p className="mt-1 text-[10px] text-[#98a29b]">Internal allocation owed to members.</p></div><p className="text-sm font-semibold tabular-nums text-[#254132]">{displayFinancialAmount(stats.savingsLiabilityMinor)}</p></div>
          <div className="h-px bg-[#edf1ed]"/>
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium text-[#718078]">Pending payout requests</p><p className="mt-1 text-[10px] text-[#98a29b]">Requires independent approvals and verified funds.</p></div><p className="text-sm font-semibold tabular-nums text-[#254132]">{stats.pendingPayoutCount}</p></div>
          <div className="rounded-xl bg-[#f4f7f3] p-3 text-[10px] leading-5 text-[#6c7b71]">No custody or escrow is provided by Pamoja. A zero cash value may mean no verified custodian balance has been recorded.</div>
        </div>
      </SectionCard>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <SectionCard title="Recent ledger activity" description="Posted entries are immutable accounting records; pending payment instructions are not journaled." action={<Link href="/ledger" className="text-xs font-semibold text-[#337051] hover:underline">Open ledger</Link>}>
        {recentEntries.length ? <div className="divide-y divide-[#edf1ed]">{recentEntries.map(entry => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-xs font-medium text-[#2b4336]">{entry.description}</p><p className="mt-1 text-[10px] text-[#8b968f]">{formatDate(entry.postedAt)} · {entry.sourceType.replaceAll("_", " ")}</p></div><div className="text-right"><p className="text-xs font-semibold tabular-nums text-[#284835]">{formatKES(entry.totalDebitMinor)}</p><p className="mt-1 text-[9px] text-[#87928b]">balanced journal</p></div></div>)}</div> : <EmptyState title={ledgerDetailsUnavailable ? "Journal detail unavailable" : "No posted activity"} description={ledgerDetailsUnavailable ? "Your role may have aggregate ledger access only, or journal details could not be loaded." : "The ledger will show verified payments and other journaled events when the server posts them."}/>}
      </SectionCard>
      <SectionCard title="Rotation schedule" description="Eligibility depends on every obligation in the linked collection period being settled." action={<Link href="/rotation" className="text-xs font-semibold text-[#337051] hover:underline">Manage</Link>}>
        {nextRotation ? <div className="rounded-xl border border-[#e7ece7] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#274233]">{nextRotation.beneficiaryName}</p><p className="mt-1 text-[10px] text-[#87928b]">Scheduled {formatDate(nextRotation.payoutDate)} · sequence {nextRotation.sequence}</p></div><StatusPill status={nextRotation.displayStatus}/></div><div className="mt-4"><div className="flex justify-between text-[10px] text-[#748179]"><span>{nextRotation.settledMembers} of {nextRotation.activeMembers} members settled</span><span>{formatKES(nextRotation.collectedMinor)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf1ed]"><div className="h-full rounded-full bg-[#5a9a6a]" style={{ width: `${nextRotation.expectedContributionsMinor ? Math.min(100, nextRotation.collectedMinor * 100 / nextRotation.expectedContributionsMinor) : 0}%` }}/></div></div></div> : <EmptyState title="No rotation schedule" description="For merry-go-round groups, create a contribution schedule and set member payout order in Rotation schedule."/>}
      </SectionCard>
    </div>
  </div>;
}
