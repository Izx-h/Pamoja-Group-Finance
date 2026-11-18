import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useActiveGroup } from "@/contexts/GroupContext";
import { Activity, ArrowUpRight, Banknote, Bell, BookOpenCheck, Building2, CircleDollarSign, Fingerprint, Home, LogOut, Menu, RotateCcw, Settings2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const nav = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/contributions", label: "Contributions", icon: CircleDollarSign },
  { href: "/reconciliation", label: "Reconciliation", icon: Activity },
  { href: "/rotation", label: "Rotation schedule", icon: RotateCcw },
  { href: "/payouts", label: "Payout approvals", icon: ArrowUpRight },
  { href: "/loans", label: "Loans", icon: Banknote },
  { href: "/ledger", label: "Group ledger", icon: BookOpenCheck },
  { href: "/settings", label: "Group settings", icon: Settings2 },
  { href: "/profile/security", label: "Security", icon: Fingerprint },
];

function Mark() {
  return <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f503d] text-white shadow-sm">
    <svg viewBox="0 0 40 40" className="h-6 w-6" aria-hidden="true"><path d="M10 13.5a6.5 6.5 0 0 1 9.2 0l2.1 2.1-3.4 3.4-2.1-2.1a1.7 1.7 0 1 0-2.4 2.4l2.1 2.1-3.4 3.4-2.1-2.1a6.5 6.5 0 0 1 0-9.2Zm20 13a6.5 6.5 0 0 1-9.2 0l-2.1-2.1 3.4-3.4 2.1 2.1a1.7 1.7 0 1 0 2.4-2.4l-2.1-2.1 3.4-3.4 2.1 2.1a6.5 6.5 0 0 1 0 9.2Z" fill="currentColor"/><path d="m16.1 23.9 7.8-7.8" stroke="#b7e7cb" strokeWidth="2.2" strokeLinecap="round"/></svg>
  </div>;
}

