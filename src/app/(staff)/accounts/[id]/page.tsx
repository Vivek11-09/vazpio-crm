import Link from "next/link";
import { SubmitButton } from "@/components/client-bits";
import { notFound } from "next/navigation";
import { isAdminRole, requireStaff } from "@/lib/auth";
import { saveCustomValues, transferAccount, updateAccount } from "@/app/actions";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomValues, FieldDef } from "@/lib/custom";
import { Card, Field, Notice, StatusBadge, btn, btnGhost, first, input, type SearchParams } from "@/components/ui";

const LOCKABLE = [
  ["name", "Company name"],
  ["website", "Website"],
  ["industry", "Industry"],
  ["company_size", "Company size"],
  ["location", "Location"],
  ["linkedin_url", "LinkedIn company URL"],
  ["tier", "Priority / Tier"],
] as const;

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const admin = isAdminRole(profile.role);

  const { data: a } = await supabase
    .from("accounts")
    .select("*, client:clients(name), owner:profiles!owner_id(full_name), creator:profiles!created_by(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();

  const [{ data: contacts }, { data: links }, { data: team }] = await Promise.all([
    supabase.from("contacts").select("id, name, designation, buying_role, prospect_status, contact_status").eq("account_id", id).order("name"),
    supabase.from("account_campaigns").select("campaign:campaigns(id, name)").eq("account_id", id),
    admin
      ? supabase.from("client_sdrs").select("sdr:profiles!sdr_id(id, full_name)").eq("client_id", a.client_id)
      : Promise.resolve({ data: [] }),
  ]);
  const campaigns = (links ?? []).map((l) => l.campaign as unknown as { id: string; name: string }).filter(Boolean);
  const { data: fieldRows } = campaigns.length
    ? await supabase.from("custom_fields").select("*").eq("object", "account").eq("is_active", true).in("campaign_id", campaigns.map((c) => c.id))
    : { data: [] };
  const defs = (fieldRows ?? []) as FieldDef[];
  const sdrs = (team ?? []).map((t) => (t as { sdr: unknown }).sdr as { id: string; full_name: string }).filter(Boolean);
  const path = `/accounts/${id}`;

  return (
    <>
      <div className="mb-4">
        <Link href={`/sheet?client=${a.client_id}`} className="text-sm text-slate-500 hover:text-indigo-600">← Calling Sheet</Link>
        <h1 className="mt-1 text-xl font-semibold">
          {a.name} {a.is_archived && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium">Archived</span>}
        </h1>
        <p className="text-sm text-slate-500">
          {a.client?.name} · Owner {a.owner?.full_name ?? "unassigned"}
          {campaigns.length > 0 && <> · {campaigns.map((c) => c.name).join(", ")}</>}
          {a.creator?.full_name && <> · Created by {a.creator.full_name}</>}
        </p>
      </div>
      <Notice error={first(sp.error)} ok={first(sp.ok)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account details">
          <form action={updateAccount} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="account_id" value={id} />
            {LOCKABLE.map(([key, label]) => {
              const locked = !admin && !!a[key];
              return (
                <Field key={key} label={locked ? `${label} (locked)` : label}>
                  <input name={key} defaultValue={a[key] ?? ""} disabled={locked} required={key === "name"}
                    className={`${input} disabled:bg-slate-50 disabled:text-slate-500`} />
                </Field>
              );
            })}
            <Field label="Account status"><input name="status" defaultValue={a.status ?? ""} className={input} /></Field>
            <Field label="Research notes" className="sm:col-span-2">
              <textarea name="research_notes" rows={3} defaultValue={a.research_notes ?? ""} className={input} />
            </Field>
            <div><SubmitButton className={btn}>Save account</SubmitButton></div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card title={`Contacts (${contacts?.length ?? 0})`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {contacts?.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link prefetch={false} href={`/contacts/${c.id}`} className="text-indigo-700 hover:underline">
                    {c.name}
                    <span className="text-slate-500">{c.designation && ` · ${c.designation}`} · {c.buying_role}</span>
                  </Link>
                  <StatusBadge value={c.prospect_status} />
                </li>
              ))}
            </ul>
            <Link href={`/sheet/new?client=${a.client_id}`} className={`${btnGhost} mt-3`}>Add another contact</Link>
          </Card>

          {defs.length > 0 && campaigns.map((cp) => {
            const mine = defs.filter((d) => d.campaign_id === cp.id);
            if (!mine.length) return null;
            return (
              <Card key={cp.id} title={`Campaign fields: ${cp.name}`}>
                <form action={saveCustomValues} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="object" value="account" />
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="campaign_id" value={cp.id} />
                  <input type="hidden" name="back" value={path} />
                  <CustomFieldInputs defs={mine} object="account" values={(a.custom ?? {}) as CustomValues} lockFilled={!admin} />
                  <div className="sm:col-span-2"><SubmitButton className={btnGhost}>Save campaign fields</SubmitButton></div>
                </form>
              </Card>
            );
          })}

          {admin && (
            <Card title="Ownership (Admin / Manager)">
              <form action={transferAccount} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="account_id" value={id} />
                <Field label="Primary SDR owner">
                  <select name="owner_id" defaultValue={a.owner_id} className={input}>
                    {!sdrs.some((s) => s.id === a.owner_id) && <option value={a.owner_id}>{a.owner?.full_name ?? "Current owner"}</option>}
                    {sdrs.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
                  <input type="checkbox" name="is_archived" defaultChecked={a.is_archived} /> Archived
                </label>
                <SubmitButton className={btn}>Save</SubmitButton>
              </form>
              <p className="mt-2 text-xs text-slate-500">
                Transfers are recorded in the audit log. Open follow-ups move to the new owner; call history keeps the original SDR.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
