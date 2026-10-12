"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export type NavGroup = { title?: string; links: { href: string; label: string }[] };

// Sidebar / top-bar links with the current section highlighted.
export function NavLinks({ groups, orientation }: { groups: NavGroup[]; orientation: "side" | "top" }) {
  const pathname = usePathname();
  const isActive = (href: string) => !href.startsWith("#") && (pathname === href || pathname.startsWith(`${href}/`));
  if (orientation === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto text-sm font-medium">
        {groups.flatMap((g) => g.links).map((l) => (
          <Link key={l.href} href={l.href}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 ${isActive(l.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-5 text-sm">
      {groups.map((g, i) => (
        <div key={g.title ?? i}>
          {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</div>}
          <ul className="space-y-0.5">
            {g.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
                  className={`block rounded-md px-3 py-1.5 font-medium ${isActive(l.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// A GET filter form that applies as soon as a dropdown, checkbox or date changes.
export function FilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        const instant = t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && ["checkbox", "date", "month"].includes(t.type));
        if (instant) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

// Long notes are clipped to two lines in tables; click to read the rest.
export function ExpandableText({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  if (text.length < 90) return <span>{text}</span>;
  return (
    <button type="button" onClick={() => setOpen(!open)} title={open ? "Show less" : "Show all"}
      className={`block w-full text-left ${open ? "" : "line-clamp-2"}`}>
      {text}
    </button>
  );
}

// Removes ?ok= / ?error= from the address bar so a refresh or shared link does not repeat the message.
export function ClearFlash() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("ok") && !url.searchParams.has("error")) return;
    url.searchParams.delete("ok");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  }, []);
  return null;
}

// Submit button that disables itself and shows progress while its form is saving.
export function SubmitButton({ children, className, busy = "Saving…", ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} disabled={pending || rest.disabled} className={className}>
      {pending ? busy : children}
    </button>
  );
}
