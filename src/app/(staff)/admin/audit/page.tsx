import { requireAdmin } from "@/lib/auth";
import { FilterForm } from "@/components/client-bits";
import { fmtDateTime } from "@/lib/dates";
import { Notice, PageHeader, btn, first, input, td, th, type SearchParams } from "@/components/ui";

const TABLES = ["accounts", "contacts", "meetings", "clients", "campaigns", "client_sdrs", "profiles",
  "custom_fields", "payout_runs", "client_financials", "edit_requests"];
const HIDDEN = new Set(["name_key", "domain_key", "created_at"]);

const show = (v: unknown) => (v == null || v === "" ? "(blank)" : typeof v === "object" ? JSON.stringify(v) : String(v));

function changes(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return [];
  return Object.keys(after)
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ k, from: show(before[k]), to: show(after[k]) }));
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const table = first(sp.table);
  const record = first(sp.record);

  let query = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(200);
  if (table) query = query.eq("table_name", table);
  if (record) query = query.eq("record_id", record);
  const [{ data: rows, error }, { data: people }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name"),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <PageHeader title="Audit log" sub="Every create, change, reassignment and approval, with who did it and when. Nothing here can be edited." />
      <Notice error={error?.message} />
      <FilterForm className="mb-4 flex flex-wrap gap-2">
        <select name="table" defaultValue={table ?? ""} className={`${input} max-w-56`} aria-label="Record type">
          <option value="">All record types</option>
          {TABLES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input name="record" defaultValue={record ?? ""} placeholder="Record ID (optional)" className={`${input} max-w-80`} />
        <button className={btn}>Filter</button>
      </FilterForm>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>{["When", "Who", "Record", "Action", "What changed"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows?.map((r) => {
              const diff = changes(r.before, r.after);
              const label = (r.after ?? r.before)?.name ?? (r.after ?? r.before)?.full_name ?? "";
              return (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap text-slate-500`}>{fmtDateTime(r.at)}</td>
                  <td className={`${td} whitespace-nowrap`}>{who.get(r.actor_id) ?? "System"}</td>
                  <td className={td}>
                    {r.table_name} {label && <span className="text-slate-500">· {label}</span>}
                  </td>
                  <td className={td}>{r.action === "INSERT" ? "Created" : r.action === "DELETE" ? "Removed" : "Changed"}</td>
                  <td className={`${td} max-w-xl`}>
                    {diff.map((d) => (
                      <div key={d.k}>
                        <span className="font-medium">{d.k}</span>: <span className="text-slate-500">{d.from}</span> → {d.to}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
            {!rows?.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Showing the latest 200 entries for this filter.</p>
    </>
  );
}
