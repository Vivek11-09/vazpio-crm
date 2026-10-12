"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { explain, fail, istToIso, str } from "@/lib/action-utils";
import { type CustomValues, type FieldDef, readCustom } from "@/lib/custom";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function campaignFields(supabase: Db, campaignId: string | null): Promise<FieldDef[]> {
  if (!campaignId) return [];
  const { data } = await supabase.from("custom_fields").select("*").eq("campaign_id", campaignId).eq("is_active", true);
  return (data ?? []) as FieldDef[];
}

// Saves the campaign fields shown on a contact, account or meeting page.
export async function saveCustomValues(fd: FormData) {
  const supabase = await createClient();
  const object = str(fd, "object") as FieldDef["object"];
  const id = str(fd, "id")!;
  const back = str(fd, "back") ?? "/sheet";
  const table = object === "account" ? "accounts" : object === "contact" ? "contacts" : "meetings";
  const { data: row, error: readError } = await supabase.from(table).select("custom").eq("id", id).single();
  if (readError) fail(back, explain(readError));
  const defs = await campaignFields(supabase, str(fd, "campaign_id"));
  const parsed = readCustom(fd, defs, object, (row.custom ?? {}) as CustomValues);
  if (parsed.error) fail(back, parsed.error);
  const { error } = await supabase.from(table).update({ custom: parsed.values }).eq("id", id);
  if (error) fail(back, explain(error));
  revalidatePath(back);
  redirect(`${back}?ok=Campaign fields saved`);
}

const ACCOUNT_FIELDS = ["name", "website", "industry", "company_size", "location", "linkedin_url", "tier", "status", "research_notes"];

export async function updateAccount(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "account_id")!;
  const path = `/accounts/${id}`;
  const patch: Record<string, string | null> = {};
  for (const k of ACCOUNT_FIELDS) if (fd.has(k)) patch[k] = str(fd, k);
  if ("name" in patch && !patch.name) fail(path, "Company name is required.");
  if ("status" in patch && !patch.status) patch.status = "Active";
  const { error } = await supabase.from("accounts").update(patch).eq("id", id);
  if (error) fail(path, error.code === "23505" ? "Another account for this client already has that name or website." : explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=Account saved`);
}

// Admin/Manager only (the database rejects it for SDRs). Open follow-ups move with the account.
export async function transferAccount(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "account_id")!;
  const path = `/accounts/${id}`;
  const owner = str(fd, "owner_id");
  const patch: Record<string, string | boolean> = { is_archived: fd.get("is_archived") === "on" };
  if (owner) patch.owner_id = owner;
  const { error } = await supabase.from("accounts").update(patch).eq("id", id);
  if (error) fail(path, explain(error));
  if (owner) {
    await supabase.from("followups").update({ owner_id: owner }).eq("account_id", id).eq("status", "open");
  }
  revalidatePath(path);
  redirect(`${path}?ok=Account updated`);
}

// ------------------------------------------------------------------ prospects
export async function createProspect(fd: FormData) {
  const supabase = await createClient();
  const path = "/sheet/new";
  const clientId = str(fd, "client_id");
  const campaignId = str(fd, "campaign_id");
  const company = str(fd, "company");
  const contactName = str(fd, "contact_name");
  let accountId = str(fd, "account_id");
  if (!clientId) fail(path, "Select a client.");
  if (!contactName) fail(path, "Contact name is required.");

  const email = str(fd, "email");
  const phone = str(fd, "phone");
  const linkedin = str(fd, "linkedin_url");

  if (!fd.get("confirm_duplicate")) {
    for (const [col, val] of [["email", email], ["phone", phone], ["linkedin_url", linkedin]] as const) {
      if (!val) continue;
      const q = supabase.from("contacts").select("name").eq("client_id", clientId).limit(1);
      const { data } = col === "email" ? await q.ilike(col, val) : await q.eq(col, val);
      if (data?.length) {
        fail(path, `A contact with the same ${col === "linkedin_url" ? "LinkedIn URL" : col} already exists for this client: ${data[0].name}. Tick "Save anyway" to continue.`);
      }
    }
  }

  const defs = await campaignFields(supabase, campaignId);
  const accountCustom = readCustom(fd, defs, "account");
  const contactCustom = readCustom(fd, defs, "contact");
  if (accountCustom.error) fail(path, accountCustom.error);
  if (contactCustom.error) fail(path, contactCustom.error);

  if (!accountId) {
    if (!company) fail(path, "Company name is required.");
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        client_id: clientId,
        name: company,
        website: str(fd, "website"),
        industry: str(fd, "industry"),
        location: str(fd, "location"),
        owner_id: userData.user?.id,
        custom: accountCustom.values,
        // Ignored by the database unless the user is an Admin or Manager.
        dup_override: fd.get("dup_override") === "on",
      })
      .select("id")
      .single();
    if (error) {
      fail(path, error.code === "23505"
        ? "This company already exists for this client. Pick it from the matches to add a contact to it."
        : explain(error));
    }
    accountId = data.id;
  }

  if (campaignId) {
    await supabase
      .from("account_campaigns")
      .upsert({ account_id: accountId, campaign_id: campaignId }, { ignoreDuplicates: true });
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      client_id: clientId,
      account_id: accountId,
      campaign_id: campaignId,
      name: contactName,
      designation: str(fd, "designation"),
      buying_role: str(fd, "buying_role") ?? "Unknown",
      linkedin_url: linkedin,
      email,
      phone,
      location: str(fd, "location"),
      client_note: str(fd, "client_note"),
      internal_note: str(fd, "internal_note"),
      custom: contactCustom.values,
    })
    .select("id")
    .single();
  if (error) fail(path, explain(error));

  revalidatePath("/sheet");
  redirect(`/contacts/${contact.id}`);
}

const CONTACT_FIELDS = [
  "name", "designation", "department", "seniority", "buying_role", "linkedin_url", "email", "phone",
  "location", "contact_status", "prospect_status", "client_note", "internal_note",
];

export async function updateContact(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "contact_id")!;
  const path = `/contacts/${id}`;
  // Locked fields are rendered disabled, so they are simply absent from the submission.
  const patch: Record<string, string | null> = {};
  for (const k of CONTACT_FIELDS) if (fd.has(k)) patch[k] = str(fd, k);
  const { error } = await supabase.from("contacts").update(patch).eq("id", id);
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=Saved`);
}

