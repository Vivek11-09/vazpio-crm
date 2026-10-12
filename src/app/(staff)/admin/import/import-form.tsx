"use client";

import { useActionState, useState } from "react";
import { commitImport, previewImport, type ImportPreview } from "@/app/admin-actions";
import { Card, Field, btn, btnGhost, input, td, th } from "@/components/ui";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function ImportForm({
  clients,
  campaigns,
}: {
  clients: { id: string; name: string }[];
  campaigns: { id: string; name: string; client_id: string }[];
}) {
  const [state, action, pending] = useActionState<ImportPreview, FormData>(previewImport, {});
  const [clientId, setClientId] = useState("");
  const r = state.result;
  const errorsCsv = r
    ? `data:text/csv;charset=utf-8,${encodeURIComponent(
        ["Row,Prospect,Reason", ...r.skipped.map((s) => [s.row, csvCell(s.prospect), csvCell(s.reason)].join(","))].join("\n"),
      )}`
    : "";

  return (
    <div className="space-y-4">
      <Card title="1. Check a file">
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <Field label="Client *">
            <select name="client_id" required value={clientId} onChange={(e) => setClientId(e.target.value)} className={input}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Campaign">
            <select name="campaign_id" className={input} defaultValue="">
              <option value="">No campaign</option>
              {campaigns.filter((c) => c.client_id === clientId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Excel (.xlsx) or CSV file *" className="sm:col-span-2">
            <input type="file" name="file" accept=".xlsx,.csv" required className={input} />
          </Field>
          <div><button disabled={pending} className={btn}>{pending ? "Checking…" : "Check file"}</button></div>
        </form>
        {state.error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
        <p className="mt-2 text-xs text-slate-500">Checking saves nothing. You confirm the import in the next step.</p>
      </Card>

      {r && state.rows && (
        <Card title={`2. Review: ${state.fileName}`}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-emerald-50 p-3"><div className="text-2xl font-semibold text-emerald-800">{r.imported}</div><div className="text-xs text-emerald-900">prospects ready to import</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-semibold">{r.accounts_created}</div><div className="text-xs text-slate-600">new company accounts</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-2xl font-semibold text-amber-800">{r.skipped.length}</div><div className="text-xs text-amber-900">rows that will be skipped</div></div>
          </div>

          {r.skipped.length > 0 && (
            <>
              <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50"><tr>{["Sheet row", "Prospect", "Why it is skipped"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.skipped.map((s) => (
                      <tr key={s.row}><td className={td}>{s.row}</td><td className={td}>{s.prospect}</td><td className={td}>{s.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a href={errorsCsv} download="import-skipped-rows.csv" className={`${btnGhost} mt-3`}>Download skipped rows</a>
            </>
          )}

          <form action={commitImport} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="client_id" value={state.clientId} />
            <input type="hidden" name="campaign_id" value={state.campaignId ?? ""} />
            <input type="hidden" name="rows" value={JSON.stringify(state.rows)} />
            <button disabled={r.imported === 0} className={btn}>Import {r.imported} prospects</button>
          </form>
        </Card>
      )}
    </div>
  );
}
