import type { Result } from "../application/result.js";
export function formatResult(args: string[], result: Result): string {
  const formatIndex = args.indexOf("--format");
  if (formatIndex >= 0 && args[formatIndex + 1] === "json")
    return JSON.stringify(["review", "context", "test-links", "db-check"].includes(args[0] ?? "") ? { diagnostics: result.diagnostics, report: result.report ?? null } : result.diagnostics, null, 2) + "\n";
  let text = result.diagnostics.map((d) => `${d.severity} ${d.code}${d.elementId ? ` [${d.elementId}]` : ""}${d.path ? ` ${d.path}:${d.line ?? "?"}:${d.column ?? "?"}` : ""}: ${d.message}\n`).join("");
  if (result.report) text += result.report;
  else if (result.exitCode === 0) text += "OK\n";
  return text;
}
