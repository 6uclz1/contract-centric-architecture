import { contractSchema } from "./schema.js";
import type { Contract } from "../model.js";
import { parseInput } from "../../support/input/parse.js";
import { SourceMap } from "../../support/source-map.js";
import type { Diagnostic } from "../../support/diagnostics.js";
export interface Parsed {
  contract?: Contract;
  source: SourceMap;
  diagnostics: Diagnostic[];
}
export function parseContract(input: string, file = "contract.yaml"): Parsed {
  const parsed = parseInput(input, file, contractSchema, "cca.dev/v1alpha1");
  const { source, diagnostics, value: contract } = parsed;
  if (!contract) return { source, diagnostics };
  for (const kind of [
    "entities",
    "relationships",
    "stateMachines",
    "commands",
    "rules",
    "constraints",
  ] as const)
    contract[kind].forEach((v, i) => {
      source.bind(kind, v.id, [kind, i]);
      if (kind === "entities")
        contract.entities[i]!.fields.forEach((f, j) =>
          source.bind("fields", `${v.id}.${f.id}`, [kind, i, "fields", j]),
        );
      if (kind === "stateMachines")
        contract.stateMachines[i]!.states.forEach((s, j) =>
          source.bind("states", `${v.id}.${s}`, [kind, i, "states", j]),
        );
      if (kind === "stateMachines")
        contract.stateMachines[i]!.transitions.forEach((t, j) =>
          source.bind("transitions", t.id, [kind, i, "transitions", j]),
        );
      if (kind === "commands")
        contract.commands[i]!.effects.forEach((e, j) =>
          source.bind("effects", `${v.id}.${e.id}`, [kind, i, "effects", j]),
        );
    });
  return { contract, source, diagnostics: [] };
}
