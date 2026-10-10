import { generate } from "../../presentation/outputs.js";
import { diagnostic } from "../../support/diagnostics.js";
import type { Loaded } from "../load.js";
import type { Ports } from "../ports.js";
import type { Request } from "../request.js";
import type { Result } from "../result.js";
export async function outputs(request: Extract<Request, { command: "generate" | "check" }>, loaded: Loaded, ports: Ports): Promise<Result> {
  let generated;
  try { generated = generate(loaded.ir); }
  catch (e) { return { exitCode: 3, diagnostics: [...loaded.diagnostics, diagnostic("GENERATION_ERROR", String(e))] }; }
  const out = ports.resolvePath(request.out);
  const differences = request.command === "check" ? await ports.checkOutputs(out, generated) : await ports.writeOutputs(out, generated);
  const operational = differences.some((d) => ["OUTPUT_SYMLINK", "IO_ERROR"].includes(d.code)) || (request.command === "generate" && differences.length > 0);
  return { exitCode: operational ? 3 : differences.length ? 2 : 0, diagnostics: [...loaded.diagnostics, ...differences] };
}
