import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "super_admin" | "manager" | "sdr" | "client_admin" | "client_viewer";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role | null;
  client_id: string | null;
  is_active: boolean;
};

export const isAdminRole = (r: Role | null) => r === "super_admin" || r === "manager";
export const isClientRole = (r: Role | null) => r === "client_admin" || r === "client_viewer";

// One database round trip per request, shared by the layout and the page (React cache).
// The user id is read from the access token and the profile is fetched with that same token:
// the database verifies the token's signature, so a tampered token returns an error, not a profile.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  let userId: string;
  try {
    userId = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()).sub;
  } catch {
    redirect("/login");
  }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) redirect("/login");
  const profile = data as Profile | null;
  if (!profile || !profile.is_active || !profile.role) redirect("/pending");
  return { supabase, user: { id: userId }, profile };
});

// These only decide which screens to show. The database enforces the same rules on the data.
export async function requireStaff() {
  const session = await getSession();
  if (isClientRole(session.profile.role)) redirect("/portal");
  return session;
}

export async function requireAdmin() {
  const session = await requireStaff();
  if (!isAdminRole(session.profile.role)) redirect("/sheet");
  return session;
}