export async function logActivity(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "contact_id")!;
  const path = `/contacts/${id}`;
  const channel = str(fd, "channel") ?? "call";
  const outcome = channel === "call" ? str(fd, "outcome") : null;
  const followup = str(fd, "next_followup_date");
  if (channel === "call" && !outcome) fail(path, "Select a call outcome.");
  if (outcome === "Callback Requested" && !followup) fail(path, "Set a follow-up date for a callback.");

  const { data: c, error: readError } = await supabase
    .from("contacts")
    .select("client_id, account_id, campaign_id, prospect_status")
    .eq("id", id)
    .single();
  if (readError) fail(path, explain(readError));

  const { error } = await supabase.from("activities").insert({
    client_id: c.client_id,
    account_id: c.account_id,
    contact_id: id,
    campaign_id: c.campaign_id,
    activity_date: str(fd, "activity_date") ?? undefined,
    channel,
    outcome,
    client_note: str(fd, "client_note"),
    internal_note: str(fd, "internal_note"),
    next_action: str(fd, "next_action"),
    next_followup_date: followup,
  });
  if (error) fail(path, explain(error));

  const status = str(fd, "new_status");
  if (status && status !== c.prospect_status) {
    const { error: e } = await supabase.from("contacts").update({ prospect_status: status }).eq("id", id);
    if (e) fail(path, explain(e));
  }
  revalidatePath(path);
  redirect(`${path}?ok=Activity logged`);
}

export async function completeFollowup(fd: FormData) {
  const supabase = await createClient();
  const back = str(fd, "back") ?? "/followups";
  const { error } = await supabase
    .from("followups")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", str(fd, "id")!);
  if (error) fail(back, explain(error));
  revalidatePath(back);
  redirect(back);
}

export async function requestEdit(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "contact_id")!;
  const path = `/contacts/${id}`;
  const reason = str(fd, "reason");
  const field = str(fd, "field");
  if (!field || !reason) fail(path, "Choose a field and give a reason for the correction.");
  const { error } = await supabase.from("edit_requests").insert({
    table_name: "contacts",
    record_id: id,
    field,
    current_value: str(fd, `current_${field}`),
    requested_value: str(fd, "requested_value"),
    reason,
  });
  if (error) fail(path, explain(error));
  redirect(`${path}?ok=Edit request sent to Admin`);
}

// ------------------------------------------------------------------ meetings
export async function bookMeeting(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "contact_id")!;
  const path = `/contacts/${id}`;
  const when = str(fd, "scheduled_at");
  if (!when) fail(path, "Meeting date and time are required.");
  const { data: c, error: readError } = await supabase
    .from("contacts")
    .select("client_id, account_id, campaign_id")
    .eq("id", id)
    .single();
  if (readError) fail(path, explain(readError));
  const { error } = await supabase.from("meetings").insert({
    client_id: c.client_id,
    account_id: c.account_id,
    campaign_id: c.campaign_id,
    contact_id: id,
    scheduled_at: istToIso(when),
    status: str(fd, "status") ?? "Booked",
    mode_or_link: str(fd, "mode_or_link"),
    client_attendees: str(fd, "client_attendees"),
  });
  if (error) fail(path, explain(error));
  revalidatePath("/meetings");
  redirect(`${path}?ok=Meeting saved`);
}

