import { compile } from "../contract/compile.js";
import type { IR } from "../contract/model.js";
import type { Diagnostic } from "../support/diagnostics.js";
import type { Ports } from "./ports.js";
import { hasWarnings, type Result } from "./result.js";
export type Loaded = { ir: IR; diagnostics: Diagnostic[] };
export async function load(path: string, strict: boolean, ports: Ports): Promise<Loaded | Result> {
  const file = ports.resolvePath(path);
  const compiled = compile(await ports.readText(file), file);
  if (!compiled.ir || (strict && hasWarnings(compiled.diagnostics))) return { exitCode: 1, diagnostics: compiled.diagnostics };
  return { ir: compiled.ir, diagnostics: compiled.diagnostics };
}
