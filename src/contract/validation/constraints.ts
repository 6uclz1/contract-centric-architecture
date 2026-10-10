import type { ValidationContext } from "./context.js";
export function constraints(context: ValidationContext): void {
  const { c, add, ref, entities } = context;
  c.constraints.forEach((con, i) => {
    const p = ["constraints", i] as (string | number)[];
    const e = ref(entities, con.entity, [...p, "entity"], con.id, "Entity"),
      seen = new Set<string>();
    con.fields.forEach((id, j) => {
      const fp = [...p, "fields", j];
      if (seen.has(id))
        add("CONSTRAINT_INVALID", `Duplicate unique field: ${id}`, fp, con.id);
      seen.add(id);
      if (!e) return;
      const f = e.fields.find((f) => f.id === id);
      if (!f)
        add("FIELD_NOT_FOUND", `Undefined field: ${e.id}.${id}`, fp, con.id);
      else if (!f.required || f.type === "state")
        add(
          "CONSTRAINT_INVALID",
          `Unique requires a required ordinary field: ${e.id}.${id}`,
          fp,
          con.id,
        );
    });
  });
}
