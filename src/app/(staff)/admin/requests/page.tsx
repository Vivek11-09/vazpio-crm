import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/dates";
import { decideEditRequest } from "@/app/admin-actions";
import { Card, Notice, PageHeader, btn, btnGhost, first, type SearchParams } from "@/components/ui";

export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: rows, error } = await supabase
    .from("edit_requests")
    .select("*, requester:profiles!requested_by(full_name), decider:profiles!decided_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const decided = (rows ?? []).filter((r) => r.status !== "pending");
  const link = (r: { table_name: string; record_id: string }) =>
    r.table_name === "contacts" ? `/contacts/${r.record_id}` : r.table_name === "accounts" ? `/accounts/${r.record_id}` : "/meetings";

  return (
    <>
      <PageHeader title="Edit requests" sub="Corrections SDRs have asked for on locked fields." />
      <Notice error={error?.message ?? first(sp.error)} ok={first(sp.ok)} />

      <Card title={`Waiting for a decision (${pending.length})`}>
        {!pending.length && <p className="text-sm text-slate-500">Nothing waiting.</p>}
        <ul className="divide-y divide-slate-100">
          {pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <div>
                  <strong>{r.field}</strong>: <span className="text-slate-500 line-through">{r.current_value || "(blank)"}</span>
                  {" → "}<span className="font-medium">{r.requested_value || "(blank)"}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {r.requester?.full_name} · {fmtDateTime(r.created_at)} · Reason: {r.reason} ·{" "}
                  <Link href={link(r)} className="text-indigo-700 hover:underline">Open record</Link>
                </div>
              </div>
              <form action={decideEditRequest} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <button name="decision" value="approve" className={btn}>Approve and apply</button>
                <button name="decision" value="reject" className={btnGhost}>Reject</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Decided" className="mt-4">
        {!decided.length && <p className="text-sm text-slate-500">No decisions yet.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {decided.map((r) => (
            <li key={r.id} className="py-2">
              <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                {r.status}
              </span>
              <strong>{r.field}</strong>: {r.current_value || "(blank)"} → {r.requested_value || "(blank)"}
              <span className="text-xs text-slate-500"> · asked by {r.requester?.full_name} · decided by {r.decider?.full_name} on {fmtDateTime(r.decided_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
