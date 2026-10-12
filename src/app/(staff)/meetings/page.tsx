import Link from "next/link";
import { FilterForm, SubmitButton } from "@/components/client-bits";
import { isAdminRole, requireStaff } from "@/lib/auth";
import { fmtDateTime } from "@/lib/dates";
import { decideHqm, saveCustomValues, updateMeeting } from "@/app/actions";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomValues, FieldDef } from "@/lib/custom";
import { Card, Field, Notice, PageHeader, btn, btnGhost, first, input, type SearchParams } from "@/components/ui";

const STATUSES = ["Proposed", "Booked", "Confirmed", "Rescheduled", "Cancelled by Prospect", "Cancelled by Client", "No Show", "Held"];

type Named = { name: string } | null;

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const admin = isAdminRole(profile.role);
  const client = first(sp.client);
  const view = first(sp.view);

  let query = supabase
    .from("meetings")
    .select("*, contact:contacts(name, designation), account:accounts(name), client:clients(name), campaign:campaigns(name), sdr:profiles!sdr_id(full_name)")
    .order("scheduled_at", { ascending: false })
    .limit(300);
  if (client) query = query.eq("client_id", client);
  if (view === "pending") query = query.eq("status", "Held").eq("hqm_status", "pending");
  if (view === "hqm") query = query.eq("hqm_status", "accepted");

  const [{ data: rows, error }, { data: fieldRows }, { data: clients }] = await Promise.all([
    query,
    supabase.from("custom_fields").select("*").eq("object", "meeting").eq("is_active", true),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const fields = (fieldRows ?? []) as FieldDef[];

  return (
    <>
      <PageHeader title="Meetings and HQM" sub={`${rows?.length ?? 0} meetings`} />
      <Notice error={error?.message ?? first(sp.error)} ok={first(sp.ok)} />

      <FilterForm className="mb-4 flex flex-wrap gap-2">
        <select name="client" defaultValue={client ?? ""} className={`${input} max-w-56`} aria-label="Client">
          <option value="">All clients</option>
          {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="view" defaultValue={view ?? ""} className={`${input} max-w-56`} aria-label="View">
          <option value="">All meetings</option>
          <option value="pending">Held, HQM pending</option>
          <option value="hqm">Accepted HQMs</option>
        </select>
        <button className={btn}>Filter</button>
      </FilterForm>

      <div className="space-y-3">
        {!rows?.length && <Card><p className="text-sm text-slate-500">No meetings yet. Add one from a contact page.</p></Card>}
        {rows?.map((m) => {
          const local = new Date(new Date(m.scheduled_at).getTime() + 5.5 * 3600000).toISOString().slice(0, 16);
          return (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link prefetch={false} href={`/contacts/${m.contact_id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                    {(m.account as Named)?.name} · {(m.contact as Named)?.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {fmtDateTime(m.scheduled_at)} · {(m.client as Named)?.name}
                    {(m.campaign as Named)?.name && <> · {(m.campaign as Named)?.name}</>}
                    {" · "}SDR {(m.sdr as { full_name: string } | null)?.full_name}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{m.status}</span>
                  <span className={`rounded-full px-2 py-0.5 ${
                    m.hqm_status === "accepted" ? "bg-emerald-100 text-emerald-800"
                      : m.hqm_status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                    HQM {m.hqm_status}
                  </span>
                  {m.billable && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">Billable</span>}
                  {m.existing_opportunity && <span className="rounded-full bg-slate-200 px-2 py-0.5">Existing opportunity</span>}
                </div>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-indigo-700">Update meeting</summary>
                <form action={updateMeeting} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="id" value={m.id} />
                  <Field label="Status">
                    <select name="status" defaultValue={m.status} className={input}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Date and time (IST)">
                    <input type="datetime-local" name="scheduled_at" defaultValue={local} className={input} />
                  </Field>
                  <Field label="Mode / link"><input name="mode_or_link" defaultValue={m.mode_or_link ?? ""} className={input} /></Field>
                  <Field label="Client attendees"><input name="client_attendees" defaultValue={m.client_attendees ?? ""} className={input} /></Field>
                  <Field label="Qualification notes (required before HQM review)" className="sm:col-span-2 lg:col-span-4">
                    <textarea name="qualification_notes" rows={2} defaultValue={m.qualification_notes ?? ""} className={input} />
                  </Field>
                  <div><SubmitButton className={btnGhost}>Save meeting</SubmitButton></div>
                </form>

                {fields.some((f) => f.campaign_id === m.campaign_id) && (
                  <form action={saveCustomValues} className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="object" value="meeting" />
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="campaign_id" value={m.campaign_id} />
                    <input type="hidden" name="back" value="/meetings" />
                    <CustomFieldInputs defs={fields.filter((f) => f.campaign_id === m.campaign_id)} object="meeting" values={(m.custom ?? {}) as CustomValues} />
                    <div className="flex items-end"><SubmitButton className={btnGhost}>Save campaign fields</SubmitButton></div>
                  </form>
                )}

                {admin && (
                  <form action={decideHqm} className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                    <input type="hidden" name="id" value={m.id} />
                    <Field label="HQM decision">
                      <select name="hqm_status" defaultValue={m.hqm_status} className={input}>
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </Field>
                    <Field label="Confirmed by (client contact)">
                      <input name="client_confirmed_by" defaultValue={m.client_confirmed_by ?? ""} className={input} />
                    </Field>
                    <Field label="Credit reason (deemed HQM)">
                      <input name="credit_reason" defaultValue={m.credit_reason ?? ""} className={input} />
                    </Field>
                    <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
                      <input type="checkbox" name="existing_opportunity" defaultChecked={m.existing_opportunity} />
                      Existing client / opportunity (not billable)
                    </label>
                    <div><SubmitButton className={btn}>Save HQM decision</SubmitButton></div>
                  </form>
                )}
              </details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
