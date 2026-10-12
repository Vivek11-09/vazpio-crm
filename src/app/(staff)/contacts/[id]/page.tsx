import Link from "next/link";
import { SubmitButton } from "@/components/client-bits";
import { notFound } from "next/navigation";
import { isAdminRole, requireStaff } from "@/lib/auth";
import { fmtDate, fmtDateTime, todayIST } from "@/lib/dates";
import { bookMeeting, completeFollowup, logActivity, requestEdit, saveCustomValues, updateContact } from "@/app/actions";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomValues, FieldDef } from "@/lib/custom";
import {
  AlertBadge, Card, ExtLink, Field, Notice, StatusBadge, btn, btnGhost, first, input,
  type SearchParams,
} from "@/components/ui";

const LOCKABLE = [
  ["name", "Name"],
  ["designation", "Designation"],
  ["linkedin_url", "LinkedIn URL"],
  ["email", "Email"],
  ["phone", "Contact number"],
  ["location", "Location"],
] as const;

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const isSdr = !isAdminRole(profile.role);

  const { data: c } = await supabase
    .from("contacts")
    .select("*, account:accounts(id, name, website, industry, owner:profiles!owner_id(full_name)), client:clients(name), campaign:campaigns(name)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: activities }, { data: followups }, { data: meetings }, { data: statuses }, { data: outcomes }, { data: siblings }, { data: fieldRows }] =
    await Promise.all([
      supabase.from("activities").select("*, sdr:profiles!sdr_id(full_name)").eq("contact_id", id)
        .order("activity_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("followups").select("*").eq("contact_id", id).eq("status", "open").order("due_date"),
      supabase.from("meetings").select("*").eq("contact_id", id).order("scheduled_at", { ascending: false }),
      supabase.from("prospect_statuses").select("value").eq("is_active", true).order("sort"),
      supabase.from("call_outcomes").select("value").eq("is_active", true).order("sort"),
      supabase.from("contacts").select("id, name, designation, prospect_status").eq("account_id", c.account_id).neq("id", id),
      c.campaign_id
        ? supabase.from("custom_fields").select("*").eq("campaign_id", c.campaign_id).eq("object", "contact").eq("is_active", true)
        : Promise.resolve({ data: [] }),
    ]);
  const defs = (fieldRows ?? []) as FieldDef[];

  const today = todayIST();
  const path = `/contacts/${id}`;

  return (
    <>
      <div className="mb-4">
        <Link href="/sheet" className="text-sm text-slate-500 hover:text-indigo-600">← Calling Sheet</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{c.name}</h1>
          <StatusBadge value={c.prospect_status} />
        </div>
        <p className="text-sm text-slate-500">
          {c.designation && <>{c.designation} at </>}
          <Link prefetch={false} href={`/accounts/${c.account_id}`} className="text-indigo-700 hover:underline">{c.account?.name}</Link> · {c.client?.name}
          {c.campaign?.name && <> · {c.campaign.name}</>} · Owner {c.account?.owner?.full_name ?? "unassigned"}
        </p>
      </div>
      <Notice error={first(sp.error)} ok={first(sp.ok)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Status and notes">
            <form action={updateContact} className="space-y-3">
              <input type="hidden" name="contact_id" value={id} />
              <Field label="Prospect status">
                <select name="prospect_status" defaultValue={c.prospect_status} className={input}>
                  {statuses?.map((s) => <option key={s.value}>{s.value}</option>)}
                </select>
              </Field>
              <Field label="Notes (visible to client)">
                <textarea name="client_note" rows={3} defaultValue={c.client_note ?? ""} className={input} />
              </Field>
              <Field label="Internal notes (Vazpio only)">
                <textarea name="internal_note" rows={3} defaultValue={c.internal_note ?? ""} className={input} />
              </Field>
              <SubmitButton className={btn}>Save</SubmitButton>
            </form>
          </Card>

          <Card title="Contact details">
            <form action={updateContact} className="space-y-3">
              <input type="hidden" name="contact_id" value={id} />
              {LOCKABLE.map(([key, label]) => {
                const locked = isSdr && !!c[key];
                return (
                  <Field key={key} label={locked ? `${label} (locked)` : label}>
                    <input name={key} defaultValue={c[key] ?? ""} disabled={locked} required={key === "name"}
                      className={`${input} disabled:bg-slate-50 disabled:text-slate-500`} />
                  </Field>
                );
              })}
              <div className="flex items-center gap-3">
                <SubmitButton className={btnGhost}>Save details</SubmitButton>
                {c.linkedin_url && <ExtLink href={c.linkedin_url}>Open LinkedIn</ExtLink>}
              </div>
              {isSdr && (
                <p className="text-xs text-slate-500">
                  Blank fields can be filled in once. To change a locked field, send an edit request below.
                </p>
              )}
            </form>

            {isSdr && (
              <details className="mt-4 border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-indigo-700">Request a correction</summary>
                <form action={requestEdit} className="mt-3 space-y-3">
                  <input type="hidden" name="contact_id" value={id} />
                  {LOCKABLE.map(([key]) => <input key={key} type="hidden" name={`current_${key}`} value={c[key] ?? ""} />)}
                  <Field label="Field">
                    <select name="field" className={input}>
                      {LOCKABLE.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Correct value"><input name="requested_value" className={input} /></Field>
                  <Field label="Reason *"><input name="reason" required className={input} /></Field>
                  <SubmitButton className={btnGhost}>Send to Admin</SubmitButton>
                </form>
              </details>
            )}
          </Card>

          {defs.length > 0 && (
            <Card title="Campaign fields">
              <form action={saveCustomValues} className="space-y-3">
                <input type="hidden" name="object" value="contact" />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="campaign_id" value={c.campaign_id} />
                <input type="hidden" name="back" value={path} />
                <CustomFieldInputs defs={defs} object="contact" values={(c.custom ?? {}) as CustomValues} lockFilled={isSdr} />
                <SubmitButton className={btnGhost}>Save campaign fields</SubmitButton>
              </form>
            </Card>
          )}

          {!!siblings?.length && (
            <Card title={`Other contacts at ${c.account?.name}`}>
              <ul className="space-y-2 text-sm">
                {siblings.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <Link prefetch={false} href={`/contacts/${s.id}`} className="text-indigo-700 hover:underline">
                      {s.name}{s.designation && <span className="text-slate-500"> · {s.designation}</span>}
                    </Link>
                    <StatusBadge value={s.prospect_status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Log a call or activity">
            <form action={logActivity} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="contact_id" value={id} />
              <Field label="Date *">
                <input type="date" name="activity_date" required defaultValue={today} max={today} className={input} />
              </Field>
              <Field label="Type">
                <select name="channel" defaultValue="call" className={input}>
                  <option value="call">Call</option>
                  <option value="email_log">Email / material sent</option>
                  <option value="note">Note</option>
                </select>
              </Field>
              <Field label="Call outcome">
                <select name="outcome" defaultValue="" className={input}>
                  <option value="">Select outcome</option>
                  {outcomes?.map((o) => <option key={o.value}>{o.value}</option>)}
                </select>
              </Field>
              <Field label="Change status to">
                <select name="new_status" defaultValue="" className={input}>
                  <option value="">Keep “{c.prospect_status}”</option>
                  {statuses?.map((s) => <option key={s.value}>{s.value}</option>)}
                </select>
              </Field>
              <Field label="What happened (visible to client)" className="sm:col-span-2">
                <textarea name="client_note" rows={2} className={input} />
              </Field>
              <Field label="Internal note (Vazpio only)" className="sm:col-span-2">
                <textarea name="internal_note" rows={2} className={input} />
              </Field>
              <Field label="Next follow-up date">
                <input type="date" name="next_followup_date" min={today} className={input} />
              </Field>
              <Field label="Next action" className="sm:col-span-2">
                <input name="next_action" placeholder="e.g. Call back after 1pm" className={input} />
              </Field>
              <div className="flex items-end"><SubmitButton className={`${btn} w-full`}>Log activity</SubmitButton></div>
            </form>
          </Card>

          {!!followups?.length && (
            <Card title="Open follow-ups">
              <ul className="divide-y divide-slate-100 text-sm">
                {followups.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">
                      <AlertBadge value={f.due_date < today ? "OVERDUE" : f.due_date === today ? "DUE TODAY" : "UPCOMING"} />
                      {fmtDate(f.due_date)}{f.action && <span className="text-slate-600"> · {f.action}</span>}
                    </span>
                    <form action={completeFollowup}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="back" value={path} />
                      <button className="text-indigo-700 hover:underline">Mark done</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`Activity history (${activities?.length ?? 0})`}>
            {!activities?.length && <p className="text-sm text-slate-500">No calls logged yet.</p>}
            <ol className="space-y-3">
              {activities?.map((a) => (
                <li key={a.id} className="border-l-2 border-indigo-200 pl-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{fmtDate(a.activity_date)}</span>
                    <span>{a.channel === "call" ? "Call" : a.channel === "email_log" ? "Email / material" : "Note"}</span>
                    {a.outcome && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{a.outcome}</span>}
                    <span>by {a.sdr?.full_name}</span>
                  </div>
                  {a.client_note && <p className="mt-1 whitespace-pre-wrap">{a.client_note}</p>}
                  {a.internal_note && (
                    <p className="mt-1 whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 text-amber-900">Internal: {a.internal_note}</p>
                  )}
                  {a.next_followup_date && (
                    <p className="mt-1 text-xs text-slate-500">
                      Follow-up set for {fmtDate(a.next_followup_date)}{a.next_action && `: ${a.next_action}`}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Meetings">
            {!!meetings?.length && (
              <ul className="mb-4 divide-y divide-slate-100 text-sm">
                {meetings.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{fmtDateTime(m.scheduled_at)} · {m.status}</span>
                    <span className="text-xs text-slate-500">HQM: {m.hqm_status}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={bookMeeting} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="contact_id" value={id} />
              <Field label="Date and time (IST) *">
                <input type="datetime-local" name="scheduled_at" required className={input} />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue="Booked" className={input}>
                  <option>Proposed</option>
                  <option>Booked</option>
                  <option>Confirmed</option>
                </select>
              </Field>
              <Field label="Mode / link"><input name="mode_or_link" className={input} /></Field>
              <Field label="Client attendees"><input name="client_attendees" className={input} /></Field>
              <div><SubmitButton className={btnGhost}>Add meeting</SubmitButton></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
