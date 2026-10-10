import type { Contract } from "../model.js";
import { SourceMap } from "../../support/source-map.js";
import { stableDiagnostics, type Diagnostic } from "../../support/diagnostics.js";
import { validationContext } from "./context.js";
import { identifiers } from "./identifiers.js";
import { relationships } from "./relationships.js";
import { machines } from "./machines.js";
import { rules } from "./rules.js";
import { constraints } from "./constraints.js";
export function validateContract(c: Contract, source = new SourceMap("contract.yaml")): Diagnostic[] {
  const context = validationContext(c, source);
  identifiers(context);
  // Duplicated namespaces cannot be resolved safely; do not cascade reference diagnostics.
  if (context.d.length) return stableDiagnostics(context.d);
  relationships(context);
  machines(context);
  rules(context);
  constraints(context);
  return stableDiagnostics(context.d);
}
