import { RANGES, fmtDate } from "@/lib/dates";
import { Bars, Card, Field, Stat, input } from "@/components/ui";

export type Stats = {
  contacts_total?: number;
  contacts_added?: number;
  calls?: number;
  connected?: number;
  contacts_reached?: number;
  meetings_booked?: number;
  meetings_held?: number;
  hqm?: number;
  hqm_billable?: number;
  hqm_pending?: number;
  followups_overdue?: number;
  followups_today?: number;
  monthly_target?: number;
  status_breakdown?: { label: string | null; n: number }[];
  outcome_breakdown?: { label: string | null; n: number }[];
  industry_breakdown?: { label: string | null; n: number }[];
  location_breakdown?: { label: string | null; n: number }[];
  trend?: { d: string; calls: number; connected: number }[];
};

// The monthly target is scaled to the period being viewed, so the first week of a month is not "behind".
export function ragFor(hqm = 0, target = 0, from: string, to: string) {
  if (!target) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const expected = target * Math.min(1, days / 30);
  const [label, tone] =
    hqm >= expected ? ["On Track", "bg-emerald-100 text-emerald-800"]
      : hqm >= expected * 0.6 ? ["At Risk", "bg-amber-100 text-amber-900"]
        : ["Behind Target", "bg-red-100 text-red-800"];
  return { label, tone, expected: Math.round(expected * 10) / 10 };
}

const pct = (a = 0, b = 0) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "n/a");

export function RangeFields({ range, from, to }: { range: string; from: string; to: string }) {
  return (
    <>
      <Field label="Period">
        <select name="range" defaultValue={range} className={input}>
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="From (custom)"><input type="date" name="from" defaultValue={from} className={input} /></Field>
      <Field label="To (custom)"><input type="date" name="to" defaultValue={to} className={input} /></Field>
    </>
  );
}

// Used by both the internal dashboard and the client portal, so the numbers always agree.
export function StatsView({ s, from, to, internal }: { s: Stats; from: string; to: string; internal: boolean }) {
  const target = s.monthly_target ?? 0;
  const rag = ragFor(s.hqm, target, from, to);
  const funnel = [
    { label: "Contacts", n: s.contacts_total ?? 0 },
    { label: "Calls", n: s.calls ?? 0 },
    { label: "Connected", n: s.connected ?? 0 },
    { label: "Meetings booked", n: s.meetings_booked ?? 0 },
    { label: "Meetings held", n: s.meetings_held ?? 0 },
    { label: "HQM", n: s.hqm ?? 0 },
  ];
  const trend = s.trend ?? [];
  const peak = Math.max(...trend.map((t) => t.calls), 1);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {fmtDate(from)} to {fmtDate(to)}
        {rag && (
          <>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${rag.tone}`}>{rag.label}</span>
            <span className="ml-2 text-xs">{s.hqm ?? 0} HQM against {rag.expected} expected for this period</span>
          </>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Prospects" value={s.contacts_total ?? 0} hint={`${s.contacts_added ?? 0} added in period`} />
        <Stat label="Calls attempted" value={s.calls ?? 0} />
        <Stat label="Calls connected" value={s.connected ?? 0} hint={`${pct(s.connected, s.calls)} connection rate`} />
        <Stat label="Meetings booked" value={s.meetings_booked ?? 0} hint={`${pct(s.meetings_booked, s.connected)} of connected`} />
        <Stat label="Meetings held" value={s.meetings_held ?? 0} hint={`${pct(s.meetings_held, s.meetings_booked)} booked to held`} />
        <Stat label="HQMs" value={s.hqm ?? 0} hint={target ? `Monthly target ${target}` : "No target set"} />
        {internal && (
          <>
            <Stat label="Follow-ups overdue" value={s.followups_overdue ?? 0} />
            <Stat label="Follow-ups due today" value={s.followups_today ?? 0} />
            <Stat label="HQM pending review" value={s.hqm_pending ?? 0} />
            <Stat label="Billable HQMs" value={s.hqm_billable ?? 0} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Funnel"><Bars rows={funnel} /></Card>
        <Card title="Prospect status (current)"><Bars rows={s.status_breakdown} /></Card>
        <Card title="Call outcomes (in period)"><Bars rows={s.outcome_breakdown} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Prospects by industry"><Bars rows={s.industry_breakdown} /></Card>
        <Card title="Prospects by location"><Bars rows={s.location_breakdown} /></Card>
      </div>

      <Card title="Daily calls">
        {!trend.length && <p className="text-sm text-slate-500">No calls logged in this period.</p>}
        {!!trend.length && (
          <div className="flex h-36 items-end gap-1 overflow-x-auto">
            {trend.map((t) => (
              <div key={t.d} className="flex min-w-6 flex-1 flex-col items-center gap-1" title={`${fmtDate(t.d)}: ${t.calls} calls, ${t.connected} connected`}>
                <span className="text-[10px] tabular-nums text-slate-500">{t.calls}</span>
                <div className="relative w-full rounded-t bg-indigo-200" style={{ height: `${(t.calls / peak) * 100}px` }}>
                  <div className="absolute bottom-0 w-full rounded-t bg-indigo-600" style={{ height: `${(t.connected / peak) * 100}px` }} />
                </div>
                <span className="text-[10px] text-slate-400">{t.d.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Light bar: calls attempted. Dark bar: connected.</p>
      </Card>
    </div>
  );
}
