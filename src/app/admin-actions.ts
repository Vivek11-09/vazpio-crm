"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { explain, fail, str } from "@/lib/action-utils";
import { slugKey } from "@/lib/custom";
import { type ImportRow, parseSheet } from "@/lib/import-parse";

// ------------------------------------------------------------------ custom fields
export async function saveCustomField(fd: FormData) {
  const supabase = await createClient();
  const id = str(fd, "id");
  const clientId = str(fd, "client_id")!;
  const path = `/admin/clients/${clientId}`;
  const label = str(fd, "label");
  if (!label) fail(path, "Field name is required.");
  const row = {
    label,
    field_type: str(fd, "field_type") ?? "short_text",
    options: str(fd, "options"),
    help_text: str(fd, "help_text"),
    default_value: str(fd, "default_value"),
    display_order: Number(str(fd, "display_order") ?? 0),
    is_required: fd.get("is_required") === "on",
    is_active: id ? fd.get("is_active") === "on" : true,
    client_visible: fd.get("client_visible") === "on",
    reportable: fd.get("reportable") === "on",
  };
  if ((row.field_type === "dropdown" || row.field_type === "multi_select") && !row.options) {
    fail(path, "Dropdown and multi-select fields need a comma-separated list of options.");
  }
  // The key and object never change after creation, so saved values are never orphaned.
  const { error } = id
    ? await supabase.from("custom_fields").update(row).eq("id", id)
    : await supabase.from("custom_fields").insert({
        ...row,
        campaign_id: str(fd, "campaign_id"),
        object: str(fd, "object") ?? "contact",
        key: slugKey(label),
      });
  if (error) fail(path, error.code === "23505" ? "This campaign already has a field with that name." : explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=Field saved`);
}

// ------------------------------------------------------------------ statuses and call outcomes
export async function saveLookup(fd: FormData) {
  const supabase = await createClient();
  const path = "/admin/settings";
  const table = str(fd, "table") === "call_outcomes" ? "call_outcomes" : "prospect_statuses";
  const value = str(fd, "value");
  if (!value) fail(path, "Enter a value.");
  const row: Record<string, string | number | boolean> = {
    value,
    sort: Number(str(fd, "sort") ?? 0),
    is_active: fd.get("is_active") === "on",
  };
  if (table === "call_outcomes") row.is_connected = fd.get("is_connected") === "on";
  const { error } = await supabase.from(table).upsert(row, { onConflict: "value" });
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=Saved`);
}

// ------------------------------------------------------------------ payouts
export async function computePayouts(fd: FormData) {
  const supabase = await createClient();
  const month = str(fd, "month")!;
  const path = `/admin/payouts?month=${month}`;
  const { error } = await supabase.rpc("compute_payouts", { p_month: `${month}-01` });
  if (error) fail(path, explain(error));
  revalidatePath("/admin/payouts");
  redirect(`${path}&ok=Draft payouts recalculated`);
}

export async function updatePayout(fd: FormData) {
  const supabase = await createClient();
  const path = `/admin/payouts?month=${str(fd, "month")}`;
  const adjustment = Number(str(fd, "adjustment") ?? 0);
  const reason = str(fd, "adjustment_reason");
  if (adjustment !== 0 && !reason) fail(path, "An adjustment needs a reason.");
  const { error } = await supabase
    .from("payout_runs")
    .update({
      adjustment,
      adjustment_reason: reason,
      deduction: Number(str(fd, "deduction") ?? 0),
      status: str(fd, "status") ?? "draft",
    })
    .eq("id", str(fd, "id")!);
  if (error) fail(path, explain(error));
  revalidatePath("/admin/payouts");
  redirect(`${path}&ok=Payout saved`);
}

// ------------------------------------------------------------------ profitability
export async function saveFinancials(fd: FormData) {
  const supabase = await createClient();
  const month = str(fd, "month")!;
  const path = `/admin/profitability?month=${month}`;
  const { error } = await supabase.from("client_financials").upsert(
    {
      client_id: str(fd, "client_id"),
      month: `${month}-01`,
      revenue: Number(str(fd, "revenue") ?? 0),
      tool_cost: Number(str(fd, "tool_cost") ?? 0),
      other_cost: Number(str(fd, "other_cost") ?? 0),
      note: str(fd, "note"),
    },
    { onConflict: "client_id,month" },
  );
  if (error) fail(path, explain(error));
  revalidatePath("/admin/profitability");
  redirect(`${path}&ok=Saved`);
}

// ------------------------------------------------------------------ edit requests
export async function decideEditRequest(fd: FormData) {
  const supabase = await createClient();
  const path = "/admin/requests";
  const approve = str(fd, "decision") === "approve";
  const { error } = await supabase.rpc("decide_edit_request", { p_id: str(fd, "id"), p_approve: approve });
  if (error) fail(path, explain(error));
  revalidatePath(path);
  redirect(`${path}?ok=${approve ? "Correction applied" : "Request rejected"}`);
}

// ------------------------------------------------------------------ import
export type ImportPreview = {
  error?: string;
  clientId?: string;
  campaignId?: string | null;
  fileName?: string;
  rows?: ImportRow[];
  result?: { imported: number; accounts_created: number; skipped: { row: number; prospect?: string; reason: string }[] };
};

// Step 1: read the file and run every check without saving anything.
export async function previewImport(_prev: ImportPreview, fd: FormData): Promise<ImportPreview> {
  const supabase = await createClient();
  const clientId = str(fd, "client_id");
  const campaignId = str(fd, "campaign_id");
  const file = fd.get("file");
  if (!clientId) return { error: "Select a client." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel (.xlsx) or CSV file." };
  let rows: ImportRow[];
  try {
    rows = await parseSheet(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the file." };
  }
  if (!rows.length) return { error: "No data rows were found under the header row." };
  const { data, error } = await supabase.rpc("import_prospects", {
    p_client: clientId, p_campaign: campaignId, p_rows: rows, p_commit: false,
  });
  if (error) return { error: explain(error) };
  return { clientId, campaignId, fileName: file.name, rows, result: data };
}

// Step 2: save exactly the rows that were checked.
export async function commitImport(fd: FormData) {
  const supabase = await createClient();
  const path = "/admin/import";
  let rows: ImportRow[];
  try {
    rows = JSON.parse(String(fd.get("rows")));
  } catch {
    fail(path, "The checked rows were lost. Upload the file again.");
  }
  const { data, error } = await supabase.rpc("import_prospects", {
    p_client: str(fd, "client_id"), p_campaign: str(fd, "campaign_id"), p_rows: rows, p_commit: true,
  });
  if (error) fail(path, explain(error));
  revalidatePath("/sheet");
  redirect(`${path}?ok=${encodeURIComponent(`Imported ${data.imported} prospects into ${data.accounts_created} new accounts. ${data.skipped.length} rows skipped.`)}`);
}
