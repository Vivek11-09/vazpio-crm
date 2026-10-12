import { isAdminRole, requireStaff } from "@/lib/auth";
import type { FieldDef } from "@/lib/custom";
import { Notice, PageHeader, first, type SearchParams } from "@/components/ui";
import { ProspectForm } from "./prospect-form";

export default async function NewProspectPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const [{ data: clients }, { data: campaigns }, { data: fields }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("status", "active").order("name"),
    supabase.from("campaigns").select("id, name, client_id").eq("status", "active").order("name"),
    supabase.from("custom_fields").select("*").eq("is_active", true).in("object", ["account", "contact"]),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add prospect" sub="The company is checked against existing accounts for the client as you type." />
      <Notice error={first(sp.error)} />
      <ProspectForm clients={clients ?? []} campaigns={campaigns ?? []} defaultClient={first(sp.client)}
        fields={(fields ?? []) as FieldDef[]} isAdmin={isAdminRole(profile.role)} />
    </div>
  );
}
