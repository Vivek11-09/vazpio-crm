import Link from "next/link";
import { FilterForm } from "@/components/client-bits";
import { isAdminRole, requireStaff } from "@/lib/auth";
import { fmtDate, todayIST } from "@/lib/dates";
import { completeFollowup } from "@/app/actions";
import { Card, Notice, PageHeader, first, input, btn, type SearchParams } from "@/components/ui";

export default async function FollowupsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const admin = isAdminRole(profile.role);
  // SDRs see their own queue; managers see everyone's and can narrow it down.
  const owner = admin ? first(sp.sdr) : profile.id;
  const client = first(sp.client);

  let query = supabase
    .from("followups")
    .select("id, due_date, action, contact_id, contact:contacts(name, phone, designation), account:accounts(name), client:clients(name), owner:profiles!owner_id(full_name)")
    .eq("status", "open")
    .order("due_date")
    .limit(500);
  if (owner) query = query.eq("owner_id", owner);
  if (client) query = query.eq("client_id", client);

  let flagQuery = supabase.from("attention_items").select("*").order("since").limit(200);
  if (owner) flagQuery = flagQuery.eq("owner_id", owner);
  if (client) flagQuery = flagQuery.eq("client_id", client);

  const [{ data: rows, error }, { data: flags }, { data: clients }, { data: sdrs }] = await Promise.all([
    query,
    flagQuery,
    supabase.from("clients").select("id, name").order("name"),
    admin
      ? supabase.from("profiles").select("id, full_name").eq("role", "sdr").order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const today = todayIST();
  const all = rows ?? [];
  const groups = [
    { title: "Overdue", tone: "text-red-700", items: all.filter((r) => r.due_date < today) },
    { title: "Due today", tone: "text-amber-700", items: all.filter((r) => r.due_date === today) },
    { title: "Upcoming", tone: "text-slate-700", items: all.filter((r) => r.due_date > today) },
  ];

  return (
    <>
      <PageHeader title={admin ? "Follow-ups" : "Today's Follow-ups"} sub={`${all.length} open`} />
      <Notice error={error?.message ?? first(sp.error)} />

      <FilterForm className="mb-4 flex flex-wrap gap-2">
        <select name="client" defaultValue={client ?? ""} className={`${input} max-w-56`} aria-label="Client">
          <option value="">All clients</option>
          {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {admin && (
          <select name="sdr" defaultValue={owner ?? ""} className={`${input} max-w-56`} aria-label="SDR">
            <option value="">All SDRs</option>
            {sdrs?.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        )}
        <button className={btn}>Filter</button>
      </FilterForm>

      <div className="space-y-4">
        {!!flags?.length && (
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-purple-800">Needs attention ({flags.length})</h2>
            <ul className="divide-y divide-slate-100">
              {flags.map((f, i) => (
                <li key={`${f.contact_id}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <Link prefetch={false} href={`/contacts/${f.contact_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {f.contact_name} · {f.account_name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {f.kind} · since {fmtDate(f.since)}{admin && f.owner_name && <> · {f.owner_name}</>}
                    </div>
                  </div>
                  <Link prefetch={false} href={`/contacts/${f.contact_id}`} className="font-medium text-indigo-700 hover:underline">Open</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {groups.map((g) => (
          <Card key={g.title}>
            <h2 className={`mb-2 text-sm font-semibold ${g.tone}`}>{g.title} ({g.items.length})</h2>
            {!g.items.length && <p className="text-sm text-slate-500">Nothing here.</p>}
            <ul className="divide-y divide-slate-100">
              {g.items.map((r) => {
                const contact = r.contact as unknown as { name: string; phone: string | null; designation: string | null } | null;
                const account = r.account as unknown as { name: string } | null;
                const cl = r.client as unknown as { name: string } | null;
                const own = r.owner as unknown as { full_name: string } | null;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link prefetch={false} href={`/contacts/${r.contact_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {contact?.name} · {account?.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {fmtDate(r.due_date)} · {cl?.name}
                        {contact?.phone && <> · {contact.phone}</>}
                        {admin && own && <> · {own.full_name}</>}
                      </div>
                      {r.action && <div className="text-slate-700">{r.action}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Link prefetch={false} href={`/contacts/${r.contact_id}`} className="font-medium text-indigo-700 hover:underline">Log call</Link>
                      <form action={completeFollowup}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-slate-500 hover:text-slate-900">Mark done</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