export default function PamojaShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const { loading, user, logout } = useAuth();
  const { groups, groupId, activeGroup, setGroupId, isLoading: groupsLoading } = useActiveGroup();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const inbox = trpc.notifications.list.useQuery(undefined, { enabled: Boolean(user) });

  if (loading) return <div className="min-h-screen grid place-items-center bg-[#f6f7f4]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#dce8df] border-t-[#0f503d]" aria-label="Loading session" /></div>;
  if (!user) return <main className="min-h-screen grid place-items-center bg-[#f6f7f4] px-5"><section className="w-full max-w-md rounded-3xl border border-[#e2e9e3] bg-white p-8 shadow-sm"><Mark/><p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-[#39735b]">Pamoja group finance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#142a25]">Shared finances, clear records.</h1><p className="mt-3 text-sm leading-6 text-[#62716b]">Sign in to view your group’s obligations, approvals and ledger. Access follows your membership and group role.</p><Button className="mt-7 h-11 w-full rounded-xl bg-[#0f503d] hover:bg-[#0a3c2d]" onClick={() => startLogin()}>Continue to sign in</Button><p className="mt-4 text-center text-xs text-[#76837c]">You will be redirected to the secure account login.</p></section></main>;

  return <div className="min-h-screen bg-[#f6f7f4] text-[#172b25]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col border-r border-[#e5ebe5] bg-white lg:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-[#eef1ed] px-5"><Mark/><div><div className="font-semibold tracking-tight">pamoja</div><div className="text-[10px] uppercase tracking-[.16em] text-[#728077]">group finance</div></div></div>
      <div className="px-4 pt-5"><div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#8a968f]">Workspace</div>{nav.map(item => {
        const active = location === item.href || (item.href !== "/" && location.startsWith(`${item.href}/`));
        return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? "bg-[#eaf4ee] text-[#0f503d]" : "text-[#596760] hover:bg-[#f5f7f4] hover:text-[#17372c]"}`}><item.icon className="h-[17px] w-[17px]" strokeWidth={1.8}/>{item.label}</Link>;
      })}</div>
      <div className="mt-auto p-4"><div className="rounded-2xl bg-[#f5f7f4] p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-[#385748]"><ShieldCheck className="h-4 w-4"/>Ledger-first records</div><p className="mt-1.5 text-[11px] leading-5 text-[#758179]">Provider-confirmed collections are not the same as verified cash held by a custodian.</p></div><button onClick={() => void logout()} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#758179] hover:bg-white hover:text-[#a13e3e]"><LogOut className="h-4 w-4"/>Sign out</button></div>
    </aside>

    <div className="lg:pl-[250px]">
      <header className="sticky top-0 z-30 border-b border-[#e5ebe5] bg-white/95 backdrop-blur">
        <div className="flex h-[68px] items-center justify-between gap-3 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3"><button className="rounded-lg p-2 text-[#607068] hover:bg-[#f3f6f3] lg:hidden" aria-label="Toggle menu" onClick={() => setMobileOpen(!mobileOpen)}><Menu className="h-5 w-5"/></button><div className="min-w-0"><h1 className="truncate text-[15px] font-semibold tracking-tight text-[#162a24]">{title}</h1>{subtitle && <p className="hidden truncate text-xs text-[#7a867f] sm:block">{subtitle}</p>}</div></div>
          <div className="flex items-center gap-2.5 sm:gap-4">
            {groups.length > 0 && <label className="flex max-w-[170px] items-center gap-2 rounded-xl border border-[#e4eae5] bg-white px-3 py-2 sm:max-w-[220px]"><Building2 className="h-4 w-4 shrink-0 text-[#59816b]"/><select aria-label="Active group" className="min-w-0 bg-transparent text-xs font-medium text-[#263b31] outline-none" value={groupId ?? ""} onChange={event => setGroupId(Number(event.target.value))}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
            <div className="hidden items-center gap-2 border-l border-[#e6ebe6] pl-4 sm:flex"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#e7f1ea] text-xs font-semibold text-[#185840]">{user.name?.slice(0,1).toUpperCase() || "M"}</div><div className="max-w-[140px]"><p className="truncate text-xs font-semibold text-[#2d4137]">{user.name || "Member"}</p><p className="truncate text-[10px] text-[#89938d]">{activeGroup?.roleLabel || "Group member"}</p></div></div>
            <Link href="/notifications" aria-label="Notifications" className="relative rounded-xl p-2 text-[#6d7b73] hover:bg-[#f3f6f3]"><Bell className="h-[17px] w-[17px]"/>{Boolean(inbox.data?.unreadCount) && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#0f503d] px-1 text-[9px] font-semibold text-white">{inbox.data!.unreadCount}</span>}</Link>
          </div>
        </div>
        {mobileOpen && <div className="border-t border-[#ecf0ec] bg-white px-3 py-3 lg:hidden"><div className="grid grid-cols-2 gap-1.5">{nav.map(item => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs ${location === item.href ? "bg-[#eaf4ee] text-[#0f503d]" : "text-[#52635a] hover:bg-[#f5f7f4]"}`}><item.icon className="h-4 w-4"/>{item.label}</Link>)}</div><button onClick={() => void logout()} className="mt-2 flex items-center gap-2 px-3 py-2 text-xs text-[#78847d]"><LogOut className="h-4 w-4"/>Sign out</button></div>}
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8">{!groupsLoading && groups.length === 0 && location !== "/groups/new" ? <div className="mb-5 rounded-2xl border border-[#dce8df] bg-[#eff7f1] px-4 py-3 text-sm text-[#315b45]"><strong>No group selected.</strong> Create a group or accept a member invitation to begin. No financial data is shown until the server returns group records.</div> : null}{children}</main>
      <footer className="mx-auto flex max-w-[1500px] flex-wrap justify-between gap-2 px-4 pb-6 text-[10px] text-[#89958d] sm:px-7"><span>© Pamoja · Kenyan group finance workspace</span><span>Amounts are ledger records; custodian-held cash is shown separately.</span></footer>
    </div>
  </div>;
}
