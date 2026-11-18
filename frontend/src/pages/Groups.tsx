import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { Building2, ChevronLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useActiveGroup } from "@/contexts/GroupContext";
import { parseKES, PageHeading } from "@/lib/finance-ui";

type GroupType = "merry_go_round" | "rotating_savings" | "accumulated_savings" | "sacco" | "investment";

export default function GroupsPage() {
  const [, setLocation] = useLocation();
  const { refetch, setGroupId } = useActiveGroup();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [type, setType] = useState<GroupType>("merry_go_round");
  const [description, setDescription] = useState("");
  const [registrationDetails, setRegistrationDetails] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"weekly"|"biweekly"|"monthly"|"quarterly"|"annual">("monthly");
  const [dueDay, setDueDay] = useState("5");
  const create = trpc.groups.create.useMutation({ onSuccess: async result => { setGroupId(result.groupId); await utils.invalidate(); refetch(); toast.success("Group created"); setLocation("/"); }, onError: error => toast.error(error.message) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const amountMinor = amount.trim() ? parseKES(amount) : 0;
      create.mutate({ name, type, description: description || undefined, registrationDetails: registrationDetails || undefined, amountMinor, frequency, dueDay: Number(dueDay) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Check the group details."); }
  };
  return <div className="mx-auto max-w-3xl"><button onClick={() => setLocation("/")} className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#6e7b73] hover:text-[#244d36]"><ChevronLeft className="h-4 w-4"/>Back to overview</button><PageHeading eyebrow="Group registration" title="Create a savings group" description="Each group has isolated members, roles, contribution rules and ledger records. Pamoja does not hold the group’s money."/>
    <form onSubmit={submit} className="rounded-2xl border border-[#e3eae3] bg-white p-5 shadow-[0_2px_10px_rgba(22,52,36,.025)] sm:p-7">
      <div className="mb-6 flex items-center gap-3 border-b border-[#edf1ed] pb-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5ee] text-[#31704f]"><Building2 className="h-5 w-5"/></div><div><p className="text-sm font-semibold text-[#263c30]">Group profile</p><p className="mt-0.5 text-xs text-[#87928a]">Currency is currently Kenyan shillings (KES).</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Group name"><input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mwangaza Women’s Group" className={input}/></Field><Field label="Group type"><select value={type} onChange={e => setType(e.target.value as GroupType)} className={input}><option value="merry_go_round">Merry-go-round</option><option value="rotating_savings">Rotating savings</option><option value="accumulated_savings">Accumulated savings</option><option value="sacco">SACCO</option><option value="investment">Investment group</option></select></Field><Field label="Description" className="sm:col-span-2"><textarea rows={3} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is the group saving or investing toward?" className={`${input} resize-y`}/></Field><Field label="Registration details (optional)" className="sm:col-span-2"><input maxLength={1000} value={registrationDetails} onChange={e => setRegistrationDetails(e.target.value)} placeholder="Registration number or notes" className={input}/></Field></div>
      <div className="mt-7 border-t border-[#edf1ed] pt-6"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#49825c]"/><h3 className="text-sm font-semibold text-[#2b4034]">First contribution schedule <span className="font-normal text-[#87928b]">(optional)</span></h3></div><p className="mt-1 text-xs text-[#7e8a82]">If an amount is entered, current-period obligations are generated for active members.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><Field label="Contribution amount (KES)"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 5000.00" className={input}/></Field><Field label="Frequency"><select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)} className={input}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option></select></Field><Field label="Due day"><input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} className={input}/></Field></div></div>
      <div className="mt-7 flex flex-col-reverse justify-end gap-2 border-t border-[#edf1ed] pt-5 sm:flex-row"><Button type="button" variant="outline" onClick={() => setLocation("/")}>Cancel</Button><Button disabled={create.isPending} className="bg-[#0f503d] hover:bg-[#0b3d2e]">{create.isPending ? "Creating…" : "Create group"}</Button></div>
    </form><p className="mt-4 text-[11px] leading-5 text-[#89948c]">Creating a group records the group and its rules. It does not open a bank account, establish custody, or initiate a payment.</p></div>;
}

const input = "mt-1.5 w-full rounded-xl border border-[#dfe7df] bg-white px-3.5 py-2.5 text-sm text-[#263a30] placeholder:text-[#a4ada6] outline-none focus:border-[#75a886] focus:ring-2 focus:ring-[#d9ecdd]";
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block text-xs font-medium text-[#506258] ${className}`}>{label}{children}</label>; }