export async function updateMeeting(fd: FormData) {
  const supabase = await createClient();
  const path = "/meetings";
  const patch: Record<string, string | null> = {
    status: str(fd, "status"),
    qualification_notes: str(fd, "qualification_notes"),
    mode_or_link: str(fd, "mode_or_link"),
    client_attendees: str(fd, "client_attendees"),
  };
  const when = str(fd, "scheduled_at");
  if (when) patch.scheduled_at = istToIso(when);
  const { error } = await supabase.from("meetings").update(patch).eq("id", str(fd, "id")!);
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=Meeting updated`);
}

export async function decideHqm(fd: FormData) {
  const supabase = await createClient();
  const path = "/meetings";
  const { error } = await supabase
    .from("meetings")
    .update({
      hqm_status: str(fd, "hqm_status") ?? "pending",
      client_confirmed_by: str(fd, "client_confirmed_by"),
      credit_reason: str(fd, "credit_reason"),
      existing_opportunity: fd.get("existing_opportunity") === "on",
    })
    .eq("id", str(fd, "id")!);
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=HQM decision saved`);
}

// ------------------------------------------------------------------ admin
export async function saveClient(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "id");
  const path = id ? `/admin/clients/${id}` : "/admin/clients";
  const row = {
    name: str(fd, "name"),
    website: str(fd, "website"),
    industry: str(fd, "industry"),
    geography: str(fd, "geography"),
    start_date: str(fd, "start_date"),
    engagement_model: str(fd, "engagement_model"),
    primary_contacts: str(fd, "primary_contacts"),
    status: str(fd, "status") ?? "active",
  };
  if (!row.name) fail(path, "Client name is required.");
  if (id) {
    const { error } = await supabase.from("clients").update(row).eq("id", id);
    if (error) fail(path, explain(error));
    revalidatePath(path);
    redirect(`${path}?ok=Client saved`);
  }
  const { data, error } = await supabase.from("clients").insert(row).select("id").single();
  if (error) fail(path, explain(error));
  redirect(`/admin/clients/${data.id}?ok=Client created`);
}

export async function saveCampaign(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "id");
  const clientId = str(fd, "client_id")!;
  const path = `/admin/clients/${clientId}`;
  const row = {
    client_id: clientId,
    name: str(fd, "name"),
    objective: str(fd, "objective"),
    target_industries: str(fd, "target_industries"),
    target_locations: str(fd, "target_locations"),
    start_date: str(fd, "start_date"),
    end_date: str(fd, "end_date"),
    status: str(fd, "status") ?? "active",
    monthly_meeting_target: Number(str(fd, "monthly_meeting_target") ?? 0),
    payout_rate: Number(str(fd, "payout_rate") ?? 0),
    payout_threshold: Number(str(fd, "payout_threshold") ?? 0),
    collateral_links: str(fd, "collateral_links"),
  };
  if (!row.name) fail(path, "Campaign name is required.");
  const { error } = id
    ? await supabase.from("campaigns").update(row).eq("id", id)
    : await supabase.from("campaigns").insert(row);
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=Campaign saved`);
}

export async function setClientSdrs(fd: FormData) {
  const supabase = await createClient();
  const clientId = str(fd, "client_id")!;
  const path = `/admin/clients/${clientId}`;
  const wanted = new Set(fd.getAll("sdr_id").map(String));
  const { data: existing, error: readError } = await supabase
    .from("client_sdrs")
    .select("id, sdr_id")
    .eq("client_id", clientId);
  if (readError) fail(path, explain(readError));
  const have = new Set((existing ?? []).map((r) => r.sdr_id as string));
  const remove = (existing ?? []).filter((r) => !wanted.has(r.sdr_id)).map((r) => r.id);
  const add = [...wanted].filter((s) => !have.has(s)).map((sdr_id) => ({ client_id: clientId, sdr_id }));
  if (remove.length) {
    const { error } = await supabase.from("client_sdrs").delete().in("id", remove);
    if (error) fail(path, explain(error));
  }
  if (add.length) {
    const { error } = await supabase.from("client_sdrs").insert(add);
    if (error) fail(path, explain(error));
  }
  revalidatePath(path);
  redirect(`${path}?ok=SDR assignments saved`);
}

export async function updateUser(fd: FormData) {
  const supabase = await createClient();
  const path = "/admin/users";
  const role = str(fd, "role");
  const clientId = str(fd, "client_id");
  const isClient = role === "client_admin" || role === "client_viewer";
  if (isClient && !clientId) fail(path, "Choose which client this user belongs to.");
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: str(fd, "full_name") ?? "",
      role,
      client_id: isClient ? clientId : null,
      is_active: fd.get("is_active") === "on" && !!role,
    })
    .eq("id", str(fd, "id")!);
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=User saved`);
}
