import type { Contract } from "../model.js";
import { SourceMap } from "../../support/source-map.js";
import type { Code, Diagnostic } from "../../support/diagnostics.js";
export function validationContext(c: Contract, source: SourceMap) {
  const d: Diagnostic[] = [];
  const add = (
    code: Code,
    message: string,
    parts: (string | number)[],
    elementId: string,
    severity: "error" | "warning" = "error",
  ) =>
    d.push({
      code,
      severity,
      message,
      elementId,
      path: source.file,
      line: null,
      column: null,
      ...source.get(parts),
    });
  const duplicate = (items: { id: string }[], parts: (string | number)[]) => {
    const seen = new Set<string>();
    items.forEach((v, i) => {
      if (seen.has(v.id))
        add("ID_DUPLICATE", `Duplicate ID: ${v.id}`, [...parts, i, "id"], v.id);
      seen.add(v.id);
    });
  };
  const entities = new Map(c.entities.map((e) => [e.id, e])),
    machines = new Map(c.stateMachines.map((m) => [m.id, m])),
    commands = new Map(c.commands.map((cmd) => [cmd.id, cmd])),
    rules = new Map(c.rules.map((r) => [r.id, r])),
    relationships = new Map(c.relationships.map((r) => [r.id, r]));
  const ref = <T>(
    map: Map<string, T>,
    id: string,
    p: (string | number)[],
    owner: string,
    kind: string,
  ): T | undefined => {
    const v = map.get(id);
    if (!v) add("REF_NOT_FOUND", `Undefined ${kind}: ${id}`, p, owner);
    return v;
  };
  return { c, source, d, add, duplicate, ref, entities, machines, commands, rules, relationships };
}
export type ValidationContext = ReturnType<typeof validationContext>;
