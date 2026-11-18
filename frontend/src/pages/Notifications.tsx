import { Bell, Check, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function NotificationsPage() {
  const utils = trpc.useUtils();
  const query = trpc.notifications.list.useQuery();
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: async () => { await utils.notifications.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (query.isLoading) return <div className="rounded-2xl border border-[#e5ebe5] bg-white p-6 text-sm text-[#728077]">Loading your inbox…</div>;
  if (query.error) return <div className="rounded-2xl border border-[#f0d2d2] bg-white p-6 text-sm text-[#9b4545]">Inbox unavailable: {query.error.message}</div>;
  const items = query.data?.notifications ?? [];

  return <section className="mx-auto max-w-3xl">
    <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#dfe9e1] bg-white p-5">
      <div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#4e7b5f]">Private inbox</p><h2 className="mt-1 text-lg font-semibold text-[#1d3328]">Group activity updates</h2><p className="mt-1 text-sm text-[#718077]">These are in-app records only. Email and SMS delivery are not enabled.</p></div>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-[#276247]"><Bell className="h-5 w-5"/></div>
    </div>
    {items.length === 0 ? <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-[#dce5dd] bg-white p-8 text-center"><div><Inbox className="mx-auto h-8 w-8 text-[#8b9d91]"/><h3 className="mt-3 text-sm font-semibold text-[#2b4235]">No notifications yet</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[#78867d]">Payout and finance activity notifications will appear here when addressed to your account.</p></div></div> : <div className="space-y-3">{items.map(item => <article key={item.id} className={`rounded-2xl border bg-white p-4 sm:p-5 ${item.status === "read" ? "border-[#e8ede9]" : "border-[#cfe1d3] shadow-sm"}`}>
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[#243a2e]">{item.title}</h3>{item.status !== "read" && <span className="rounded-full bg-[#eaf4ed] px-2 py-0.5 text-[10px] font-semibold text-[#31714d]">New</span>}</div><p className="mt-1.5 text-sm leading-6 text-[#627168]">{item.body}</p><p className="mt-2 text-[11px] text-[#8a958e]">{new Date(item.createdAt).toLocaleString()} · In-app</p></div>{item.status !== "read" && <Button variant="outline" size="sm" className="shrink-0 rounded-lg" disabled={markRead.isPending} onClick={() => markRead.mutate({ notificationId: item.id })}><Check className="mr-1.5 h-3.5 w-3.5"/>Mark read</Button>}</div>
    </article>)}</div>}
  </section>;
}
