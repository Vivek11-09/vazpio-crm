import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  ["last_activity_date", "Date"], ["prospect", "Prospect"], ["contact_name", "Contact Name"],
  ["linkedin_url", "LinkedIn Link"], ["designation", "Designation"], ["location", "Location"],
  ["email", "Email"], ["phone", "Contact"], ["status", "Status"], ["owner_name", "Owner"],
  ["client_note", "Notes"], ["internal_note", "Internal Notes"], ["last_outcome", "Last Call Outcome"],
  ["last_note", "Last Call Note"], ["call_count", "Calls"], ["next_followup_date", "Next Follow-up Date"],
  ["followup_alert", "Follow-up Alert"],
] as const;

// Leading =, +, - or @ would be run as a formula by Excel, so those cells are prefixed with a quote.
const cell = (v: unknown) => {
  const s = String(v ?? "");
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

// Admin/Manager backup export of one client's calling sheet. SDR and client roles get 403.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Sign in first.", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, is_active").eq("id", auth.user.id).maybeSingle();
  if (!me?.is_active || (me.role !== "super_admin" && me.role !== "manager")) {
    return new NextResponse("Only an Admin or Manager can export data.", { status: 403 });
  }
  const clientId = request.nextUrl.searchParams.get("client");
  if (!clientId) return new NextResponse("Choose a client.", { status: 400 });

  const lines = [COLUMNS.map(([, h]) => cell(h)).join(",")];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("calling_sheet").select("*").eq("client_id", clientId)
      .order("prospect").order("contact_id").range(from, from + 999);
    if (error) return new NextResponse(error.message, { status: 500 });
    for (const r of data) lines.push(COLUMNS.map(([k]) => cell(r[k])).join(","));
    if (data.length < 1000) break;
  }
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
  const name = (client?.name ?? "client").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-calling-sheet.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
