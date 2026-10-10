import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "./validate.js";
import { generate } from "./generators/index.js";
import { checkOutputs, writeOutputs } from "./output.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
export interface Result {
  exitCode: number;
  diagnostics: Diagnostic[];
}
export async function run(args: string[]): Promise<Result> {
  const fail = (message: string): Result => ({
    exitCode: 3,
    diagnostics: [diagnostic("CLI_INVALID", message)],
  });
  const command = args[0];
  if (!["validate", "generate", "check"].includes(command ?? ""))
    return fail(
      "Usage: cca validate|generate|check --input FILE [--out DIR] [--warnings-as-errors] [--format text|json]",
    );
  const opts = new Map<string, string>();
  let strict = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--warnings-as-errors") {
      if (strict) return fail(`Duplicate option ${arg}`);
      strict = true;
      continue;
    }
    if (!["--input", "--out", "--format"].includes(arg))
      return fail(`Unknown option: ${arg}`);
    if (opts.has(arg)) return fail(`Duplicate option: ${arg}`);
    const value = args[++i];
    if (!value || value.startsWith("--"))
      return fail(`Missing value for ${arg}`);
    opts.set(arg, value);
  }
  if (!opts.has("--input") || (command !== "validate" && !opts.has("--out")))
    return fail("Explicit --input and (for generate/check) --out are required");
  if (command === "validate" && opts.has("--out"))
    return fail("validate does not accept --out");
  if (!["text", "json"].includes(opts.get("--format") ?? "text"))
    return fail("Invalid --format; expected text|json");
  try {
    const input = resolve(opts.get("--input")!),
      { ir, diagnostics } = compile(await readFile(input, "utf8"), input);
    if (!ir || (strict && diagnostics.some((d) => d.severity === "warning")))
      return { exitCode: 1, diagnostics };
    if (command === "validate") return { exitCode: 0, diagnostics };
    let outputs;
    try {
      outputs = generate(ir);
    } catch (e) {
      return {
        exitCode: 3,
        diagnostics: [
          ...diagnostics,
          diagnostic("GENERATION_ERROR", String(e)),
        ],
      };
    }
    const out = resolve(opts.get("--out")!);
    const differences =
      command === "check"
        ? await checkOutputs(out, outputs)
        : await writeOutputs(out, outputs);
    const operational =
      differences.some((d) =>
        ["OUTPUT_SYMLINK", "IO_ERROR"].includes(d.code),
      ) ||
      (command === "generate" && differences.length > 0);
    return {
      exitCode: operational ? 3 : differences.length ? 2 : 0,
      diagnostics: [...diagnostics, ...differences],
    };
  } catch (e) {
    return {
      exitCode: 3,
      diagnostics: [
        diagnostic("IO_ERROR", e instanceof Error ? e.message : String(e)),
      ],
    };
  }
}
async function main() {
  const args = process.argv.slice(2),
    result = await run(args);
  const formatIndex = args.indexOf("--format");
  if (formatIndex >= 0 && args[formatIndex + 1] === "json")
    process.stdout.write(JSON.stringify(result.diagnostics, null, 2) + "\n");
  else {
    for (const d of result.diagnostics)
      process.stdout.write(
        `${d.severity} ${d.code}${d.elementId ? ` [${d.elementId}]` : ""}${d.path ? ` ${d.path}:${d.line ?? "?"}:${d.column ?? "?"}` : ""}: ${d.message}\n`,
      );
    if (result.exitCode === 0) process.stdout.write("OK\n");
  }
  process.exitCode = result.exitCode;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
