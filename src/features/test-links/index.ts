import type { IR } from "../../contract/model.js";
import type { SourceMap } from "../../support/source-map.js";
import type { Diagnostic } from "../../support/diagnostics.js";
import { collector, duplicates } from "../../support/validation.js";
import type { TestLinks } from "./schema.js";
export interface LinkDeclarations { diagnostics: Diagnostic[]; ruleLinks: Map<string, string[]> }
export function validateDeclarations(ir: IR, manifest: TestLinks, source: SourceMap): LinkDeclarations {
  const diagnostics: Diagnostic[] = [];
  const add = collector(source, diagnostics);
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
  return { diagnostics, ruleLinks };
}

export function validateIdentities(manifest: TestLinks, files: ReadonlyMap<string, string>, source: SourceMap, diagnostics: Diagnostic[]): void {
  const add = collector(source, diagnostics);
  const identities = new Set<string>();
  manifest.tests.forEach((t, i) => {
    if (!files.has(t.id)) return;
    const key = JSON.stringify([files.get(t.id), t.title]);
    if (identities.has(key)) add("ID_DUPLICATE", "Multiple test IDs resolve to the same file/full title", ["tests", i, "file"], t.id);
    identities.add(key);
  });
}

export function matchResults(manifest: TestLinks, files: ReadonlyMap<string, string>, records: ReadonlyMap<string, readonly string[]>, source: SourceMap, diagnostics: Diagnostic[]): Map<string, string> {
  const add = collector(source, diagnostics), statuses = new Map<string, string>();
  manifest.tests.forEach((t, i) => {
    if (!files.has(t.id)) return;
    const matches = records.get(JSON.stringify([files.get(t.id), t.title]));
    if (!matches || matches.length !== 1) add("TEST_RESULT_MISSING", `Expected one result for ${t.file} / ${t.title}; found ${matches?.length ?? 0}`, ["tests", i, "title"], t.id);
    else {
      statuses.set(t.id, matches[0]!);
      if (matches[0] !== "passed") add("TEST_NOT_PASSED", `Reported test status: ${matches[0]}`, ["tests", i, "title"], t.id);
    }
  });
  return statuses;
}
