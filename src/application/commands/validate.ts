import type { Loaded } from "../load.js";
import type { Result } from "../result.js";
export function validate(loaded: Loaded): Result {
  return { exitCode: 0, diagnostics: loaded.diagnostics };
}
