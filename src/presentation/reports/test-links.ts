import type { IR } from "../../contract/model.js";
import type { TestLinks } from "../../features/test-links/schema.js";
import { ascii } from "../../support/order.js";
import { md, finish } from "../markdown.js";
export function renderTestLinks(ir: IR, manifest: TestLinks, ruleLinks: ReadonlyMap<string, string[]>, statuses: ReadonlyMap<string, string>, hasResults: boolean): string {
  const lines = ["# Rule / test traceability", "", "Links are explicit declarations. File existence is checked; titles are verified only when --results is supplied. Linked or passing tests do not establish Rule correctness or evaluate Rule prose.", "", hasResults ? "Execution evidence: supplied Vitest JSON. Freshness and correspondence to this Contract revision are not verified; this command does not run tests." : "Execution evidence: not supplied; test execution and title existence are unverified.", "", "| Rule | Kind / scope | Tests |", "| --- | --- | --- |"];
  for (const r of ir.rules) lines.push(`| ${r.id} | ${r.kind} / ${r.scope.kind} ${r.scope.id} | ${(ruleLinks.get(r.id) ?? []).sort(ascii).join(", ") || "— (unlinked)"} |`);
  lines.push("", "## Declared tests", "", "| ID | File | Full title | Status |", "| --- | --- | --- | --- |");
  for (const t of [...manifest.tests].sort((a, b) => ascii(a.id, b.id))) lines.push(`| ${t.id} | ${md(t.file)} | ${md(t.title)} | ${statuses.get(t.id) ?? "not verified"} |`);
  return finish(lines);
}
