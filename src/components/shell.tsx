import Link from "next/link";
import { signOut } from "@/app/actions";
import { NavLinks, type NavGroup } from "@/components/client-bits";
import { Logo } from "@/components/logo";

function Account({ who }: { who: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="truncate">{who}</span>
      <form action={signOut}>
        <button className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50">Sign out</button>
      </form>
    </div>
  );
}

// Staff get a sidebar on wide screens; the client portal (and phones) get a single top bar.
export function Shell({
  groups,
  who,
  variant = "side",
  children,
}: {
  groups: NavGroup[];
  who: string;
  variant?: "side" | "top";
  children: React.ReactNode;
}) {
  const brand = <Link href="/" aria-label="Vazpio home" className="inline-flex shrink-0 items-center"><Logo height={36} priority /></Link>;
  if (variant === "top") {
    return (
      <>
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            {brand}
            <div className="min-w-0 flex-1"><NavLinks groups={groups} orientation="top" /></div>
            <Account who={who} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5">{children}</main>
      </>
    );
  }
  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto p-4">
          <div>
            {brand}
            <div className="mt-1 text-xs text-slate-400">Growth, handled.</div>
          </div>
          <div className="flex-1"><NavLinks groups={groups} orientation="side" /></div>
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 truncate text-xs text-slate-500">{who}</div>
            <form action={signOut}>
              <button className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          {brand}
          <Account who={who} />
        </div>
        <div className="mt-2"><NavLinks groups={groups} orientation="top" /></div>
      </header>
      <main className="min-w-0 flex-1 px-4 py-5 lg:px-6">{children}</main>
    </div>
  );
}
