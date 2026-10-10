export type { Contract, Field } from "./input/schema.js";
import type { Contract } from "./input/schema.js";
import type { Diagnostic } from "../support/diagnostics.js";
// Internal only. Generators receive validated models, never YAML or unresolved input.
export interface IR extends Contract {
  indexes: {
    entities: ReadonlyMap<string, Contract["entities"][number]>;
    relationships: ReadonlyMap<string, Contract["relationships"][number]>;
    machines: ReadonlyMap<string, Contract["stateMachines"][number]>;
    commands: ReadonlyMap<string, Contract["commands"][number]>;
    rules: ReadonlyMap<string, Contract["rules"][number]>;
    constraints: ReadonlyMap<string, Contract["constraints"][number]>;
  };
  warnings: {
    code: Diagnostic["code"];
    elementId: string | null;
    message: string;
  }[];
}
