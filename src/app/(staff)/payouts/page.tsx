import { requireStaff } from "@/lib/auth";
import { fmtDate } from "@/lib/dates";
import { Notice, PageHeader, td, th } from "@/components/ui";

const money = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// An SDR's own statements. The database only returns rows where sdr_id is the signed-in user.
export default async function MyPayoutsPage() {
  const { supabase, profile } = await requireStaff();
  const { data: runs, error } = await supabase
    .from("payout_runs")
    .select("*, campaign:campaigns(name, client:clients(name))")
    .eq("sdr_id", profile.id)
    .order("month", { ascending: false });

  return (
    <>
      <PageHeader title="My payouts" sub="Monthly statements based on your accepted HQMs." />
      <Notice error={error?.message} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {["Month", "Client / campaign", "HQMs", "Rate", "Minimum", "Gross", "Adjustment", "Deduction", "Net", "Status"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs?.map((r) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap`}>{fmtDate(r.month).slice(3)}</td>
                <td className={td}>{r.campaign?.client?.name} · {r.campaign?.name}</td>
                <td className={`${td} tabular-nums`}>{r.hqm_count}</td>
                <td className={`${td} tabular-nums`}>{money(Number(r.rate))}</td>
                <td className={`${td} tabular-nums`}>{r.threshold}</td>
                <td className={`${td} tabular-nums`}>{money(Number(r.gross))}</td>
                <td className={`${td} tabular-nums`}>
                  {money(Number(r.adjustment))}
                  {r.adjustment_reason && <div className="text-xs text-slate-500">{r.adjustment_reason}</div>}
                </td>
                <td className={`${td} tabular-nums`}>{money(Number(r.deduction))}</td>
                <td className={`${td} font-semibold tabular-nums`}>{money(Number(r.gross) + Number(r.adjustment) - Number(r.deduction))}</td>
                <td className={`${td} capitalize`}>{r.status}</td>
              </tr>
            ))}
            {!runs?.length && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-slate-500">No statements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
