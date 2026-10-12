export type FieldDef = {
  id: string;
  campaign_id: string;
  object: "account" | "contact" | "meeting";
  key: string;
  label: string;
  field_type: "short_text" | "long_text" | "number" | "yes_no" | "date" | "dropdown" | "multi_select";
  options: string | null;
  help_text: string | null;
  default_value: string | null;
  is_required: boolean;
  is_active: boolean;
  client_visible: boolean;
  reportable: boolean;
  display_order: number;
};

export type CustomValues = Record<string, string | number | string[] | null>;

export const FIELD_TYPES: [FieldDef["field_type"], string][] = [
  ["short_text", "Short text"],
  ["long_text", "Long text"],
  ["number", "Number"],
  ["yes_no", "Yes / No"],
  ["date", "Date"],
  ["dropdown", "Dropdown"],
  ["multi_select", "Multi-select"],
];

export const optionList = (d: FieldDef) =>
  (d.options ?? "").split(",").map((o) => o.trim()).filter(Boolean);

export const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

export const slugKey = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

// Reads the campaign fields a form actually rendered (each one announces itself in "cf__keys"),
// so locked fields that were shown disabled are left untouched.
export function readCustom(fd: FormData, defs: FieldDef[], object: FieldDef["object"], existing: CustomValues = {}) {
  const shown = new Set(fd.getAll("cf__keys").map(String));
  const values: CustomValues = { ...existing };
  for (const d of defs) {
    if (d.object !== object || !d.is_active || !shown.has(`${object}.${d.key}`)) continue;
    const name = `cf_${object}_${d.key}`;
    const raw = fd.get(name);
    const text = typeof raw === "string" ? raw.trim() : "";
    let value: CustomValues[string];
    if (d.field_type === "multi_select") value = fd.getAll(name).map(String);
    else if (d.field_type === "number") value = text === "" || Number.isNaN(Number(text)) ? null : Number(text);
    else value = text === "" ? null : text;
    if (d.is_required && isEmpty(value)) return { error: `"${d.label}" is required.` };
    values[d.key] = value;
  }
  return { values };
}

export function showValue(v: unknown) {
  if (isEmpty(v)) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}
