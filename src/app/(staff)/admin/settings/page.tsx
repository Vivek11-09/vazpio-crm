import { requireAdmin } from "@/lib/auth";
import { saveLookup } from "@/app/admin-actions";
import { SubmitButton } from "@/components/client-bits";
import { Card, Notice, PageHeader, btn, btnGhost, first, input, inputBase, td, th, type SearchParams } from "@/components/ui";

type Row = { value: string; sort: number; is_active: boolean; is_connected?: boolean };

function Lookup({ title, table, rows, help }: { title: string; table: "prospect_statuses" | "call_outcomes"; rows: Row[]; help: string }) {
  const outcomes = table === "call_outcomes";
  return (
    <Card title={title}>
      <p className="mb-3 text-xs text-slate-500">{help}</p>
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            {["Value", "Order", ...(outcomes ? ["Counts as connected"] : []), "Active", ""].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const form = `${table}-${r.value}`;
            return (
              <tr key={r.value} className={r.is_active ? "" : "text-slate-400"}>
                <td className={`${td} font-medium`}>
                  <form id={form} action={saveLookup}>
                    <input type="hidden" name="table" value={table} />
                    <input type="hidden" name="value" value={r.value} />
                  </form>
                  {r.value}
                </td>
                <td className={td}><input form={form} type="number" name="sort" defaultValue={r.sort} className={`${inputBase} w-20`} aria-label="Order" /></td>
                {outcomes && <td className={td}><input form={form} type="checkbox" name="is_connected" defaultChecked={r.is_connected} aria-label="Counts as connected" /></td>}
                <td className={td}><input form={form} type="checkbox" name="is_active" defaultChecked={r.is_active} aria-label="Active" /></td>
                <td className={td}><SubmitButton form={form} className={btnGhost}>Save</SubmitButton></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <form action={saveLookup} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="is_active" value="on" />
        <input type="hidden" name="sort" value={(rows.at(-1)?.sort ?? 0) + 1} />
        <input name="value" required placeholder={outcomes ? "New call outcome" : "New status"} className={`${input} max-w-64`} aria-label="New value" />
        {outcomes && (
          <label className="flex items-center gap-1 pb-2 text-sm text-slate-600"><input type="checkbox" name="is_connected" /> Counts as connected</label>
        )}
        <SubmitButton className={btn}>Add</SubmitButton>
      </form>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: statuses }, { data: outcomes }] = await Promise.all([
    supabase.from("prospect_statuses").select("*").order("sort"),
    supabase.from("call_outcomes").select("*").order("sort"),
  ]);
  return (
    <>
      <PageHeader title="Statuses and call outcomes" sub="The dropdown values SDRs choose from. Used across every client." />
      <Notice error={first(sp.error)} ok={first(sp.ok)} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Lookup title="Prospect statuses" table="prospect_statuses" rows={(statuses ?? []) as Row[]}
          help="Deactivating a status hides it from dropdowns; prospects already on it keep it. Values cannot be renamed because history refers to them." />
        <Lookup title="Call outcomes" table="call_outcomes" rows={(outcomes ?? []) as Row[]}
          help="“Counts as connected” decides which calls feed the connection rate and the funnel on every dashboard." />
      </div>
    </>
  );
}
