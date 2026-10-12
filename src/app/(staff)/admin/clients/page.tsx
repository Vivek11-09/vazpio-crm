import Link from "next/link";
import { SubmitButton } from "@/components/client-bits";
import { requireAdmin } from "@/lib/auth";
import { saveClient } from "@/app/actions";
import { Card, Field, Notice, PageHeader, btn, first, input, td, th, type SearchParams } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, industry, status, campaigns(count), client_sdrs(count)")
    .order("name");

  return (
    <>
      <PageHeader title="Clients" sub="Each client has its own campaigns, SDR team and read-only portal." />
      <Notice error={error?.message ?? first(sp.error)} ok={first(sp.ok)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>{["Client", "Industry", "Campaigns", "SDRs", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients?.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} font-medium`}>
                    <Link prefetch={false} href={`/admin/clients/${c.id}`} className="text-indigo-700 hover:underline">{c.name}</Link>
                  </td>
                  <td className={td}>{c.industry}</td>
                  <td className={`${td} tabular-nums`}>{(c.campaigns as { count: number }[])[0]?.count ?? 0}</td>
                  <td className={`${td} tabular-nums`}>{(c.client_sdrs as { count: number }[])[0]?.count ?? 0}</td>
                  <td className={td}>{c.status}</td>
                </tr>
              ))}
              {!clients?.length && (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">No clients yet. Add the first one.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Card title="Add client">
          <form action={saveClient} className="space-y-3">
            <Field label="Client name *"><input name="name" required className={input} /></Field>
            <Field label="Website"><input name="website" className={input} /></Field>
            <Field label="Industry"><input name="industry" className={input} /></Field>
            <Field label="Geography"><input name="geography" className={input} /></Field>
            <SubmitButton className={btn}>Create client</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
