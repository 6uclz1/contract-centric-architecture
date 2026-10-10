import { parseContract } from "./input/parse.js";
import { validateContract } from "./validation/index.js";
import { normalize } from "./normalize.js";
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
