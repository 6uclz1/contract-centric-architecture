import type { ValidationContext } from "./context.js";
export function identifiers(context: ValidationContext): void {
  const { c, add, duplicate } = context;
  for (const k of [
    "entities",
    "relationships",
    "stateMachines",
    "commands",
    "rules",
    "constraints",
  ] as const)
    duplicate(c[k], [k]);
  c.entities.forEach((e, i) => duplicate(e.fields, ["entities", i, "fields"]));
  c.commands.forEach((cmd, i) =>
    duplicate(cmd.effects, ["commands", i, "effects"]),
  );
  const transitions = new Set<string>();
  c.stateMachines.forEach((m, i) =>
    m.transitions.forEach((t, j) => {
      if (transitions.has(t.id))
        add(
          "ID_DUPLICATE",
          `Duplicate transition ID: ${t.id}`,
          ["stateMachines", i, "transitions", j, "id"],
          t.id,
        );
      transitions.add(t.id);
    }),
  );
}
