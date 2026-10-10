import { it, expect, afterEach } from "vitest";
import { readFile, writeFile, mkdtemp, rm, symlink, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { compile } from "../src/contract/compile.js";
import { database } from "../src/application/commands/database.js";
import type { DatabaseMapping } from "../src/features/database/schema.js";
import { testLinks as checkLinks } from "../src/application/commands/test-links.js";
import type { TestLinks } from "../src/features/test-links/schema.js";
import { inspectTestFiles } from "../src/adapters/filesystem/test-files.js";
import { testResults } from "../src/adapters/vitest/results.js";
import { run } from "../src/cli.js";
import { spawnSync } from "node:child_process";
const testLinks = (ir: Parameters<typeof checkLinks>[0], input: string, file: string, root: string, results?: { input: string; file: string }) => checkLinks(ir, input, file, root, { inspectTestFiles, testResults }, results);
const ir = compile(await readFile("contracts/expenses/contract.yaml", "utf8")).ir!;
const dbSource = await readFile("contracts/expenses/db-mapping.yaml", "utf8");
const db = parse(dbSource) as DatabaseMapping;
const linkSource = await readFile("contracts/expenses/test-links.yaml", "utf8");
const links = parse(linkSource) as TestLinks;
const dbCheck = (edit: (m: DatabaseMapping) => void) => {
  const model = structuredClone(db); edit(model);
  return database(ir, stringify(model), "mapping.yaml");
};
const dbCodes = (edit: (m: DatabaseMapping) => void) => dbCheck(edit).diagnostics.map((d) => d.code);
it("explicit Payment FK owner preserves original Relationship orientation", () => {
  const result = database(ir, dbSource, "mapping.yaml");
  expect(result.diagnostics).toEqual([]);
  expect(result.report).toContain("ExpensePayment | Expense → Payment | 0..1 | 1..1 | to | payments.expense_fk");
  expect(result.report).toContain("No live DB");
  expect(result.report).toContain("PaymentReceiptUnique | payments.receipt_unique");
});
it.each([
  ["type", (m: DatabaseMapping) => { m.tables[1]!.columns[1]!.type = "string"; }, "DB_TYPE_MISMATCH"],
  ["state values", (m: DatabaseMapping) => { const c = m.tables[1]!.columns[2]!; if (c.type === "enum") c.values.pop(); }, "DB_TYPE_MISMATCH"],
  ["required", (m: DatabaseMapping) => { m.tables[1]!.columns[1]!.nullable = true; }, "DB_NULLABILITY_MISMATCH"],
  ["optional FK", (m: DatabaseMapping) => { m.tables[1]!.columns[4]!.nullable = false; }, "DB_NULLABILITY_MISMATCH"],
  ["required FK", (m: DatabaseMapping) => { m.tables[1]!.columns[3]!.nullable = true; }, "DB_NULLABILITY_MISMATCH"],
  ["one-to-one unique", (m: DatabaseMapping) => { m.tables[2]!.uniqueKeys.pop(); }, "DB_CARDINALITY_MISMATCH"],
  ["many side restrictive key", (m: DatabaseMapping) => { m.tables[1]!.uniqueKeys.push({ id: "applicant_unique", columns: ["applicant_id"] }); }, "DB_CARDINALITY_MISMATCH"],
  ["owner reversal", (m: DatabaseMapping) => { m.relationships[2]!.owner = "from"; }, "DB_MAPPING_INVALID"],
  ["wrong FK endpoint", (m: DatabaseMapping) => { m.tables[2]!.foreignKeys[0]!.references.table = "users"; }, "DB_MAPPING_INVALID"],
  ["missing field", (m: DatabaseMapping) => { m.entities[0]!.fields[0]!.field = "absent"; }, "FIELD_NOT_FOUND"],
  ["missing column", (m: DatabaseMapping) => { m.entities[0]!.fields[0]!.column = "absent"; }, "DB_MAPPING_INVALID"],
  ["missing Entity", (m: DatabaseMapping) => { m.entities[0]!.entity = "Absent"; }, "REF_NOT_FOUND"],
  ["missing Relationship", (m: DatabaseMapping) => { m.relationships[0]!.relationship = "Absent"; }, "REF_NOT_FOUND"],
  ["missing Constraint", (m: DatabaseMapping) => { m.constraints[0]!.constraint = "Absent"; }, "REF_NOT_FOUND"],
  ["constraint wrong column", (m: DatabaseMapping) => { m.constraints[0]!.key = "payments_pk"; }, "DB_UNIQUE_MISSING"],
  ["constraint wrong table", (m: DatabaseMapping) => { m.constraints[0]!.table = "users"; }, "DB_MAPPING_INVALID"],
  ["constraint unmapped field", (m: DatabaseMapping) => { m.entities[2]!.fields.splice(1, 1); }, "DB_MAPPING_INVALID"],
  ["missing FK", (m: DatabaseMapping) => { m.relationships[0]!.foreignKey = "absent"; }, "DB_MAPPING_INVALID"],
  ["duplicate table", (m: DatabaseMapping) => { m.tables.push(structuredClone(m.tables[0]!)); }, "ID_DUPLICATE"],
  ["duplicate column", (m: DatabaseMapping) => { m.tables[0]!.columns.push(structuredClone(m.tables[0]!.columns[0]!)); }, "ID_DUPLICATE"],
  ["duplicate mapping", (m: DatabaseMapping) => { m.entities.push(structuredClone(m.entities[0]!)); }, "ID_DUPLICATE"],
  ["duplicate key field", (m: DatabaseMapping) => { m.tables[2]!.uniqueKeys[0]!.columns.push("receipt_number"); }, "DB_SCHEMA_INVALID"],
  ["duplicate enum", (m: DatabaseMapping) => { const c = m.tables[1]!.columns[2]!; if (c.type === "enum") c.values.push("draft"); }, "DB_SCHEMA_INVALID"],
  ["nullable PK", (m: DatabaseMapping) => { m.tables[0]!.columns[0]!.nullable = true; }, "DB_SCHEMA_INVALID"],
  ["unresolved schema FK", (m: DatabaseMapping) => { m.tables[1]!.foreignKeys[0]!.references.table = "absent"; }, "DB_SCHEMA_INVALID"],
  ["FK non-unique target", (m: DatabaseMapping) => { m.tables[1]!.foreignKeys[0]!.references.columns = ["name"]; }, "DB_SCHEMA_INVALID"],
  ["FK type mismatch", (m: DatabaseMapping) => { m.tables[1]!.columns[3]!.type = "integer"; }, "DB_SCHEMA_INVALID"],
  ["FK arity", (m: DatabaseMapping) => { m.tables[1]!.foreignKeys[0]!.columns.push("approver_id"); }, "DB_SCHEMA_INVALID"],
] as const)("DB detects %s with stable code and source position", (_, edit, code) => {
  const result = dbCheck(edit);
  const diagnostic = result.diagnostics.find((d) => d.code === code);
  expect(diagnostic).toBeDefined();
  expect(diagnostic?.path).toBe("mapping.yaml");
  expect(diagnostic?.line).toBeGreaterThan(0);
  expect(diagnostic?.column).toBeGreaterThan(0);
  expect(result.report).toBeUndefined();
});
it("schema-stage errors do not cascade into mapping diagnostics", () => {
  const codes = dbCodes((m) => { m.tables[0]!.primaryKey!.columns = ["absent"]; });
  expect(codes.length).toBeGreaterThan(0);
  expect(codes.every((c) => c === "DB_SCHEMA_INVALID")).toBe(true);
});
it("DB input collections and enum order have no report-order meaning", () => {
  const reordered = structuredClone(db);
  reordered.tables.reverse().forEach((t) => { t.columns.reverse(); t.uniqueKeys.reverse(); t.foreignKeys.reverse(); for (const c of t.columns) if (c.type === "enum") c.values.reverse(); });
  reordered.entities.reverse().forEach((e) => e.fields.reverse());
  reordered.relationships.reverse(); reordered.constraints.reverse();
  expect(database(ir, stringify(reordered), "different.yaml").report).toBe(database(ir, dbSource, "mapping.yaml").report);
});
it("DB partial mapping is explicitly warned instead of silently dropped", () => {
  const result = dbCheck((m) => { m.entities[0]!.fields.pop(); m.relationships.pop(); m.constraints = []; });
  expect(result.diagnostics.map((d) => d.code)).toEqual(["DB_UNVERIFIED", "DB_UNVERIFIED", "DB_UNVERIFIED"]);
  expect(result.report).toContain("Unmapped field: User.canApprove");
  expect(result.report).toContain("Unmapped Relationship: ExpensePayment");
  expect(result.report).toContain("Unmapped Constraint: PaymentReceiptUnique");
});
it("DB keeps state set owned by the Machine", () => {
  const c = compile(awaitSource()).ir!;
  expect(c).toBeDefined();
  function awaitSource() { const { indexes, warnings, ...contract } = structuredClone(ir); contract.stateMachines[0]!.states.push("newState"); return stringify(contract); }
  expect(database(c, dbSource, "mapping.yaml").diagnostics.map((d) => d.code)).toContain("DB_TYPE_MISMATCH");
});
it("composite keys support unique Constraints without interpreting field order", () => {
  const { indexes, warnings, ...contract } = structuredClone(ir);
  contract.constraints[0]!.fields = ["id", "receiptNumber"];
  const c = compile(stringify(contract)).ir!;
  const model = structuredClone(db);
  model.tables[2]!.uniqueKeys[0]!.columns = ["receipt_number", "id"];
  expect(database(c, stringify(model), "mapping.yaml").diagnostics).toEqual([]);
});
it("unsupported composite Relationship FK is explicit, not discarded", () => {
  const result = dbCheck((m) => {
    m.tables[0]!.uniqueKeys.push({ id: "identity", columns: ["id", "name"] });
    m.tables[1]!.columns.push({ id: "applicant_name", type: "string", nullable: false });
    m.tables[1]!.foreignKeys[0]!.columns.push("applicant_name");
    m.tables[1]!.foreignKeys[0]!.references.columns.push("name");
  });
  expect(result.diagnostics.map((d) => d.code)).toContain("DB_MAPPING_INVALID");
  expect(result.diagnostics.some((d) => d.message.includes("single-column"))).toBe(true);
});
it.each(["from", "to"] as const)("checks all cardinalities with explicit FK owner %s", (owner) => {
  for (const min of [0, 1] as const) for (const inverseMin of [0, 1] as const) for (const inverseMax of [1, "many"] as const) {
    const { indexes, warnings, ...contract } = structuredClone(ir);
    const r = contract.relationships.find((r) => r.id === "ExpensePayment")!;
    if (owner === "from") { r.from = "Payment"; r.to = "Expense"; }
    r.targetsPerSource = owner === "from" ? { min, max: 1 } : { min: inverseMin, max: inverseMax };
    r.sourcesPerTarget = owner === "to" ? { min, max: 1 } : { min: inverseMin, max: inverseMax };
    const model = structuredClone(db);
    model.relationships[2]!.owner = owner;
    model.tables[2]!.columns[3]!.nullable = min === 0;
    if (inverseMax === "many") model.tables[2]!.uniqueKeys.pop();
    const result = database(compile(stringify(contract)).ir!, stringify(model), "mapping.yaml");
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(result.diagnostics.filter((d) => d.code === "DB_UNVERIFIED")).toHaveLength(inverseMin === 1 ? 1 : 0);
  }
});
it("many-to-many requires unsupported junction mapping and fails explicitly", () => {
  const { indexes, warnings, ...contract } = structuredClone(ir);
  const r = contract.relationships.find((r) => r.id === "ExpensePayment")!;
  r.sourcesPerTarget.max = "many";
  expect(database(compile(stringify(contract)).ir!, dbSource, "mapping.yaml").diagnostics.map((d) => d.code)).toContain("DB_CARDINALITY_MISMATCH");
});
it.each(["db", "links"] as const)("strict companion %s YAML rejects unknown keys/version/aliases", async (kind) => {
  const source = kind === "db" ? dbSource : linkSource;
  const check = (text: string) => kind === "db" ? database(ir, text, "companion.yaml") : testLinks(ir, text, "companion.yaml", ".");
  expect((await check(source + "unsupported: true\n")).diagnostics.map((d) => d.code)).toEqual(["SCHEMA_INVALID"]);
  expect((await check(source.replace(/v1alpha1/, "v2"))).diagnostics[0]?.code).toBe("VERSION_UNSUPPORTED");
  expect((await check(source + "extra: &a []\ncopy: *a\n")).diagnostics.every((d) => d.code === "YAML_INVALID")).toBe(true);
});
it("Rule links report all six Rules without pretending declarations are execution evidence", async () => {
  const result = await testLinks(ir, linkSource, "links.yaml", ".");
  expect(result.diagnostics).toEqual([]);
  for (const r of ir.rules) expect(result.report).toContain(r.id);
  expect(result.report).toContain("test execution and title existence are unverified");
  expect(result.report).toContain("not verified");
});
it.each([
  ["unknown Rule", (m: TestLinks) => { m.links[0]!.rule = "Absent"; }, "REF_NOT_FOUND"],
  ["unknown test", (m: TestLinks) => { m.links[0]!.tests.push("Absent"); }, "REF_NOT_FOUND"],
  ["duplicate test", (m: TestLinks) => { m.tests.push(structuredClone(m.tests[0]!)); }, "ID_DUPLICATE"],
  ["duplicate Rule link", (m: TestLinks) => { m.links.push(structuredClone(m.links[0]!)); }, "ID_DUPLICATE"],
  ["duplicate test ref", (m: TestLinks) => { m.links[0]!.tests.push("ModelSemantics"); }, "ID_DUPLICATE"],
  ["missing file", (m: TestLinks) => { m.tests[0]!.file = "tests/missing.test.ts"; }, "TEST_FILE_INVALID"],
  ["directory", (m: TestLinks) => { m.tests[0]!.file = "tests"; }, "TEST_FILE_INVALID"],
  ["absolute file", (m: TestLinks) => { m.tests[0]!.file = resolve("tests/generation.test.ts"); }, "TEST_FILE_INVALID"],
  ["root escape", (m: TestLinks) => { m.tests[0]!.file = "../outside.ts"; }, "TEST_FILE_INVALID"],
] as const)("Rule links reject %s with code and location", async (_, edit, code) => {
  const model = structuredClone(links); edit(model);
  const result = await testLinks(ir, stringify(model), "links.yaml", ".");
  const d = result.diagnostics.find((d) => d.code === code);
  expect(d?.line).toBeGreaterThan(0); expect(d?.column).toBeGreaterThan(0);
  expect(result.report).toBeUndefined();
});
it("missing Rule/test links produce actionable warnings and deterministic reports", async () => {
  const model = structuredClone(links);
  model.links.pop(); model.tests.push({ id: "Unlinked", file: "tests/generation.test.ts", title: "Unused title" });
  const result = await testLinks(ir, stringify(model), "links.yaml", ".");
  expect(result.diagnostics.map((d) => d.code)).toEqual(["RULE_TEST_UNLINKED", "TEST_UNLINKED"]);
  expect(result.report).toContain("EXP-006 | invariant / entity Expense | — (unlinked)");
  model.links.reverse().forEach((l) => l.tests.reverse()); model.tests.reverse();
  expect((await testLinks(ir, stringify(model), "other.yaml", ".")).report).toBe(result.report);
});
function evidence(status = "passed") {
  return { file: "results.json", input: JSON.stringify({ testResults: [{ name: resolve("tests/generation.test.ts"), assertionResults: links.tests.map((t) => ({ fullName: t.title, status })) }] }) };
}
it("Rule links match real result identities and distinguish missing/failed/skipped evidence", async () => {
  expect((await testLinks(ir, linkSource, "links.yaml", ".", evidence())).diagnostics).toEqual([]);
  expect((await testLinks(ir, linkSource, "links.yaml", ".", evidence())).report).toContain("| passed |");
  for (const status of ["failed", "pending", "todo", "skipped", "disabled"]) expect((await testLinks(ir, linkSource, "links.yaml", ".", evidence(status))).diagnostics.every((d) => d.code === "TEST_NOT_PASSED")).toBe(true);
  const e = evidence(), raw = JSON.parse(e.input); raw.testResults[0].assertionResults.pop(); e.input = JSON.stringify(raw);
  expect((await testLinks(ir, linkSource, "links.yaml", ".", e)).diagnostics.map((d) => d.code)).toEqual(["TEST_RESULT_MISSING"]);
  raw.testResults[0].assertionResults.push(raw.testResults[0].assertionResults[0]); e.input = JSON.stringify(raw);
  expect((await testLinks(ir, linkSource, "links.yaml", ".", e)).diagnostics.every((d) => d.code === "TEST_RESULT_MISSING")).toBe(true);
});
it("result matching includes file, not just title, and malformed evidence is rejected", async () => {
  const e = evidence(), raw = JSON.parse(e.input); raw.testResults[0].name = resolve("tests/validation.test.ts"); e.input = JSON.stringify(raw);
  expect((await testLinks(ir, linkSource, "links.yaml", ".", e)).diagnostics.every((d) => d.code === "TEST_RESULT_MISSING")).toBe(true);
  for (const input of ["not json", "{}", evidence("unknown").input]) expect((await testLinks(ir, linkSource, "links.yaml", ".", { input, file: "results.json" })).diagnostics[0]?.code).toBe("SCHEMA_INVALID");
});
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
it("test root containment follows symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "cca-links-")); roots.push(root);
  await symlink(resolve("tests/generation.test.ts"), join(root, "escape.ts"));
  const model = structuredClone(links); model.tests.forEach((t) => { t.file = "escape.ts"; });
  expect((await testLinks(ir, stringify(model), "links.yaml", root)).diagnostics.every((d) => d.code === "TEST_FILE_INVALID")).toBe(true);
});
it("extension CLIs enforce argument scope, warnings and read-only behavior", async () => {
  const input = "contracts/expenses/contract.yaml";
  for (const args of [["db-check", "--input", input], ["test-links", "--input", input, "--links", "x"], ["validate", "--input", input, "--db", "x"], ["db-check", "--input", input, "--db", "x", "--out", "y"]]) expect((await run(args)).exitCode).toBe(3);
  expect((await run(["db-check", "--input", input, "--db", "missing.yaml"])).exitCode).toBe(3);
  const root = await mkdtemp(join(tmpdir(), "cca-extension-")); roots.push(root);
  const model = structuredClone(db); model.constraints = [];
  const mapping = join(root, "mapping.yaml"); await writeFile(mapping, stringify(model));
  const args = ["db-check", "--input", input, "--db", mapping];
  expect((await run(args)).exitCode).toBe(0);
  expect((await run([...args, "--warnings-as-errors"])).exitCode).toBe(1);
  const manifest = join(root, "links.yaml"), declarations = structuredClone(links); declarations.links.pop(); await writeFile(manifest, stringify(declarations));
  const linkArgs = ["test-links", "--input", input, "--links", manifest, "--root", "."];
  expect((await run(linkArgs)).exitCode).toBe(0);
  expect((await run([...linkArgs, "--warnings-as-errors"])).exitCode).toBe(1);
  expect((await readdir(root)).sort()).toEqual(["links.yaml", "mapping.yaml"]);
});
it("real extension processes emit JSON reports without exposing IR", () => {
  for (const args of [["db-check", "--db", "contracts/expenses/db-mapping.yaml"], ["test-links", "--links", "contracts/expenses/test-links.yaml", "--root", "."]]) {
    const child = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args, "--input", "contracts/expenses/contract.yaml", "--format", "json"], { encoding: "utf8" });
    expect(child.status).toBe(0);
    const report = JSON.parse(child.stdout); expect(Object.keys(report).sort()).toEqual(["diagnostics", "report"]); expect(report.diagnostics).toEqual([]);
  }
});
it("missing unique declaration is diagnosed separately from invalid table mapping", () => {
  const result = dbCheck((m) => { m.tables[2]!.uniqueKeys.shift(); });
  expect(result.diagnostics.map((d) => d.code)).toEqual(["DB_UNIQUE_MISSING"]);
});
it("aliases of the same file/title cannot inflate declared test identities", async () => {
  const model = structuredClone(links);
  model.tests.push({ ...model.tests[0]!, id: "Alias", file: "./tests/generation.test.ts" });
  model.links[0]!.tests.push("Alias");
  expect((await testLinks(ir, stringify(model), "links.yaml", ".")).diagnostics.map((d) => d.code)).toEqual(["ID_DUPLICATE"]);
});
it("companion display text rejects unsupported invisible controls", async () => {
  const model = structuredClone(links); model.tests[0]!.title = "bad\u0000title";
  expect((await testLinks(ir, stringify(model), "links.yaml", ".")).diagnostics[0]?.code).toBe("SCHEMA_INVALID");
  const mapping = structuredClone(db), col = mapping.tables[1]!.columns[2]!;
  if (col.type === "enum") col.values.push("bad\u0000value");
  expect(database(ir, stringify(mapping), "mapping.yaml").diagnostics[0]?.code).toBe("SCHEMA_INVALID");
});
it("partial/expression unique indexes are rejected at their property, not treated as full unique", () => {
  const mapping = structuredClone(db);
  Object.assign(mapping.tables[2]!.uniqueKeys[0]!, { where: "receipt_number is not null" });
  const text = stringify(mapping), result = database(ir, text, "mapping.yaml");
  const d = result.diagnostics[0]!;
  expect(d.code).toBe("SCHEMA_INVALID");
  expect(text.split("\n")[d.line! - 1]).toContain("where:");
});
it("missing FK uniqueness cannot be concealed by a composite unique key", () => {
  const result = dbCheck((m) => { m.tables[2]!.uniqueKeys[1]!.columns.push("receipt_number"); });
  expect(result.diagnostics.map((d) => d.code)).toEqual(["DB_CARDINALITY_MISMATCH"]);
});
