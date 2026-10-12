import { redirect } from "next/navigation";

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

export function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export function explain(e: { code?: string; message: string }) {
  if (e.code === "23505") return "This record already exists.";
  if (e.message.includes("row-level security")) return "You do not have permission to do that.";
  return e.message;
}

// datetime-local inputs carry no zone; the team works on India time.
export const istToIso = (v: string) => `${v.length === 16 ? `${v}:00` : v}+05:30`;
