import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { testLinks } from "./extensions/test-links.js";
import { database } from "./extensions/database.js";
import { review } from "./review.js";
import { context, contextKinds, type ContextKind } from "./context.js";
import { compile } from "./validate.js";
import { generate } from "./generators/index.js";
import { checkOutputs, writeOutputs } from "./output.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
export interface Result {
  exitCode: number;
  diagnostics: Diagnostic[];
  report?: string;
}
export async function run(args: string[]): Promise<Result> {
  const fail = (message: string): Result => ({
    exitCode: 3,
    diagnostics: [diagnostic("CLI_INVALID", message)],
  });
  const command = args[0];
  if (!["validate", "generate", "check", "review", "context", "test-links", "db-check"].includes(command ?? ""))
    return fail(
      "Usage: cca validate|generate|check|review|context|test-links|db-check --input FILE [--out DIR] [--before FILE] [--kind KIND --id ID] [--links FILE --root DIR --results FILE] [--db FILE] [--warnings-as-errors] [--format text|json]",
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
    if (!["--input", "--out", "--format", "--before", "--kind", "--id", "--links", "--root", "--results", "--db"].includes(arg))
      return fail(`Unknown option: ${arg}`);
    if (opts.has(arg)) return fail(`Duplicate option: ${arg}`);
    const value = args[++i];
    if (!value || value.startsWith("--"))
      return fail(`Missing value for ${arg}`);
    opts.set(arg, value);
  }
  if (!opts.has("--input") || (["generate", "check"].includes(command!) && !opts.has("--out")))
    return fail("Explicit --input and (for generate/check) --out are required");
  const extras: Record<string, string[]> = {
    validate: [], generate: ["--out"], check: ["--out"], review: ["--before"],
    context: ["--kind", "--id"], "test-links": ["--links", "--root", "--results"], "db-check": ["--db"],
  };
  const allowed = new Set(["--input", "--format", ...extras[command!]!]);
  for (const key of opts.keys()) if (!allowed.has(key)) return fail(`${command} does not accept ${key}`);
  if (command === "review" && !opts.has("--before")) return fail("review requires --before FILE");
  if (command === "context" && (!opts.has("--id") || !contextKinds.includes(opts.get("--kind") as ContextKind))) return fail(`context requires --id ID and --kind ${contextKinds.join("|")}`);
  if (command === "test-links" && (!opts.has("--links") || !opts.has("--root"))) return fail("test-links requires --links FILE and --root DIR");
  if (command === "db-check" && !opts.has("--db")) return fail("db-check requires --db FILE");
  if (!["text", "json"].includes(opts.get("--format") ?? "text"))
    return fail("Invalid --format; expected text|json");
  try {
    const input = resolve(opts.get("--input")!),
      { ir, diagnostics } = compile(await readFile(input, "utf8"), input);
    if (!ir || (strict && diagnostics.some((d) => d.severity === "warning")))
      return { exitCode: 1, diagnostics };
    if (command === "validate") return { exitCode: 0, diagnostics };
    if (command === "review") {
      const beforePath = resolve(opts.get("--before")!);
      const before = compile(await readFile(beforePath, "utf8"), beforePath);
      const all = [...before.diagnostics, ...diagnostics];
      if (!before.ir || (strict && all.some((d) => d.severity === "warning"))) return { exitCode: 1, diagnostics: all };
      return { exitCode: 0, diagnostics: all, report: review(before.ir, ir) };
    }
    if (command === "context") {
      const report = context(ir, opts.get("--kind") as ContextKind, opts.get("--id")!);
      if (!report) return { exitCode: 1, diagnostics: [...diagnostics, { ...diagnostic("REF_NOT_FOUND", `Unknown ${opts.get("--kind")}: ${opts.get("--id")}`), elementId: opts.get("--id")! }] };
      return { exitCode: 0, diagnostics, report };
    }
    if (command === "test-links" || command === "db-check") {
      const file = resolve(opts.get(command === "test-links" ? "--links" : "--db")!);
      const companion = await readFile(file, "utf8");
      const resultPath = opts.has("--results") ? resolve(opts.get("--results")!) : undefined;
      const evidence = resultPath ? { file: resultPath, input: await readFile(resultPath, "utf8") } : undefined;
      const extension = command === "test-links"
        ? await testLinks(ir, companion, file, resolve(opts.get("--root")!), evidence)
        : database(ir, companion, file);
      const all = [...diagnostics, ...extension.diagnostics];
      const invalid = all.some((d) => d.severity === "error" || (strict && d.severity === "warning"));
      return { exitCode: invalid ? 1 : 0, diagnostics: all, ...(invalid ? {} : { report: extension.report }) };
    }
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
    process.stdout.write(JSON.stringify(["review", "context", "test-links", "db-check"].includes(args[0] ?? "") ? { diagnostics: result.diagnostics, report: result.report ?? null } : result.diagnostics, null, 2) + "\n");
  else {
    for (const d of result.diagnostics)
      process.stdout.write(
        `${d.severity} ${d.code}${d.elementId ? ` [${d.elementId}]` : ""}${d.path ? ` ${d.path}:${d.line ?? "?"}:${d.column ?? "?"}` : ""}: ${d.message}\n`,
      );
    if (result.report) process.stdout.write(result.report);
    else if (result.exitCode === 0) process.stdout.write("OK\n");
  }
  process.exitCode = result.exitCode;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
