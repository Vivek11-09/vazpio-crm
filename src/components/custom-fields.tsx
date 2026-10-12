import { Field, input } from "@/components/ui";
import { type CustomValues, type FieldDef, isEmpty, optionList } from "@/lib/custom";

// Renders a campaign's custom fields for one object. With lockFilled (SDR after save), fields that
// already hold a value are shown disabled and are not submitted.
export function CustomFieldInputs({
  defs,
  object,
  values = {},
  lockFilled = false,
}: {
  defs: FieldDef[];
  object: FieldDef["object"];
  values?: CustomValues;
  lockFilled?: boolean;
}) {
  const fields = defs.filter((d) => d.object === object && d.is_active).sort((a, b) => a.display_order - b.display_order);
  if (!fields.length) return null;
  return (
    <>
      {fields.map((d) => {
        const name = `cf_${object}_${d.key}`;
        const current = values[d.key] ?? d.default_value ?? "";
        const locked = lockFilled && !isEmpty(values[d.key]);
        const label = `${d.label}${d.is_required ? " *" : ""}${locked ? " (locked)" : ""}`;
        const cls = `${input} disabled:bg-slate-50 disabled:text-slate-500`;
        const common = { name, disabled: locked, required: d.is_required && d.field_type !== "multi_select", className: cls };
        return (
          <Field key={d.id} label={label} group={d.field_type === "multi_select"} className={d.field_type === "long_text" ? "sm:col-span-2" : ""}>
            {!locked && <input type="hidden" name="cf__keys" value={`${object}.${d.key}`} />}
            {d.field_type === "long_text" ? (
              <textarea {...common} rows={2} defaultValue={String(current)} />
            ) : d.field_type === "number" ? (
              <input {...common} type="number" step="any" defaultValue={String(current)} />
            ) : d.field_type === "date" ? (
              <input {...common} type="date" defaultValue={String(current)} />
            ) : d.field_type === "yes_no" ? (
              <select {...common} defaultValue={String(current)}>
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            ) : d.field_type === "dropdown" ? (
              <select {...common} defaultValue={String(current)}>
                <option value="">Select</option>
                {optionList(d).map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : d.field_type === "multi_select" ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                {optionList(d).map((o) => (
                  <label key={o} className="flex items-center gap-1 text-sm font-normal text-slate-700">
                    <input type="checkbox" name={name} value={o} disabled={locked}
                      defaultChecked={Array.isArray(values[d.key]) && (values[d.key] as string[]).includes(o)} />
                    {o}
                  </label>
                ))}
              </span>
            ) : (
              <input {...common} defaultValue={String(current)} />
            )}
            {d.help_text && <span className="mt-1 block font-normal text-slate-400">{d.help_text}</span>}
          </Field>
        );
      })}
    </>
  );
}
