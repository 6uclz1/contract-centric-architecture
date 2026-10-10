import type { Contract, IR } from "./model.js";
import { ascii } from "../support/order.js";
import type { Diagnostic } from "../support/diagnostics.js";
const ids = <T extends { id: string }>(v: T[]): T[] =>
  v.sort((a, b) => ascii(a.id, b.id));
export function normalize(input: Contract, diagnostics: Diagnostic[] = []): IR {
  const c = structuredClone(input);
  ids(c.entities).forEach((e) =>
    ids(e.fields).forEach((f) => {
      if (f.type === "enum") f.values.sort(ascii);
    }),
  );
  ids(c.relationships);
  ids(c.rules);
  ids(c.constraints).forEach((con) => con.fields.sort(ascii));
  ids(c.stateMachines).forEach((m) => {
    m.states.sort(ascii);
    ids(m.transitions);
  });
  ids(c.commands).forEach((cmd) => {
    cmd.preconditions.sort(ascii);
    cmd.postconditions.sort(ascii);
    ids(cmd.effects);
  });
  const index = <T extends { id: string }>(v: T[]) =>
    new Map(v.map((item) => [item.id, item]));
  return {
    ...c,
    indexes: {
      entities: index(c.entities),
      relationships: index(c.relationships),
      machines: index(c.stateMachines),
      commands: index(c.commands),
      rules: index(c.rules),
      constraints: index(c.constraints),
    },
    warnings: diagnostics
      .filter((d) => d.severity === "warning")
      .map(({ code, elementId, message }) => ({ code, elementId, message }))
      .sort(
        (a, b) =>
          ascii(a.code, b.code) ||
          ascii(a.elementId ?? "", b.elementId ?? "") ||
          ascii(a.message, b.message),
      ),
  };
}
