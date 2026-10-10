import type { ValidationContext } from "./context.js";
export function machines(context: ValidationContext): void {
  const { c, add, ref, entities, machines, commands } = context;
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
}
