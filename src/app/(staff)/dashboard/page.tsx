import { isAdminRole, requireStaff } from "@/lib/auth";
import { resolveRange } from "@/lib/dates";
import { Card, Field, Notice, PageHeader, btn, first, input, td, th, type SearchParams } from "@/components/ui";
import { RangeFields, StatsView, ragFor, type Stats } from "@/components/stats-view";
import { FilterForm } from "@/components/client-bits";
import Link from "next/link";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const admin = isAdminRole(profile.role);
  const { range, from, to } = resolveRange(first(sp.range), first(sp.from), first(sp.to));
  const client = first(sp.client) ?? null;
  const campaign = first(sp.campaign) ?? null;
  // An SDR's dashboard is always their own numbers.
  const sdr = admin ? first(sp.sdr) ?? null : profile.id;

  const [{ data: stats, error }, { data: clients }, { data: campaigns }, { data: sdrs }, { data: board }] = await Promise.all([
    supabase.rpc("dashboard_stats", { p_from: from, p_to: to, p_client: client, p_campaign: campaign, p_sdr: sdr }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, client_id").order("name"),
    admin
      ? supabase.from("profiles").select("id, full_name").eq("role", "sdr").order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    admin
      ? supabase.rpc("sdr_leaderboard", { p_from: from, p_to: to, p_client: client })
      : Promise.resolve({ data: null }),
  ]);

  // Management view: one row per client, so targets and conversion can be compared side by side.
  const perClient = admin && !client
    ? await Promise.all((clients ?? []).map(async (c) => {
        const { data } = await supabase.rpc("dashboard_stats", { p_from: from, p_to: to, p_client: c.id, p_campaign: null, p_sdr: sdr });
        return { ...c, s: (data ?? {}) as Stats };
      }))
    : [];

  return (
    <>
      <PageHeader title={admin ? "Dashboard" : "My dashboard"} />
      <Notice error={error?.message} />

      <FilterForm className="mb-4 grid grid-cols-2 items-end gap-2 md:grid-cols-4 xl:grid-cols-7">
        <RangeFields range={range} from={from} to={to} />
        <Field label="Client">
          <select name="client" defaultValue={client ?? ""} className={input}>
            <option value="">All clients</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Campaign">
          <select name="campaign" defaultValue={campaign ?? ""} className={input}>
            <option value="">All campaigns</option>
            {campaigns?.filter((c) => !client || c.client_id === client).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        {admin && (
          <Field label="SDR">
            <select name="sdr" defaultValue={sdr ?? ""} className={input}>
              <option value="">All SDRs</option>
              {sdrs?.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </Field>
        )}
        <button className={btn}>Apply</button>
      </FilterForm>

      <StatsView s={(stats ?? {}) as Stats} from={from} to={to} internal />

      {perClient.length > 0 && (
        <Card title="By client" className="mt-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  {["Client", "Prospects", "Calls", "Connected", "Booked", "Held", "HQM", "Monthly target", "Health"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perClient.map((c) => {
                  const rag = ragFor(c.s.hqm, c.s.monthly_target, from, to);
                  return (
                    <tr key={c.id}>
                      <td className={`${td} font-medium`}>
                        <Link prefetch={false} href={`/dashboard?client=${c.id}&range=${range}&from=${from}&to=${to}`} className="text-indigo-700 hover:underline">{c.name}</Link>
                      </td>
                      <td className={`${td} tabular-nums`}>{c.s.contacts_total ?? 0}</td>
                      <td className={`${td} tabular-nums`}>{c.s.calls ?? 0}</td>
                      <td className={`${td} tabular-nums`}>{c.s.connected ?? 0}</td>
                      <td className={`${td} tabular-nums`}>{c.s.meetings_booked ?? 0}</td>
                      <td className={`${td} tabular-nums`}>{c.s.meetings_held ?? 0}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{c.s.hqm ?? 0}</td>
                      <td className={`${td} tabular-nums`}>{c.s.monthly_target ?? 0}</td>
                      <td className={td}>
                        {rag ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rag.tone}`}>{rag.label}</span> : <span className="text-xs text-slate-400">No target</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {admin && (
        <Card title="SDR leaderboard" className="mt-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr>
                  {["SDR", "Calls", "Connected", "Booked", "Held", "HQM", "Overdue follow-ups", "Score"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(board as Record<string, string | number>[] | null)?.map((r) => (
                  <tr key={r.sdr_id}>
                    <td className={`${td} font-medium`}>{r.sdr_name}</td>
                    <td className={`${td} tabular-nums`}>{r.calls}</td>
                    <td className={`${td} tabular-nums`}>{r.connected}</td>
                    <td className={`${td} tabular-nums`}>{r.meetings_booked}</td>
                    <td className={`${td} tabular-nums`}>{r.meetings_held}</td>
                    <td className={`${td} tabular-nums`}>{r.hqm}</td>
                    <td className={`${td} tabular-nums`}>{r.overdue}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Score = HQM × 10 + held × 4 + booked × 2 + connected × 0.2 − overdue follow-ups × 0.5. Call volume alone
            barely moves it.
          </p>
        </Card>
      )}
    </>
  );
}
