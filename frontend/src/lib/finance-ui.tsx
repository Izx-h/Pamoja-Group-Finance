import type { ReactNode } from "react";

export function formatKES(minor: number | null | undefined) {
  if (minor == null || !Number.isSafeInteger(minor)) return "—";
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

export function parseKES(value: string) {
  const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Enter a KES amount with up to two decimal places.");
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || 0);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error("Enter a positive amount within the supported range.");
  return minor;
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const value = date instanceof Date ? date : new Date(date);
  return Number.isNaN(value.getTime()) ? "—" : new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(value);
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(quote).join(","), ...rows.map(row => headers.map(key => quote(row[key])).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color = ["confirmed", "settled", "paid", "eligible", "approved"].includes(normalized)
    ? "border-[#cce4d2] bg-[#eef8f0] text-[#246044]"
    : ["failed", "reversed", "rejected"].includes(normalized)
      ? "border-[#f1d6d1] bg-[#fff5f2] text-[#a34c3f]"
      : ["unmatched", "late", "approved_waiting_funds"].includes(normalized)
        ? "border-[#f0dfbd] bg-[#fff9ea] text-[#8b672a]"
        : "border-[#e2e8e3] bg-[#f7f9f7] text-[#69776e]";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[.02em] ${color}`}>{status.replaceAll("_", " ")}</span>;
}

export function SectionCard({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[#e4eae4] bg-white shadow-[0_2px_10px_rgba(22,52,36,.025)] ${className}`}><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1ed] px-5 py-4"><div><h2 className="text-sm font-semibold text-[#1c3329]">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-[#77857c]">{description}</p>}</div>{action}</div><div className="p-5">{children}</div></section>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-[#dbe4dd] bg-[#fafcf9] px-5 py-9 text-center"><p className="text-sm font-medium text-[#324b3d]">{title}</p><p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-[#849088]">{description}</p></div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#548368]">{eyebrow}</p><h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#192f25] sm:text-[28px]">{title}</h2><p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#758179]">{description}</p></div>{action}</div>;
}
