import { getSession, isAdminRole, isClientRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fmtDate, fmtDateTime, resolveRange } from "@/lib/dates";
import { Shell } from "@/components/shell";
import {
  AlertBadge, Card, ExtLink, Field, Notice, StatusBadge, btn, first, input, td, th,
  type SearchParams,
} from "@/components/ui";
import { RangeFields, StatsView, type Stats } from "@/components/stats-view";
import { showValue } from "@/lib/custom";
import { ExpandableText, FilterForm } from "@/components/client-bits";

type Row = {
  contact_id: string; campaign_id: string | null; activity_date: string | null; prospect: string;
  contact_name: string; linkedin_url: string | null; designation: string | null; location: string | null;
  email: string | null; phone: string | null; status: string; owner: string; notes: string | null;
  last_note: string | null; next_followup_date: string | null; followup_alert: string | null;
  custom: Record<string, unknown> | null;
};

// Read-only client portal. There is intentionally no export, edit or comment control on this page,
// and the portal_* database functions return only client-safe columns.
export default async function PortalPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const preview = isAdminRole(profile.role) ? first(sp.client) : undefined;
  if (!isClientRole(profile.role) && !preview) redirect("/sheet");

  const { range, from, to } = resolveRange(first(sp.range), first(sp.from), first(sp.to));
  const campaign = first(sp.campaign) ?? null;
  const status = first(sp.status);
  const q = first(sp.q)?.toLowerCase().trim();
  const p_client = preview ?? null;

  const [{ data: sheet, error }, { data: stats }, { data: campaigns }, { data: meetings }, { data: client }] = await Promise.all([
    supabase.rpc("portal_calling_sheet", { p_client }),
    supabase.rpc("portal_stats", { p_from: from, p_to: to, p_campaign: campaign, p_client }),
    supabase.rpc("portal_campaigns", { p_client }),
    supabase.rpc("portal_meetings", { p_client }),
    supabase.from("clients").select("name").eq("id", preview ?? profile.client_id ?? "").maybeSingle(),
  ]);

  const all = (sheet ?? []) as Row[];
  const statuses = [...new Set(all.map((r) => r.status))].sort();
  const rows = all.filter(
    (r) =>
      (!campaign || r.campaign_id === campaign) &&
      (!status || r.status === status) &&
      (!q || `${r.prospect} ${r.contact_name} ${r.designation ?? ""} ${r.location ?? ""}`.toLowerCase().includes(q)),
  );

  const extra = [...new Set(rows.flatMap((r) => Object.keys(r.custom ?? {})))].sort();

  return (
    <Shell variant="top" groups={[{ links: [{ href: "#overview", label: "Overview" }, { href: "#sheet", label: "Calling Sheet" }, { href: "#meetings", label: "Meetings" }] }]}
      who={preview ? `Previewing as client: ${client?.name ?? ""}` : profile.full_name}>
      <div id="overview" className="mb-4 scroll-mt-20">
        <h1 className="text-xl font-semibold">{client?.name ?? "Your campaign"}</h1>
        <p className="text-sm text-slate-500">Outbound activity run by the Vazpio team. This view is read-only.</p>
      </div>
      <Notice error={error?.message} />

      <FilterForm className="mb-4 grid grid-cols-2 items-end gap-2 md:grid-cols-4 lg:grid-cols-7">
        {preview && <input type="hidden" name="client" value={preview} />}
        <RangeFields range={range} from={from} to={to} />
        <Field label="Campaign">
          <select name="campaign" defaultValue={campaign ?? ""} className={input}>
            <option value="">All campaigns</option>
            {(campaigns as { id: string; name: string }[] | null)?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status ?? ""} className={input}>
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Search"><input name="q" defaultValue={q ?? ""} placeholder="Company or contact" className={input} /></Field>
        <button className={btn}>Apply</button>
      </FilterForm>

      <StatsView s={(stats ?? {}) as Stats} from={from} to={to} internal={false} />

      <h2 id="sheet" className="mb-2 mt-6 scroll-mt-20 text-base font-semibold">Calling Sheet ({rows.length})</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {["Date", "Prospect", "Contact", "Email / Contact no.", "Status", "Owner", "Notes", ...extra, "Next follow-up"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.contact_id}>
                <td className={`${td} whitespace-nowrap text-slate-500`}>{fmtDate(r.activity_date)}</td>
                <td className={`${td} min-w-36 font-medium`}>
                  {r.prospect}
                  <div className="text-xs font-normal text-slate-400">{r.location}</div>
                </td>
                <td className={`${td} min-w-40`}>
                  <ExtLink href={r.linkedin_url}>{r.contact_name}</ExtLink>
                  <div className="text-xs text-slate-500">{r.designation}</div>
                </td>
                <td className={`${td} text-xs text-slate-600`}>
                  <div className="max-w-52 truncate" title={r.email ?? ""}>{r.email}</div>
                  <div className="whitespace-nowrap tabular-nums">{r.phone}</div>
                </td>
                <td className={td}><StatusBadge value={r.status} /></td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{r.owner}</td>
                <td className={`${td} min-w-56 max-w-96 text-slate-600`}>
                  <ExpandableText text={[r.notes, r.last_note !== r.notes ? r.last_note : null].filter(Boolean).join(" · ")} />
                </td>
                {extra.map((k) => <td key={k} className={td}>{showValue(r.custom?.[k])}</td>)}
                <td className={`${td} whitespace-nowrap`}>
                  {fmtDate(r.next_followup_date)}
                  <div><AlertBadge value={r.followup_alert} /></div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8 + extra.length} className="px-3 py-10 text-center text-sm text-slate-500">No prospects match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 id="meetings" className="mb-2 mt-6 scroll-mt-20 text-base font-semibold">Meetings</h2>
      <Card>
        {!(meetings as unknown[] | null)?.length && <p className="text-sm text-slate-500">No meetings yet.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {(meetings as { id: string; campaign_id: string | null; prospect: string; contact_name: string; designation: string | null; scheduled_at: string; status: string; hqm_status: string }[] | null)
            ?.filter((m) => !campaign || m.campaign_id === campaign)
            .map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{m.prospect}</strong> · {m.contact_name}
                  {m.designation && <span className="text-slate-500"> ({m.designation})</span>}
                </span>
                <span className="text-slate-600">
                  {fmtDateTime(m.scheduled_at)} · {m.status}
                  {m.hqm_status === "accepted" && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Qualified</span>}
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </Shell>
  );
}
