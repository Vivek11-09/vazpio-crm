import Link from "next/link";
import { SubmitButton } from "@/components/client-bits";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { saveCampaign, saveClient, setClientSdrs } from "@/app/actions";
import { saveCustomField } from "@/app/admin-actions";
import { FIELD_TYPES, type FieldDef } from "@/lib/custom";
import { Card, Field, Notice, btn, btnGhost, first, input, type SearchParams } from "@/components/ui";

type Campaign = {
  id?: string; name?: string; objective?: string | null; target_industries?: string | null;
  target_locations?: string | null; start_date?: string | null; end_date?: string | null; status?: string;
  monthly_meeting_target?: number; payout_rate?: number; payout_threshold?: number; collateral_links?: string | null;
};

function CampaignForm({ clientId, c }: { clientId: string; c?: Campaign }) {
  return (
    <form action={saveCampaign} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="client_id" value={clientId} />
      {c?.id && <input type="hidden" name="id" value={c.id} />}
      <Field label="Campaign name *" className="sm:col-span-2"><input name="name" required defaultValue={c?.name ?? ""} className={input} /></Field>
      <Field label="Status">
        <select name="status" defaultValue={c?.status ?? "active"} className={input}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
      <Field label="Monthly meeting target"><input type="number" min={0} name="monthly_meeting_target" defaultValue={c?.monthly_meeting_target ?? 0} className={input} /></Field>
      <Field label="Objective" className="sm:col-span-2"><input name="objective" defaultValue={c?.objective ?? ""} className={input} /></Field>
      <Field label="Target industries"><input name="target_industries" defaultValue={c?.target_industries ?? ""} className={input} /></Field>
      <Field label="Target locations"><input name="target_locations" defaultValue={c?.target_locations ?? ""} className={input} /></Field>
      <Field label="Start date"><input type="date" name="start_date" defaultValue={c?.start_date ?? ""} className={input} /></Field>
      <Field label="End date"><input type="date" name="end_date" defaultValue={c?.end_date ?? ""} className={input} /></Field>
      <Field label="SDR payout per HQM"><input type="number" min={0} step="0.01" name="payout_rate" defaultValue={c?.payout_rate ?? 0} className={input} /></Field>
      <Field label="Min. HQMs per month for payout"><input type="number" min={0} name="payout_threshold" defaultValue={c?.payout_threshold ?? 0} className={input} /></Field>
      <Field label="Collateral links (ICP, deck, brochure)" className="sm:col-span-2 lg:col-span-4">
        <textarea name="collateral_links" rows={2} defaultValue={c?.collateral_links ?? ""} className={input} />
      </Field>
      <div><button className={c?.id ? btnGhost : btn}>{c?.id ? "Save campaign" : "Add campaign"}</button></div>
    </form>
  );
}

