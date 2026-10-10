import { contextKinds, type Request } from "../application/request.js";
import type { ContextKind } from "../application/request.js";
import type { Result } from "../application/result.js";
import { diagnostic } from "../support/diagnostics.js";
export function parseArgs(args: string[]): Request | Result {
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
  const base = { input: opts.get("--input")!, strict, format: (opts.get("--format") ?? "text") as "text" | "json" };
  switch (command) {
    case "validate": return { ...base, command };
    case "generate": case "check": return { ...base, command, out: opts.get("--out")! };
    case "review": return { ...base, command, before: opts.get("--before")! };
    case "context": return { ...base, command, kind: opts.get("--kind") as ContextKind, id: opts.get("--id")! };
    case "test-links": return { ...base, command, links: opts.get("--links")!, root: opts.get("--root")!, ...(opts.has("--results") ? { results: opts.get("--results")! } : {}) };
    case "db-check": return { ...base, command, db: opts.get("--db")! };
    default: return fail("Unknown command");
  }
}
