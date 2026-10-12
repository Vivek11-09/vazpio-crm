import ExcelJS from "exceljs";

export type ImportRow = {
  row: number;
  date: string | null;
  prospect: string;
  contact_name: string;
  linkedin_url: string;
  designation: string;
  location: string;
  email: string;
  phone: string;
  status: string;
  owner: string;
  notes: string;
  followup_date: string | null;
};

type Cell = { text: string; link: string; date: string | null };

// Column names accepted from the legacy Google Sheet and from the import template.
const HEADERS: Record<string, string> = {
  date: "date",
  prospect: "prospect", company: "prospect", "company name": "prospect", account: "prospect",
  "linkedin link": "linkedin", "linkedin url": "linkedin", linkedin: "linkedin",
  "contact name": "contact_name", name: "contact_name",
  designation: "designation", title: "designation",
  location: "location",
  email: "email",
  contact: "phone", phone: "phone", "contact number": "phone", mobile: "phone",
  status: "status",
  owner: "owner",
  notes: "notes", remarks: "notes",
  "next follow-up date": "followup", "next followup date": "followup", "follow-up date": "followup",
  "follow-up alert": "alert",
};

const STATUS_FIXES: Record<string, string> = { "invalid contsct": "Invalid Contact" };
const ALERT_WORDS = new Set(["", "none", "overdue", "due soon", "upcoming"]);

const iso = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);

function parseDate(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t); // day first, as used in India
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function readCell(v: ExcelJS.CellValue, isDateColumn: boolean): Cell {
  if (v == null) return { text: "", link: "", date: null };
  if (v instanceof Date) return { text: iso(v), link: "", date: iso(v) };
  if (typeof v === "number") {
    // Excel stores dates as day counts; only trust that in a date column.
    const date = isDateColumn && v > 20000 && v < 80000 ? iso(new Date(Math.round((v - 25569) * 86400000))) : null;
    return { text: Number.isInteger(v) ? String(v) : String(Math.round(v)), link: "", date };
  }
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o) return { text: (o.richText as { text: string }[]).map((r) => r.text).join("").trim(), link: "", date: null };
    if ("hyperlink" in o) {
      const inner = readCell(o.text as ExcelJS.CellValue, false);
      return { text: inner.text, link: String(o.hyperlink ?? ""), date: null };
    }
    if ("result" in o) return readCell(o.result as ExcelJS.CellValue, isDateColumn);
    if ("error" in o) return { text: "", link: "", date: null };
    return { text: "", link: "", date: null };
  }
  const text = String(v).trim();
  return { text, link: "", date: isDateColumn ? parseDate(text) : null };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const nameFromLinkedIn = (url: string) => {
  const slug = /linkedin\.com\/in\/([^/?#]+)/i.exec(url)?.[1] ?? "";
  return decodeURIComponent(slug).replace(/-[0-9a-f]{6,}$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
};

function toRows(grid: Cell[][]): ImportRow[] {
  const headerIndex = grid.findIndex((r) => r.some((c) => HEADERS[c.text.toLowerCase().trim()] === "prospect"));
  if (headerIndex < 0) throw new Error('No header row found. The file needs a "Prospect" (or "Company") column.');
  const col: Record<string, number> = {};
  grid[headerIndex].forEach((c, i) => {
    const key = HEADERS[c.text.toLowerCase().trim()];
    if (key && !(key in col)) col[key] = i;
  });
  const get = (r: Cell[], key: string): Cell => (key in col && r[col[key]]) || { text: "", link: "", date: null };

  const out: ImportRow[] = [];
  grid.slice(headerIndex + 1).forEach((r, i) => {
    const prospect = get(r, "prospect").text;
    const li = get(r, "linkedin");
    const isUrl = /^https?:\/\//i.test(li.text);
    const linkedin_url = li.link || (isUrl ? li.text : "");
    // In the legacy sheet the LinkedIn cell is the contact's name linked to their profile.
    const contact_name =
      get(r, "contact_name").text ||
      // Copied page titles look like "(1) Name | LinkedIn": drop the unread counter and the suffix.
      (isUrl ? nameFromLinkedIn(li.text) : li.text.replace(/\s*\|\s*linkedin.*$/i, "").replace(/^\(\d+\)\s*/, "").trim());
    if (!prospect && !contact_name && !get(r, "email").text) return; // blank line

    // SDRs often typed later call notes into the follow-up columns; keep them as notes.
    const followup = get(r, "followup");
    const alert = get(r, "alert").text;
    const notes = [
      get(r, "notes").text,
      followup.date ? "" : followup.text,
      ALERT_WORDS.has(alert.toLowerCase()) ? "" : alert,
    ].filter(Boolean).join(" | ");
    const status = get(r, "status").text;
    // A phone number typed into the Email column is kept as a second number, not as an email:
    // otherwise two people sharing that number look like the same contact.
    const rawEmail = get(r, "email").text;
    const email = rawEmail.includes("@") ? rawEmail : "";
    const phone = [get(r, "phone").text, email ? "" : rawEmail].filter(Boolean).join("/");

    out.push({
      row: headerIndex + i + 2,
      date: get(r, "date").date,
      prospect,
      contact_name,
      linkedin_url,
      designation: get(r, "designation").text,
      location: get(r, "location").text,
      email,
      phone,
      status: STATUS_FIXES[status.toLowerCase()] ?? status,
      owner: get(r, "owner").text,
      notes,
      followup_date: followup.date,
    });
  });
  return out;
}

export async function parseSheet(fileName: string, data: Buffer): Promise<ImportRow[]> {
  if (/\.csv$/i.test(fileName)) {
    const grid = parseCsv(data.toString("utf8").replace(/^﻿/, ""));
    const header = grid.find((r) => r.some((c) => HEADERS[c.toLowerCase().trim()] === "prospect")) ?? [];
    const dateCols = new Set(header.map((h, i) => (["date", "followup"].includes(HEADERS[h.toLowerCase().trim()]) ? i : -1)));
    return toRows(grid.map((r) => r.map((c, i) => ({ text: c.trim(), link: "", date: dateCols.has(i) ? parseDate(c) : null }))));
  }
  if (!/\.xlsx$/i.test(fileName)) throw new Error("Only .xlsx and .csv files are supported.");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  for (const ws of wb.worksheets) {
    const raw: ExcelJS.CellValue[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as ExcelJS.CellValue[];
      raw.push(values.slice(1));
    });
    const header = raw.find((r) => r.some((v) => HEADERS[readCell(v, false).text.toLowerCase()] === "prospect"));
    if (!header) continue; // e.g. the Dashboard tab
    const dateCols = new Set(header.map((v, i) => (["date", "followup"].includes(HEADERS[readCell(v, false).text.toLowerCase()]) ? i : -1)));
    const grid = raw.map((r) => Array.from({ length: header.length }, (_, i) => readCell(r[i], dateCols.has(i))));
    return toRows(grid);
  }
  throw new Error('No sheet with a "Prospect" (or "Company") column was found.');
}
