import type { IR } from "./ir.js";
import { generateCatalog } from "./generators/catalog.js";
import { finish } from "./generators/common.js";

export const contextKinds = ["entity", "relationship", "machine", "command", "rule", "constraint"] as const;
export type ContextKind = (typeof contextKinds)[number];

// One-hop neighborhood: include referenced definitions in full, never invent edges.
export function context(ir: IR, kind: ContextKind, id: string): string | undefined {
  const indexes = { entity: ir.indexes.entities, relationship: ir.indexes.relationships,
    machine: ir.indexes.machines, command: ir.indexes.commands,
    rule: ir.indexes.rules, constraint: ir.indexes.constraints };
  if (!indexes[kind].has(id)) return undefined;
  const selected = { entity: new Set<string>(), relationship: new Set<string>(),
    machine: new Set<string>(), command: new Set<string>(), rule: new Set<string>(), constraint: new Set<string>() };
  selected[kind].add(id);
  // Inbound references to the root only (no recursive expansion across the model).
  if (kind === "entity") {
    ir.relationships.filter((r) => r.from === id || r.to === id).forEach((r) => selected.relationship.add(r.id));
    ir.stateMachines.filter((m) => m.entity === id).forEach((m) => selected.machine.add(m.id));
    ir.commands.filter((c) => c.target === id).forEach((c) => selected.command.add(c.id));
    ir.constraints.filter((c) => c.entity === id).forEach((c) => selected.constraint.add(c.id));
  }
  if (kind === "command") ir.stateMachines.filter((m) => m.transitions.some((t) => t.command === id)).forEach((m) => selected.machine.add(m.id));
  if (kind === "rule") ir.commands.filter((c) => [...c.preconditions, ...c.postconditions].includes(id)).forEach((c) => selected.command.add(c.id));
  if (kind === "entity" || kind === "relationship") ir.rules.filter((r) => r.scope.kind === kind && r.scope.id === id).forEach((r) => selected.rule.add(r.id));
  // Complete references of selected definitions. Iterate to closure, but do not
  // expand inbound references again; neighbors' unrelated commands stay excluded.
  let size = -1;
  const total = () => Object.values(selected).reduce((n, ids) => n + ids.size, 0);
  while (size !== total()) {
    size = total();
    for (const r of ir.relationships.filter((r) => selected.relationship.has(r.id))) {
      selected.entity.add(r.from); selected.entity.add(r.to);
    }
    for (const c of ir.commands.filter((c) => selected.command.has(c.id))) {
      selected.entity.add(c.target);
      [...c.preconditions, ...c.postconditions].forEach((r) => selected.rule.add(r));
    }
    for (const m of ir.stateMachines.filter((m) => selected.machine.has(m.id))) {
      selected.entity.add(m.entity);
      m.transitions.forEach((t) => selected.command.add(t.command));
    }
    for (const r of ir.rules.filter((r) => selected.rule.has(r.id))) selected[r.scope.kind].add(r.scope.id);
    for (const c of ir.constraints.filter((c) => selected.constraint.has(c.id))) selected.entity.add(c.entity);
    for (const e of ir.entities.filter((e) => selected.entity.has(e.id))) {
      for (const f of e.fields) if (f.type === "state") selected.machine.add(f.machine);
    }
  }
  const filtered: IR = { ...ir,
    entities: ir.entities.filter((v) => selected.entity.has(v.id)),
    relationships: ir.relationships.filter((v) => selected.relationship.has(v.id)),
    stateMachines: ir.stateMachines.filter((v) => selected.machine.has(v.id)),
    commands: ir.commands.filter((v) => selected.command.has(v.id)),
    rules: ir.rules.filter((v) => selected.rule.has(v.id)),
    constraints: ir.constraints.filter((v) => selected.constraint.has(v.id)),
  };
  return finish(["# Local Contract context", "", `Root: ${kind} ${id}`, "", "Selection: inbound references to the root, then complete outbound reference closure. Full definitions are retained; this is a reading aid, not a standalone Contract or public IR. Neighboring elements' inbound references are not expanded. Warnings below describe the full validated Contract.", "", "Rule prose declares requirements; it is not executable. Business correctness, implementation compliance and DB enforcement are not guaranteed.", "", generateCatalog(filtered)]);
}
