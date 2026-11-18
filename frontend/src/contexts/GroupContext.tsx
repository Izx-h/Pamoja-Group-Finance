import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type GroupChoice = { id: number; name: string; type: string; description: string | null; currency: string; roleKey: string; roleLabel: string; permissions: string[] };
type GroupContextValue = {
  groups: GroupChoice[];
  groupId: number | null;
  activeGroup: GroupChoice | null;
  setGroupId: (id: number) => void;
  isLoading: boolean;
  refetch: () => void;
};

const Context = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const query = trpc.groups.list.useQuery(undefined, { retry: false });
  const [groupId, setGroupIdState] = useState<number | null>(() => {
    try {
      const stored = Number(localStorage.getItem("pamoja-active-group"));
      return Number.isSafeInteger(stored) && stored > 0 ? stored : null;
    } catch { return null; }
  });
  const groups = (query.data ?? []) as GroupChoice[];

  useEffect(() => {
    if (query.isLoading) return;
    if (!groups.length) {
      setGroupIdState(null);
      return;
    }
    if (!groupId || !groups.some(group => group.id === groupId)) setGroupIdState(groups[0].id);
  }, [groups, groupId, query.isLoading]);

  const setGroupId = (id: number) => {
    setGroupIdState(id);
    try { localStorage.setItem("pamoja-active-group", String(id)); } catch { /* storage is optional */ }
  };
  const value = useMemo(() => ({
    groups,
    groupId,
    activeGroup: groups.find(group => group.id === groupId) ?? null,
    setGroupId,
    isLoading: query.isLoading,
    refetch: () => { void query.refetch(); },
  }), [groups, groupId, query.isLoading]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveGroup() {
  const value = useContext(Context);
  if (!value) throw new Error("useActiveGroup must be used inside GroupProvider");
  return value;
}
