import { requireAdmin } from "@/lib/auth";
import { Card, Field, Notice, PageHeader, btnGhost, first, input, type SearchParams } from "@/components/ui";
import { ImportForm } from "./import-form";

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: clients }, { data: campaigns }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, client_id").order("name"),
  ]);

  return (
    <>
      <PageHeader title="Import and export" sub="Bring in a legacy calling sheet or a prepared Excel/CSV file, or export a client's data for backup." />
      <Notice error={first(sp.error)} ok={first(sp.ok)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ImportForm clients={clients ?? []} campaigns={campaigns ?? []} />

        <div className="space-y-4">
          <Card title="File format">
            <p className="text-sm text-slate-600">
              The existing Google Sheet layout works as it is: Date, Prospect, LinkedIn Link, Designation, Location, Email,
              Contact, Status, Owner, Notes, Next Follow-up Date, Follow-up Alert.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Rows for the same company are grouped under one account.</li>
              <li>Owner is matched to a user by name; unmatched rows are assigned to you.</li>
              <li>Text typed into the follow-up columns is kept as notes.</li>
              <li>Contacts that already exist (same email, phone or LinkedIn) are skipped.</li>
            </ul>
            <a href="/import-template.csv" download className={`${btnGhost} mt-3`}>Download template</a>
          </Card>

          <Card title="Export (Admin only)">
            <form action="/admin/export" method="get" className="space-y-3">
              <Field label="Client">
                <select name="client" required className={input} defaultValue="">
                  <option value="" disabled>Select client</option>
                  {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <button className={btnGhost}>Download calling sheet (CSV)</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
