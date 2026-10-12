import { requireAdmin } from "@/lib/auth";
import { SubmitButton } from "@/components/client-bits";
import { fmtDate, todayIST } from "@/lib/dates";
import { saveFinancials } from "@/app/admin-actions";
import { Card, Notice, PageHeader, btnGhost, first, input, inputBase, td, th, type SearchParams } from "@/components/ui";

const money = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

type Row = {
  client_id: string; client_name: string; month: string; revenue: number; tool_cost: number; other_cost: number;
  sdr_payout: number; contribution_margin: number; margin_pct: number | null;
};

export default async function ProfitabilityPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const month = first(sp.month) ?? todayIST().slice(0, 7);
  const [{ data: clients }, { data: inputs }, { data: history, error }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("status", "active").order("name"),
    supabase.from("client_financials").select("*").eq("month", `${month}-01`),
    supabase.from("client_profitability").select("*").order("month", { ascending: false }).order("client_name").limit(200),
  ]);
  const byClient = new Map((inputs ?? []).map((r) => [r.client_id, r]));
  const rows = (history ?? []) as Row[];
  const current = new Map(rows.filter((r) => r.month === `${month}-01`).map((r) => [r.client_id, r]));

  return (
    <>
      <PageHeader title="Client profitability" sub="Contribution margin = revenue − approved SDR payout − data/tool cost − other direct cost." />
      <Notice error={error?.message ?? first(sp.error)} ok={first(sp.ok)} />

      <form className="mb-4 flex items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          <span className="mb-1 block">Month</span>
          <input type="month" name="month" defaultValue={month} className={input} />
        </label>
        <button className={btnGhost}>View</button>
      </form>

      <Card title={`Inputs for ${month}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead>
              <tr>
                {["Client", "Revenue", "Data / tool cost", "Other direct cost", "Note", "SDR payout", "Margin", "Margin %", ""].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients?.map((c) => {
                const f = byClient.get(c.id);
                const p = current.get(c.id);
                const form = `fin-${c.id}`;
                return (
                  <tr key={c.id}>
                    <td className={`${td} font-medium`}>
                      <form id={form} action={saveFinancials}>
                        <input type="hidden" name="client_id" value={c.id} />
                        <input type="hidden" name="month" value={month} />
                      </form>
                      {c.name}
                    </td>
                    {(["revenue", "tool_cost", "other_cost"] as const).map((k) => (
                      <td key={k} className={td}>
                        <input form={form} type="number" step="0.01" min={0} name={k} defaultValue={f?.[k] ?? 0} className={`${inputBase} w-32`} aria-label={k} />
                      </td>
                    ))}
                    <td className={td}><input form={form} name="note" defaultValue={f?.note ?? ""} className={`${inputBase} w-48`} aria-label="Note" /></td>
                    <td className={`${td} tabular-nums`}>{money(p?.sdr_payout)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{money(p?.contribution_margin)}</td>
                    <td className={`${td} tabular-nums`}>{p?.margin_pct != null ? `${p.margin_pct}%` : ""}</td>
                    <td className={td}><SubmitButton form={form} className={btnGhost}>Save</SubmitButton></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">SDR payout counts statements that are Approved or Paid for the month.</p>
      </Card>

      <Card title="History" className="mt-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead>
              <tr>{["Month", "Client", "Revenue", "SDR payout", "Tool cost", "Other cost", "Margin", "Margin %"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.client_id}-${r.month}`}>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(r.month).slice(3)}</td>
                  <td className={td}>{r.client_name}</td>
                  <td className={`${td} tabular-nums`}>{money(r.revenue)}</td>
                  <td className={`${td} tabular-nums`}>{money(r.sdr_payout)}</td>
                  <td className={`${td} tabular-nums`}>{money(r.tool_cost)}</td>
                  <td className={`${td} tabular-nums`}>{money(r.other_cost)}</td>
                  <td className={`${td} font-semibold tabular-nums`}>{money(r.contribution_margin)}</td>
                  <td className={`${td} tabular-nums`}>{r.margin_pct != null ? `${r.margin_pct}%` : ""}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">No financial inputs saved yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
