import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { stringify } from "yaml";
import { compile } from "../../src/contract/compile.js";
import { database } from "../../src/application/commands/database.js";
import { databaseSchema } from "../../src/features/database/schema.js";
import { parseInput } from "../../src/support/input/parse.js";
import { postgresSnapshot } from "../../src/adapters/postgres/snapshot.js";
import { sql, inspectSQL } from "../../src/adapters/postgres/local.js";
import { liveCheck } from "../../scripts/local-db.js";
const live = process.env.CCA_LIVE_DB === "1";
describe.skipIf(!live)("container PostgreSQL catalog and enforcement", () => {
  it("introspects real tables, enum, NOT NULL, PK, unique and FK", async () => {
    const result = await liveCheck();
    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.report).toContain("Source: live PostgreSQL 17");
    expect(result.report).toContain("ExpensePayment | Expense → Payment | 0..1 | 1..1 | to");
  }, 30000);
  it("physically enforces seven probes and leaves no probe records", async () => {
    await sql(await readFile("infra/postgres/verify.sql", "utf8"));
    const result = await sql("SELECT count(*) FROM users WHERE id LIKE '_cca_probe_%';");
    expect(result.trim()).toBe("0");
  }, 30000);
  it.each([
    ["DROP CONSTRAINT expense_unique", "DB_CARDINALITY_MISMATCH"],
    ["DROP CONSTRAINT receipt_unique", "DB_UNIQUE_MISSING"],
    ["ALTER COLUMN expense_id DROP NOT NULL", "DB_NULLABILITY_MISMATCH"],
  ])("detects actual payment DDL drift: %s, and rolls it back", async (alter, code) => {
    const catalog = JSON.parse(await sql(`BEGIN; ALTER TABLE payments ${alter};\n${await inspectSQL()}\nROLLBACK;`));
    const actual = postgresSnapshot(catalog);
    expect(actual.diagnostics).toEqual([]);
    const ir = compile(await readFile("contracts/expenses/contract.yaml", "utf8")).ir!;
    const mapping = parseInput(await readFile("contracts/expenses/db-mapping.yaml", "utf8"), "mapping.yaml", databaseSchema, "cca.dev/db-mapping/v1alpha1").value!;
    const result = database(ir, stringify({ ...mapping, tables: actual.tables }), "live-catalog.yaml");
    expect(result.diagnostics.map((d) => d.code)).toContain(code);
    expect((await liveCheck()).exitCode).toBe(0);
  }, 30000);
  it("rejects a real partial unique index instead of counting it as unique enforcement", async () => {
    const raw = JSON.parse(await sql(`BEGIN; CREATE UNIQUE INDEX partial_probe ON payments(receipt_number) WHERE receipt_number <> '';\n${await inspectSQL()}\nROLLBACK;`));
    const result = postgresSnapshot(raw);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["DB_LIVE_UNSUPPORTED"]);
    expect(result.diagnostics[0]?.elementId).toBe("payments.partial_probe");
    expect((await liveCheck()).exitCode).toBe(0);
  }, 30000);
});
