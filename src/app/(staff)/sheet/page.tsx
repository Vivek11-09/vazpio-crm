import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { fmtDate } from "@/lib/dates";
import { ExpandableText, FilterForm } from "@/components/client-bits";
import {
  AlertBadge, ExtLink, Notice, PageHeader, StatusBadge, btn, btnGhost, first, input, td, th,
  type SearchParams,
} from "@/components/ui";

const PAGE = 100;

export default async function SheetPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const f = {
    client: first(sp.client),
    campaign: first(sp.campaign),
    status: first(sp.status),
    alert: first(sp.alert),
    mine: first(sp.mine),
    q: first(sp.q)?.replace(/[,()%*]/g, " ").trim(),
  };
  const page = Math.max(1, Number(first(sp.page) ?? 1));

  const [{ data: clients }, { data: campaigns }, { data: statuses }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, client_id").order("name"),
    supabase.from("prospect_statuses").select("value").eq("is_active", true).order("sort"),
  ]);

  let query = supabase.from("calling_sheet").select("*", { count: "exact" });
  if (f.client) query = query.eq("client_id", f.client);
  if (f.campaign) query = query.eq("campaign_id", f.campaign);
  if (f.status) query = query.eq("status", f.status);
  if (f.alert) query = query.eq("followup_alert", f.alert);
  if (f.mine) query = query.eq("owner_id", profile.id);
  if (f.q) query = query.or(`prospect.ilike.%${f.q}%,contact_name.ilike.%${f.q}%,email.ilike.%${f.q}%`);
  const { data: rows, count, error } = await query
    .order("created_at", { ascending: false })
    .order("contact_id")
    .range((page - 1) * PAGE, page * PAGE - 1);

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const filtered = Object.values(f).some(Boolean);
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && params.set(k, v));
    params.set("page", String(p));
    return `/sheet?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Calling Sheet"
        sub={`${count ?? 0} prospect${count === 1 ? "" : "s"}${filtered ? " match these filters" : ""}`}
        action={{ href: f.client ? `/sheet/new?client=${f.client}` : "/sheet/new", label: "Add prospect" }}
      />
      <Notice error={error?.message ?? first(sp.error)} />

      <FilterForm className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)_auto_auto]">
        <select name="client" defaultValue={f.client ?? ""} className={input} aria-label="Client">
          <option value="">All clients</option>
          {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="campaign" defaultValue={f.campaign ?? ""} className={input} aria-label="Campaign">
          <option value="">All campaigns</option>
          {campaigns?.filter((c) => !f.client || c.client_id === f.client).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} className={input} aria-label="Status">
          <option value="">All statuses</option>
          {statuses?.map((s) => <option key={s.value}>{s.value}</option>)}
        </select>
        <select name="alert" defaultValue={f.alert ?? ""} className={input} aria-label="Follow-up alert">
          <option value="">Any follow-up</option>
          <option>OVERDUE</option>
          <option>DUE SOON</option>
          <option>UPCOMING</option>
        </select>
        <input name="q" type="search" defaultValue={f.q ?? ""} placeholder="Search company, contact, email" className={input} aria-label="Search" />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
          <input type="checkbox" name="mine" value="1" defaultChecked={!!f.mine} /> My accounts
        </label>
        <div className="flex gap-2">
          <button className={btn}>Search</button>
          {filtered && <Link href="/sheet" className={btnGhost}>Clear</Link>}
        </div>
      </FilterForm>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {["Prospect", "Contact", "Status", "Notes", "Reach", "Last activity", "Next follow-up", "Owner", "Calls"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows?.map((r) => (
              <tr key={r.contact_id} className="hover:bg-indigo-50/40">
                <td className={`${td} min-w-36 font-medium`}>
                  <Link prefetch={false} href={`/accounts/${r.account_id}`} className="text-slate-900 hover:text-indigo-600">{r.prospect}</Link>
                  <div className="text-xs font-normal text-slate-400">
                    {[!f.client && clientName.get(r.client_id), r.location].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className={`${td} min-w-40`}>
                  <Link prefetch={false} href={`/contacts/${r.contact_id}`} className="font-medium text-indigo-700 hover:underline">{r.contact_name}</Link>
                  <div className="text-xs text-slate-500">{r.designation}</div>
                </td>
                <td className={td}><StatusBadge value={r.status} /></td>
                <td className={`${td} min-w-52 max-w-80 text-slate-600`}>
                  <ExpandableText text={r.client_note} />
                  {r.last_note && r.last_note !== r.client_note && (
                    <div className="mt-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Last call: </span>{r.last_note}
                    </div>
                  )}
                </td>
                <td className={`${td} text-xs text-slate-600`}>
                  <div className="max-w-44 truncate" title={r.email ?? ""}>{r.email}</div>
                  <div className="whitespace-nowrap tabular-nums">{r.phone}</div>
                  {r.linkedin_url && <ExtLink href={r.linkedin_url}>LinkedIn</ExtLink>}
                </td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>
                  {fmtDate(r.last_activity_date)}
                  <div className="text-xs text-slate-500">{r.last_outcome}</div>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {fmtDate(r.next_followup_date)}
                  <div><AlertBadge value={r.followup_alert} /></div>
                </td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{r.owner_name}</td>
                <td className={`${td} text-right tabular-nums`}>{r.call_count}</td>
              </tr>
            ))}
            {!rows?.length && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                  {filtered ? "No prospects match these filters." : "No prospects yet. Add one or import a sheet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(count ?? 0) > PAGE && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className={btnGhost}>Previous</Link>}
          <span className="text-slate-500">Page {page} of {Math.ceil((count ?? 0) / PAGE)}</span>
          {page * PAGE < (count ?? 0) && <Link href={pageHref(page + 1)} className={btnGhost}>Next</Link>}
        </div>
      )}
    </>
  );
}
