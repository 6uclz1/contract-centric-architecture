import { z } from "zod";
import { lstat, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { text as displayText } from "../schema.js";
import type { IR } from "../ir.js";
import { parseInput } from "../parser.js";
import { ascii, stableDiagnostics, type Diagnostic } from "../diagnostics.js";
import { md, finish } from "../generators/common.js";
import { collector, duplicates } from "./common.js";
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const text = displayText.min(1);
export const testLinksSchema = z.strictObject({
  apiVersion: z.literal("cca.dev/test-links/v1alpha1"),
  tests: z.array(z.strictObject({ id, file: text, title: text })),
  links: z.array(z.strictObject({ rule: id, tests: z.array(id).min(1) })),
});
export type TestLinks = z.infer<typeof testLinksSchema>;
// Only the documented Vitest JSON projection is consumed. Runner metadata
// outside testResults/name/assertionResults/fullName/status is not interpreted.
const resultsSchema = z.object({
  testResults: z.array(z.object({
    name: text,
    assertionResults: z.array(z.object({
      fullName: text,
      status: z.enum(["passed", "failed", "pending", "todo", "skipped", "disabled"]),
    })),
  })),
});
export interface ExtensionResult { diagnostics: Diagnostic[]; report?: string }
export async function testLinks(
  ir: IR, input: string, file: string, root: string,
  results?: { input: string; file: string },
): Promise<ExtensionResult> {
  const parsed = parseInput(input, file, testLinksSchema, "cca.dev/test-links/v1alpha1");
  if (!parsed.value) return { diagnostics: parsed.diagnostics };
  const manifest = parsed.value, diagnostics: Diagnostic[] = [];
  const add = collector(parsed.source, diagnostics);
  duplicates(manifest.tests, (v) => v.id, (i, key) => add("ID_DUPLICATE", `Duplicate test ID: ${key}`, ["tests", i, "id"], key));
  duplicates(manifest.tests, (v) => JSON.stringify([v.file, v.title]), (i, key) => add("ID_DUPLICATE", `Duplicate test file/title: ${key}`, ["tests", i, "title"], manifest.tests[i]!.id));
  duplicates(manifest.links, (v) => v.rule, (i, key) => add("ID_DUPLICATE", `Duplicate Rule link: ${key}`, ["links", i, "rule"], key));
  const tests = new Map(manifest.tests.map((t) => [t.id, t]));
  const linked = new Set<string>(), ruleLinks = new Map<string, string[]>();
  manifest.links.forEach((link, i) => {
    if (!ir.indexes.rules.has(link.rule)) add("REF_NOT_FOUND", `Unknown Rule: ${link.rule}`, ["links", i, "rule"], link.rule);
    ruleLinks.set(link.rule, link.tests);
    duplicates(link.tests, (v) => v, (j, key) => add("ID_DUPLICATE", `Duplicate test reference: ${key}`, ["links", i, "tests", j], link.rule));
    link.tests.forEach((test, j) => {
      if (!tests.has(test)) add("REF_NOT_FOUND", `Unknown test: ${test}`, ["links", i, "tests", j], link.rule);
      linked.add(test);
    });
  });
  for (const r of ir.rules) if (!ruleLinks.has(r.id)) add("RULE_TEST_UNLINKED", `Rule has no declared test link: ${r.id}`, [], r.id, "warning");
  manifest.tests.forEach((t, i) => {
    if (!linked.has(t.id)) add("TEST_UNLINKED", `Test is not linked to a Rule: ${t.id}`, ["tests", i, "id"], t.id, "warning");
  });
  const rootPath = await realpath(root);
  if (!(await stat(rootPath)).isDirectory()) throw new Error("Test root must be a directory");
  const files = new Map<string, string>();
  for (const [i, t] of manifest.tests.entries()) {
    const p = resolve(rootPath, t.file);
    const inside = (target: string) => { const r = relative(rootPath, target); return r !== ".." && !r.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(r); };
    if (isAbsolute(t.file) || !inside(p)) { add("TEST_FILE_INVALID", "Test file must be relative and inside --root", ["tests", i, "file"], t.id); continue; }
    try {
      const actual = await realpath(p);
      if (!inside(actual) || !(await lstat(actual)).isFile()) { add("TEST_FILE_INVALID", "Test file must resolve to a regular file inside --root", ["tests", i, "file"], t.id); continue; }
      files.set(t.id, actual);
    } catch (e) {
      if (!["ENOENT", "ENOTDIR", "ELOOP"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
      add("TEST_FILE_INVALID", `Test file unavailable: ${t.file}`, ["tests", i, "file"], t.id);
    }
  }
  const identities = new Set<string>();
  manifest.tests.forEach((t, i) => {
    if (!files.has(t.id)) return;
    const key = JSON.stringify([files.get(t.id), t.title]);
    if (identities.has(key)) add("ID_DUPLICATE", "Multiple test IDs resolve to the same file/full title", ["tests", i, "file"], t.id);
    identities.add(key);
  });
  const statuses = new Map<string, string>();
  if (results) {
    let raw: unknown;
    try { raw = JSON.parse(results.input); } catch {
      return { diagnostics: [...diagnostics, { code: "SCHEMA_INVALID", severity: "error", message: "Invalid Vitest JSON results", elementId: null, path: results.file, line: null, column: null }] };
    }
    const checked = resultsSchema.safeParse(raw);
    if (!checked.success) return { diagnostics: [...diagnostics, { code: "SCHEMA_INVALID", severity: "error", message: checked.error.message, elementId: null, path: results.file, line: null, column: null }] };
    const records = new Map<string, string[]>();
    for (const suite of checked.data.testResults) {
      let path = resolve(rootPath, suite.name);
      try { path = await realpath(path); } catch { /* Missing files will not match a validated manifest file. */ }
      for (const assertion of suite.assertionResults) {
        const key = JSON.stringify([path, assertion.fullName]);
        records.set(key, [...(records.get(key) ?? []), assertion.status]);
      }
    }
    manifest.tests.forEach((t, i) => {
      if (!files.has(t.id)) return;
      const matches = records.get(JSON.stringify([files.get(t.id), t.title]));
      if (!matches || matches.length !== 1) add("TEST_RESULT_MISSING", `Expected one result for ${t.file} / ${t.title}; found ${matches?.length ?? 0}`, ["tests", i, "title"], t.id);
      else {
        statuses.set(t.id, matches[0]!);
        if (matches[0] !== "passed") add("TEST_NOT_PASSED", `Reported test status: ${matches[0]}`, ["tests", i, "title"], t.id);
      }
    });
  }
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics: stableDiagnostics(diagnostics) };
  const lines = ["# Rule / test traceability", "", "Links are explicit declarations. File existence is checked; titles are verified only when --results is supplied. Linked or passing tests do not establish Rule correctness or evaluate Rule prose.", "", results ? "Execution evidence: supplied Vitest JSON. Freshness and correspondence to this Contract revision are not verified; this command does not run tests." : "Execution evidence: not supplied; test execution and title existence are unverified.", "", "| Rule | Kind / scope | Tests |", "| --- | --- | --- |"];
  for (const r of ir.rules) lines.push(`| ${r.id} | ${r.kind} / ${r.scope.kind} ${r.scope.id} | ${(ruleLinks.get(r.id) ?? []).sort(ascii).join(", ") || "— (unlinked)"} |`);
  lines.push("", "## Declared tests", "", "| ID | File | Full title | Status |", "| --- | --- | --- | --- |");
  for (const t of [...manifest.tests].sort((a, b) => ascii(a.id, b.id))) lines.push(`| ${t.id} | ${md(t.file)} | ${md(t.title)} | ${statuses.get(t.id) ?? "not verified"} |`);
  return { diagnostics: stableDiagnostics(diagnostics), report: finish(lines) };
}
