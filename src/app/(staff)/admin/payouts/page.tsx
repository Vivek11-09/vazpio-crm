import { requireAdmin } from "@/lib/auth";
import { SubmitButton } from "@/components/client-bits";
import { todayIST } from "@/lib/dates";
import { computePayouts, updatePayout } from "@/app/admin-actions";
import { Notice, PageHeader, Stat, btn, btnGhost, first, input, inputBase, td, th, type SearchParams } from "@/components/ui";

const money = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default async function PayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const month = first(sp.month) ?? todayIST().slice(0, 7);
  const { data: runs, error } = await supabase
    .from("payout_runs")
    .select("*, sdr:profiles!sdr_id(full_name), campaign:campaigns(name, client:clients(name))")
    .eq("month", `${month}-01`)
    .order("gross", { ascending: false });

  const net = (r: { gross: number; adjustment: number; deduction: number }) =>
    Number(r.gross) + Number(r.adjustment) - Number(r.deduction);
  const total = (runs ?? []).reduce((sum, r) => sum + net(r), 0);

  return (
    <>
      <PageHeader title="SDR payouts" sub="Calculated from accepted HQMs at each campaign's rate and monthly threshold." />
      <Notice error={error?.message ?? first(sp.error)} ok={first(sp.ok)} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-2">
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Month</span>
            <input type="month" name="month" defaultValue={month} className={input} />
          </label>
          <button className={btnGhost}>View</button>
        </form>
        <form action={computePayouts}>
          <input type="hidden" name="month" value={month} />
          <SubmitButton className={btn}>Recalculate drafts for {month}</SubmitButton>
        </form>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Statements" value={runs?.length ?? 0} />
        <Stat label="HQMs paid on" value={(runs ?? []).reduce((s, r) => s + (Number(r.gross) > 0 ? r.hqm_count : 0), 0)} />
        <Stat label="Net payable" value={money(total)} />
        <Stat label="Still in draft" value={(runs ?? []).filter((r) => r.status === "draft").length} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {["SDR", "Client / campaign", "HQMs", "Rate", "Min.", "Gross", "Adjustment", "Reason", "Deduction (TDS)", "Net", "Status", ""].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs?.map((r) => {
              const form = `payout-${r.id}`;
              return (
                <tr key={r.id}>
                  <td className={`${td} font-medium`}>
                    <form id={form} action={updatePayout}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="month" value={month} />
                    </form>
                    {r.sdr?.full_name}
                  </td>
                  <td className={td}>{r.campaign?.client?.name} · {r.campaign?.name}</td>
                  <td className={`${td} tabular-nums`}>{r.hqm_count}</td>
                  <td className={`${td} tabular-nums`}>{money(Number(r.rate))}</td>
                  <td className={`${td} tabular-nums`}>{r.threshold}</td>
                  <td className={`${td} tabular-nums`}>
                    {money(Number(r.gross))}
                    {r.hqm_count < r.threshold && <div className="text-xs text-amber-700">Below minimum</div>}
                  </td>
                  <td className={td}><input form={form} type="number" step="0.01" name="adjustment" defaultValue={r.adjustment} className={`${inputBase} w-28`} aria-label="Adjustment" /></td>
                  <td className={td}><input form={form} name="adjustment_reason" defaultValue={r.adjustment_reason ?? ""} className={`${inputBase} w-44`} aria-label="Adjustment reason" /></td>
                  <td className={td}><input form={form} type="number" step="0.01" min={0} name="deduction" defaultValue={r.deduction} className={`${inputBase} w-28`} aria-label="Deduction" /></td>
                  <td className={`${td} font-semibold tabular-nums`}>{money(net(r))}</td>
                  <td className={td}>
                    <select form={form} name="status" defaultValue={r.status} className={`${inputBase} w-32`} aria-label="Status">
                      <option value="draft">Draft</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="approved">Approved</option>
                      <option value="paid">Paid</option>
                    </select>
                  </td>
                  <td className={td}><SubmitButton form={form} className={btnGhost}>Save</SubmitButton></td>
                </tr>
              );
            })}
            {!runs?.length && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-500">
                No payouts for this month yet. Recalculate once HQMs have been accepted.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Recalculating only changes statements still in Draft. No payment is made from the CRM; statutory deductions are handled outside it.
      </p>
    </>
  );
}
