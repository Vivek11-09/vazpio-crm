import { requireAdmin } from "@/lib/auth";
import { SubmitButton } from "@/components/client-bits";
import { updateUser } from "@/app/actions";
import { Notice, PageHeader, btnGhost, first, input, td, th, type SearchParams } from "@/components/ui";

const ROLES = [
  ["super_admin", "Super Admin"],
  ["manager", "Manager"],
  ["sdr", "SDR"],
  ["client_admin", "Client Admin"],
  ["client_viewer", "Client Viewer"],
];

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireAdmin();
  const [{ data: users, error }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("*").order("is_active").order("full_name"),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        sub="People sign up on the login page, then appear here for you to assign a role and activate."
      />
      <Notice error={error?.message ?? first(sp.error)} ok={first(sp.ok)} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>{["Name", "Email", "Role", "Client (portal users)", "Active", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users?.map((u) => {
              const form = `user-${u.id}`;
              return (
                <tr key={u.id} className={u.is_active ? "" : "bg-amber-50/50"}>
                  <td className={td}>
                    <form id={form} action={updateUser}>
                      <input type="hidden" name="id" value={u.id} />
                    </form>
                    <input form={form} name="full_name" defaultValue={u.full_name} className={input} aria-label="Name" />
                  </td>
                  <td className={`${td} text-slate-600`}>{u.email}</td>
                  <td className={td}>
                    <select form={form} name="role" defaultValue={u.role ?? ""} className={input} aria-label="Role">
                      <option value="">Not assigned</option>
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <select form={form} name="client_id" defaultValue={u.client_id ?? ""} className={input} aria-label="Client">
                      <option value="">None</option>
                      {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <input form={form} type="checkbox" name="is_active" defaultChecked={u.is_active} aria-label="Active"
                      disabled={u.id === profile.id} />
                    {u.id === profile.id && <input form={form} type="hidden" name="is_active" value="on" />}
                  </td>
                  <td className={td}><SubmitButton form={form} className={btnGhost}>Save</SubmitButton></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Deactivating a user blocks their access but keeps their name on every record they created.
      </p>
    </>
  );
}
