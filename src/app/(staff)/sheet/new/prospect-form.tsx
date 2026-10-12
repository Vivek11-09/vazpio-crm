"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createProspect } from "@/app/actions";
import { Card, Field, btn, input } from "@/components/ui";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { FieldDef } from "@/lib/custom";

type Match = { id: string; name: string; website: string | null; status: string; owner_name: string | null; match: string };

export function ProspectForm({
  clients,
  campaigns,
  defaultClient,
  fields,
  isAdmin,
}: {
  clients: { id: string; name: string }[];
  campaigns: { id: string; name: string; client_id: string }[];
  defaultClient?: string;
  fields: FieldDef[];
  isAdmin: boolean;
}) {
  const [clientId, setClientId] = useState(defaultClient ?? (clients.length === 1 ? clients[0].id : ""));
  const [campaignId, setCampaignId] = useState("");
  const [override, setOverride] = useState(false);
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [picked, setPicked] = useState<Match | null>(null);

  useEffect(() => {
    if (picked || !clientId || company.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc("find_account_matches", {
        p_client: clientId,
        p_name: company,
        p_website: website || null,
      });
      setMatches((data as Match[]) ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientId, company, website, picked]);

  const visible = picked || !clientId || company.trim().length < 2 ? [] : matches;
  const blocked = visible.some((m) => m.match === "exact") && !override;
  const defs = fields.filter((f) => f.campaign_id === campaignId);

  return (
    <form action={createProspect} className="space-y-4">
      <Card title="Company">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client *">
            <select
              name="client_id"
              required
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setCampaignId("");
                setPicked(null);
              }}
              className={input}
            >
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Campaign">
            <select name="campaign_id" className={input} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.filter((c) => c.client_id === clientId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          {picked ? (
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
              <span>
                Adding a contact to existing account <strong>{picked.name}</strong>
                {picked.owner_name && <> (owner: {picked.owner_name})</>}
              </span>
              <button type="button" onClick={() => setPicked(null)} className="text-indigo-700 hover:underline">
                Change
              </button>
              <input type="hidden" name="account_id" value={picked.id} />
            </div>
          ) : (
            <>
              <Field label="Company name *">
                <input name="company" required value={company} onChange={(e) => setCompany(e.target.value)} className={input} />
              </Field>
              <Field label="Website">
                <input name="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" className={input} />
              </Field>
              <Field label="Industry">
                <input name="industry" className={input} />
              </Field>
              <CustomFieldInputs defs={defs} object="account" />
            </>
          )}
        </div>

        {visible.length > 0 && (
          <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${blocked ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="font-medium">
              {blocked
                ? "This company already exists for this client. Add your contact to the existing account."
                : "Similar companies already exist for this client. Check before creating a new one."}
            </p>
            <ul className="mt-2 space-y-1">
              {visible.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{m.name}</strong>
                    {m.website && <span className="text-slate-500"> · {m.website}</span>}
                    <span className="text-slate-600"> · owner {m.owner_name ?? "unassigned"} · {m.status}</span>
                  </span>
                  <button type="button" onClick={() => setPicked(m)} className="font-medium text-indigo-700 hover:underline">
                    Add contact to this account
                  </button>
                </li>
              ))}
            </ul>
            {isAdmin && visible.some((m) => m.match === "exact") && (
              <label className="mt-2 flex items-center gap-2 border-t border-red-200 pt-2">
                <input type="checkbox" name="dup_override" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                Admin override: this is a different company with the same name, create it anyway
              </label>
            )}
          </div>
        )}
      </Card>

      <Card title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *"><input name="contact_name" required className={input} /></Field>
          <Field label="Designation"><input name="designation" className={input} /></Field>
          <Field label="LinkedIn URL"><input name="linkedin_url" type="url" placeholder="https://www.linkedin.com/in/..." className={input} /></Field>
          <Field label="Location"><input name="location" className={input} /></Field>
          <Field label="Email"><input name="email" type="email" className={input} /></Field>
          <Field label="Contact number"><input name="phone" className={input} /></Field>
          <Field label="Buying role">
            <select name="buying_role" defaultValue="Unknown" className={input}>
              {["Decision Maker", "Influencer", "Gatekeeper", "User", "Unknown"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <div />
          <CustomFieldInputs defs={defs} object="contact" />
          <Field label="Notes (visible to client)"><textarea name="client_note" rows={2} className={input} /></Field>
          <Field label="Internal notes (Vazpio only)"><textarea name="internal_note" rows={2} className={input} /></Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="confirm_duplicate" /> Save anyway if a contact with the same email, phone or LinkedIn exists
        </label>
      </Card>

      <button disabled={blocked} className={btn}>Save prospect</button>
    </form>
  );
}
