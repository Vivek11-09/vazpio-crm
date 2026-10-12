import { isAdminRole, requireStaff } from "@/lib/auth";
import { Shell } from "@/components/shell";
import type { NavGroup } from "@/components/client-bits";

const ROLE_LABEL: Record<string, string> = { super_admin: "Super Admin", manager: "Manager", sdr: "SDR" };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const admin = isAdminRole(profile.role);
  const groups: NavGroup[] = [
    {
      title: "Work",
      links: [
        { href: "/sheet", label: "Calling Sheet" },
        { href: "/followups", label: "Follow-ups" },
        { href: "/meetings", label: "Meetings" },
        { href: "/dashboard", label: "Dashboard" },
        ...(admin ? [] : [{ href: "/payouts", label: "My payouts" }]),
      ],
    },
  ];
  if (admin) {
    groups.push(
      {
        title: "Manage",
        links: [
          { href: "/admin/clients", label: "Clients" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/requests", label: "Edit requests" },
          { href: "/admin/import", label: "Import / Export" },
        ],
      },
      {
        title: "Finance",
        links: [
          { href: "/admin/payouts", label: "SDR payouts" },
          { href: "/admin/profitability", label: "Profitability" },
        ],
      },
      {
        title: "System",
        links: [
          { href: "/admin/settings", label: "Statuses" },
          { href: "/admin/audit", label: "Audit log" },
        ],
      },
    );
  }
  return (
    <Shell groups={groups} who={`${profile.full_name} · ${ROLE_LABEL[profile.role ?? ""] ?? ""}`}>
      {children}
    </Shell>
  );
}