function FieldForm({ clientId, campaignId, f }: { clientId: string; campaignId: string; f?: FieldDef }) {
  return (
    <form action={saveCustomField} className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="campaign_id" value={campaignId} />
      {f && <input type="hidden" name="id" value={f.id} />}
      <Field label="Field name *"><input name="label" required defaultValue={f?.label ?? ""} className={input} /></Field>
      <Field label="Applies to">
        <select name="object" defaultValue={f?.object ?? "contact"} disabled={!!f} className={`${input} disabled:bg-slate-50`}>
          <option value="account">Account</option>
          <option value="contact">Contact</option>
          <option value="meeting">Meeting</option>
        </select>
      </Field>
      <Field label="Type">
        <select name="field_type" defaultValue={f?.field_type ?? "short_text"} className={input}>
          {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Options (comma separated)"><input name="options" defaultValue={f?.options ?? ""} className={input} /></Field>
      <Field label="Help text"><input name="help_text" defaultValue={f?.help_text ?? ""} className={input} /></Field>
      <Field label="Order"><input type="number" name="display_order" defaultValue={f?.display_order ?? 0} className={input} /></Field>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 sm:col-span-2 lg:col-span-5">
        <label className="flex items-center gap-1"><input type="checkbox" name="is_required" defaultChecked={f?.is_required} /> Required</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="client_visible" defaultChecked={f?.client_visible} /> Visible to client</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="reportable" defaultChecked={f?.reportable} /> Reportable</label>
        {f && <label className="flex items-center gap-1"><input type="checkbox" name="is_active" defaultChecked={f.is_active} /> Active</label>}
      </div>
      <div><SubmitButton className={btnGhost}>{f ? "Save field" : "Add field"}</SubmitButton></div>
    </form>
  );
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: client }, { data: campaigns }, { data: sdrs }, { data: assigned }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("campaigns").select("*").eq("client_id", id).order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "sdr").eq("is_active", true).order("full_name"),
    supabase.from("client_sdrs").select("sdr_id").eq("client_id", id),
  ]);
  if (!client) notFound();
  const { data: fieldRows } = campaigns?.length
    ? await supabase.from("custom_fields").select("*").in("campaign_id", campaigns.map((c) => c.id)).order("display_order")
    : { data: [] };
  const fields = (fieldRows ?? []) as FieldDef[];
  const assignedIds = new Set((assigned ?? []).map((a) => a.sdr_id));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/clients" className="text-sm text-slate-500 hover:text-indigo-600">← Clients</Link>
          <h1 className="text-xl font-semibold">{client.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/sheet?client=${id}`} className={btnGhost}>Calling sheet</Link>
          <Link href={`/portal?client=${id}`} className={btnGhost}>Preview client portal</Link>
        </div>
      </div>
      <Notice error={first(sp.error)} ok={first(sp.ok)} />

      <div className="space-y-4">
        <Card title="Client details">
          <form action={saveClient} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="id" value={id} />
            <Field label="Name *"><input name="name" required defaultValue={client.name} className={input} /></Field>
            <Field label="Website"><input name="website" defaultValue={client.website ?? ""} className={input} /></Field>
            <Field label="Industry"><input name="industry" defaultValue={client.industry ?? ""} className={input} /></Field>
            <Field label="Geography"><input name="geography" defaultValue={client.geography ?? ""} className={input} /></Field>
            <Field label="Start date"><input type="date" name="start_date" defaultValue={client.start_date ?? ""} className={input} /></Field>
            <Field label="Engagement model"><input name="engagement_model" defaultValue={client.engagement_model ?? ""} className={input} /></Field>
            <Field label="Status">
              <select name="status" defaultValue={client.status} className={input}>
                <option value="active">Active</option>
                <option value="inactive">Inactive (no new activity)</option>
              </select>
            </Field>
            <Field label="Primary contacts"><input name="primary_contacts" defaultValue={client.primary_contacts ?? ""} className={input} /></Field>
            <div><SubmitButton className={btn}>Save client</SubmitButton></div>
          </form>
        </Card>

        <Card title="Assigned SDRs">
          {!sdrs?.length && (
            <p className="text-sm text-slate-500">
              No active SDRs yet. Approve users as SDRs on the <Link href="/admin/users" className="text-indigo-700 hover:underline">Users</Link> page.
            </p>
          )}
          {!!sdrs?.length && (
            <form action={setClientSdrs}>
              <input type="hidden" name="client_id" value={id} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sdrs.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="sdr_id" value={s.id} defaultChecked={assignedIds.has(s.id)} />
                    {s.full_name} <span className="text-slate-400">{s.email}</span>
                  </label>
                ))}
              </div>
              <SubmitButton className={`${btn} mt-3`}>Save assignments</SubmitButton>
              <p className="mt-2 text-xs text-slate-500">Changes take effect immediately. Unassigned SDRs lose access to this client.</p>
            </form>
          )}
        </Card>

        <Card title={`Campaigns (${campaigns?.length ?? 0})`}>
          <div className="space-y-3">
            {campaigns?.map((c) => (
              <details key={c.id} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {c.name} <span className="font-normal text-slate-500">· {c.status} · target {c.monthly_meeting_target}/month</span>
                </summary>
                <div className="mt-3"><CampaignForm clientId={id} c={c} /></div>
              </details>
            ))}
            <details className="rounded-lg border border-dashed border-slate-300 p-3" open={!campaigns?.length}>
              <summary className="cursor-pointer text-sm font-medium text-indigo-700">New campaign</summary>
              <div className="mt-3"><CampaignForm clientId={id} /></div>
            </details>
          </div>
        </Card>

        <Card title="Custom fields">
          {!campaigns?.length && <p className="text-sm text-slate-500">Add a campaign first. Custom fields belong to a campaign.</p>}
          <div className="space-y-4">
            {campaigns?.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 text-sm font-semibold">{c.name}</h3>
                <div className="space-y-3">
                  {fields.filter((f) => f.campaign_id === c.id).map((f) => (
                    <details key={f.id} className="rounded-md bg-slate-50 p-2">
                      <summary className="cursor-pointer text-sm">
                        {f.label}{" "}
                        <span className="text-slate-500">
                          · {f.object} · {f.field_type.replace("_", " ")}
                          {f.is_required && " · required"}{f.client_visible && " · client-visible"}{!f.is_active && " · inactive"}
                        </span>
                      </summary>
                      <div className="mt-2"><FieldForm clientId={id} campaignId={c.id} f={f} /></div>
                    </details>
                  ))}
                  <details className="rounded-md border border-dashed border-slate-300 p-2">
                    <summary className="cursor-pointer text-sm font-medium text-indigo-700">New field</summary>
                    <div className="mt-2"><FieldForm clientId={id} campaignId={c.id} /></div>
                  </details>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Deactivating a field hides it from forms but keeps every value already saved.</p>
        </Card>
      </div>
    </>
  );
}
