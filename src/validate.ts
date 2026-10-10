import type { Contract } from "./schema.js";
import { SourceMap, parseContract } from "./parser.js";
import {
  stableDiagnostics,
  type Code,
  type Diagnostic,
} from "./diagnostics.js";
import { normalize } from "./normalize.js";
export function validateContract(
  c: Contract,
  source = new SourceMap("contract.yaml"),
): Diagnostic[] {
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
  // Duplicated namespaces cannot be resolved safely; do not cascade reference diagnostics.
  if (d.length) return stableDiagnostics(d);
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
  c.relationships.forEach((r, i) => {
    ref(entities, r.from, ["relationships", i, "from"], r.id, "Entity");
    ref(entities, r.to, ["relationships", i, "to"], r.id, "Entity");
  });
  c.entities.forEach((e, i) =>
    e.fields.forEach((f, j) => {
      if (f.type !== "state") return;
      const m = ref(
        machines,
        f.machine,
        ["entities", i, "fields", j, "machine"],
        e.id,
        "Machine",
      );
      if (m && (m.entity !== e.id || m.field !== f.id || !f.required))
        add(
          "MACHINE_BINDING_INVALID",
          `State field ${e.id}.${f.id} must be required and mutually bound to ${m.id}`,
          ["entities", i, "fields", j, "machine"],
          e.id,
        );
    }),
  );
  const bound = new Set<string>();
  c.stateMachines.forEach((m, i) => {
    const p = ["stateMachines", i] as (string | number)[];
    const e = ref(entities, m.entity, [...p, "entity"], m.id, "Entity");
    if (bound.has(m.entity))
      add(
        "MACHINE_BINDING_INVALID",
        `Multiple machines for ${m.entity}`,
        [...p, "entity"],
        m.id,
      );
    bound.add(m.entity);
    if (e) {
      const f = e.fields.find((f) => f.id === m.field);
      if (!f)
        add(
          "FIELD_NOT_FOUND",
          `Undefined field: ${m.entity}.${m.field}`,
          [...p, "field"],
          m.id,
        );
      else if (f.type !== "state" || !f.required || f.machine !== m.id)
        add(
          "MACHINE_BINDING_INVALID",
          `Machine field must be required state bound to ${m.id}`,
          [...p, "field"],
          m.id,
        );
    }
    const states = new Set<string>();
    m.states.forEach((s, j) => {
      if (states.has(s))
        add(
          "STATE_INVALID",
          `Duplicate state: ${s}`,
          [...p, "states", j],
          m.id,
        );
      states.add(s);
    });
    if (!states.has(m.initial))
      add(
        "STATE_INVALID",
        `Undefined initial state: ${m.initial}`,
        [...p, "initial"],
        m.id,
      );
    const keys = new Set<string>();
    m.transitions.forEach((t, j) => {
      const tp = [...p, "transitions", j];
      for (const side of ["from", "to"] as const)
        if (!states.has(t[side]))
          add(
            "STATE_INVALID",
            `Undefined ${side} state: ${t[side]}`,
            [...tp, side],
            t.id,
          );
      const cmd = ref(commands, t.command, [...tp, "command"], t.id, "Command");
      if (cmd && cmd.target !== m.entity)
        add(
          "COMMAND_TARGET_MISMATCH",
          `Command ${cmd.id} targets ${cmd.target}, machine targets ${m.entity}`,
          [...tp, "command"],
          t.id,
        );
      const key = JSON.stringify([t.from, t.command]);
      if (keys.has(key))
        add(
          "TRANSITION_AMBIGUOUS",
          `Multiple transitions from ${t.from} with ${t.command}`,
          [...tp, "command"],
          t.id,
        );
      keys.add(key);
    });
    if (
      states.has(m.initial) &&
      m.transitions.every((t) => states.has(t.from) && states.has(t.to))
    ) {
      const reached = new Set([m.initial]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of m.transitions)
          if (reached.has(t.from) && !reached.has(t.to)) {
            reached.add(t.to);
            changed = true;
          }
      }
      m.states.forEach((s, j) => {
        if (!reached.has(s))
          add(
            "STATE_UNREACHABLE",
            `State ${s} is unreachable in ${m.id} (ignoring Rules)`,
            [...p, "states", j],
            `${m.id}.${s}`,
            "warning",
          );
      });
    }
  });
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
  return stableDiagnostics(d);
}
export function compile(input: string, file = "contract.yaml") {
  const parsed = parseContract(input, file);
  if (!parsed.contract)
    return { diagnostics: parsed.diagnostics, source: parsed.source };
  const diagnostics = validateContract(parsed.contract, parsed.source);
  return {
    diagnostics,
    source: parsed.source,
    ir: diagnostics.some((d) => d.severity === "error")
      ? undefined
      : normalize(parsed.contract, diagnostics),
  };
}
