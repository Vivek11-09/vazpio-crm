// All date logic uses India time, matching public.today_ist() in the database.
const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function todayIST(): string {
  return iso(new Date(Date.now() + 5.5 * 3600000));
}

export const RANGES = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom range"],
] as const;

export function resolveRange(range?: string, from?: string, to?: string) {
  const today = todayIST();
  const t = new Date(`${today}T00:00:00Z`);
  const shift = (days: number) => iso(new Date(t.getTime() + days * DAY));
  const mondayOffset = -((t.getUTCDay() + 6) % 7);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  switch (range) {
    case "today":
      return { range, from: today, to: today };
    case "yesterday":
      return { range, from: shift(-1), to: shift(-1) };
    case "this_week":
      return { range, from: shift(mondayOffset), to: today };
    case "last_week":
      return { range, from: shift(mondayOffset - 7), to: shift(mondayOffset - 1) };
    case "last_month":
      return { range, from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "custom":
      if (from && to) return { range, from, to };
  }
  return { range: "this_month", from: iso(new Date(Date.UTC(y, m, 1))), to: today };
}

export function fmtDate(d?: string | null) {
  if (!d) return "";
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateTime(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}
