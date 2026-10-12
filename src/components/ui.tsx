import Link from "next/link";
import { ClearFlash } from "@/components/client-bits";

// inputBase has no width, for narrow fields inside tables; input fills its container.
export const inputBase =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
export const input = `w-full ${inputBase}`;
export const btn =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
export const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const td = "px-3 py-2 align-top text-sm";

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children, className = "", group = false }:
  { label: string; children: React.ReactNode; className?: string; group?: boolean }) {
  // A group of checkboxes cannot sit inside one <label>, or clicking any text toggles the first box.
  const Tag = group ? "div" : "label";
  return (
    <Tag className={`block text-xs font-medium text-slate-600 ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
    </Tag>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${
        error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error ?? ok}
      <ClearFlash />
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  "In progress": "bg-blue-50 text-blue-700",
  "Meeting to be set": "bg-amber-50 text-amber-800",
  "Meeting Done": "bg-emerald-50 text-emerald-700",
  Converted: "bg-emerald-100 text-emerald-800",
  "No Requirement": "bg-slate-100 text-slate-600",
  "No Response": "bg-slate-100 text-slate-600",
  "Invalid Contact": "bg-red-50 text-red-700",
  "Do Not Contact": "bg-red-100 text-red-800",
  "Need New Contact": "bg-purple-50 text-purple-700",
};

export function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_TONE[value] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {value}
    </span>
  );
}

export function AlertBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const tone =
    value === "OVERDUE"
      ? "bg-red-600 text-white"
      : value === "DUE SOON"
        ? "bg-amber-400 text-amber-950"
        : "bg-slate-100 text-slate-600";
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{value}</span>;
}

export function Bars({ rows }: { rows?: { label: string | null; n: number }[] }) {
  if (!rows?.length) return <p className="text-sm text-slate-500">No data for this selection.</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label ?? "none"} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-600">{r.label ?? "None"}</span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span className="block h-2.5 rounded-full bg-indigo-500" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-slate-900">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExtLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
  if (!href || !/^https?:\/\//i.test(href)) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
      {children}
    </a>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: { href: string; label: string } }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {action && (
        <Link href={action.href} className={btn}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
