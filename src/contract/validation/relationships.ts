import type { ValidationContext } from "./context.js";
export function relationships(context: ValidationContext): void {
  const { c, ref, entities } = context;
  c.relationships.forEach((r, i) => {
    ref(entities, r.from, ["relationships", i, "from"], r.id, "Entity");
    ref(entities, r.to, ["relationships", i, "to"], r.id, "Entity");
  });
}
