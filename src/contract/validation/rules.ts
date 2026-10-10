import type { ValidationContext } from "./context.js";
export function rules(context: ValidationContext): void {
  const { c, add, ref, entities, rules, relationships } = context;
  const used = new Set<string>();
  c.commands.forEach((cmd, i) => {
    ref(entities, cmd.target, ["commands", i, "target"], cmd.id, "Entity");
    for (const [list, kind] of [
      ["preconditions", "precondition"],
      ["postconditions", "postcondition"],
    ] as const) {
      const seen = new Set<string>();
      cmd[list].forEach((id, j) => {
        const p = ["commands", i, list, j];
        if (seen.has(id))
          add("ID_DUPLICATE", `Duplicate Rule reference: ${id}`, p, cmd.id);
        seen.add(id);
        const rule = ref(rules, id, p, cmd.id, "Rule");
        if (!rule) return;
        used.add(id);
        if (rule.kind !== kind)
          add(
            "RULE_KIND_MISMATCH",
            `Expected ${kind}, got ${rule.kind}: ${id}`,
            p,
            cmd.id,
          );
        if (rule.scope.kind !== "entity" || rule.scope.id !== cmd.target)
          add(
            "RULE_SCOPE_MISMATCH",
            `Rule ${id} must apply to entity ${cmd.target}`,
            p,
            cmd.id,
          );
      });
    }
  });
  c.rules.forEach((r, i) => {
    const p = ["rules", i, "scope"];
    if (r.scope.kind === "entity")
      ref(entities, r.scope.id, [...p, "id"], r.id, "Entity");
    else ref(relationships, r.scope.id, [...p, "id"], r.id, "Relationship");
    if (r.kind !== "invariant" && r.scope.kind !== "entity")
      add(
        "RULE_SCOPE_MISMATCH",
        "Pre/postconditions require entity scope",
        [...p, "kind"],
        r.id,
      );
    if (r.kind !== "invariant" && !used.has(r.id))
      add(
        "RULE_UNUSED",
        `Rule ${r.id} is not referenced by a Command`,
        ["rules", i, "id"],
        r.id,
        "warning",
      );
  });
}
