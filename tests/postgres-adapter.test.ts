import { it, expect } from "vitest";
import { postgresSnapshot } from "../src/adapters/postgres/snapshot.js";
function catalog() {
  return {
    version: 170011,
    tables: [{
      id: "items", kind: "r", rowSecurity: false, inherited: false, triggers: 0, disabledTriggers: 0,
      columns: [{ id: "id", type: "text", typeSchema: "pg_catalog", typeKind: "b", nullable: false,
        dimensions: 0, generated: "", identity: "", hasDefault: false, values: null as string[] | null }],
      indexes: [{ id: "items_pk", primary: true, unique: true, valid: true, ready: true,
        partial: false, expression: false, immediate: true, method: "btree", columns: ["id"] as (string | null)[] }],
      constraints: [{ id: "items_pk", kind: "p", validated: true, deferrable: false, columns: ["id"],
        targetSchema: null as string | null, targetTable: null as string | null,
        targetColumns: null as string[] | null, updateAction: " ", deleteAction: " ", match: " " }],
    }],
  };
}
it("converts catalog declarations and separates PK from unique without duplicating it", () => {
  expect(postgresSnapshot(catalog())).toEqual({ diagnostics: [], tables: [{
    id: "items", columns: [{ id: "id", type: "string", nullable: false }],
    primaryKey: { id: "items_pk", columns: ["id"] }, uniqueKeys: [], foreignKeys: [],
  }] });
});
it("takes enum/state values from the DB rather than the supplied illustrative snapshot", () => {
  const raw = catalog(), c = raw.tables[0]!.columns[0]!;
  c.type = "real_status"; c.typeSchema = "public"; c.typeKind = "e"; c.values = ["actual", "states"];
  expect(postgresSnapshot(raw).tables?.[0]?.columns[0]).toEqual({ id: "id", type: "enum", nullable: false, values: ["actual", "states"] });
});
it.each([
  ["partial", (r: ReturnType<typeof catalog>) => { r.tables[0]!.indexes[0]!.partial = true; }],
  ["expression", (r: ReturnType<typeof catalog>) => { r.tables[0]!.indexes[0]!.expression = true; r.tables[0]!.indexes[0]!.columns = [null]; }],
  ["invalid index", (r: ReturnType<typeof catalog>) => { r.tables[0]!.indexes[0]!.valid = false; }],
  ["domain", (r: ReturnType<typeof catalog>) => { r.tables[0]!.columns[0]!.typeKind = "d"; }],
  ["array", (r: ReturnType<typeof catalog>) => { r.tables[0]!.columns[0]!.dimensions = 1; }],
  ["default", (r: ReturnType<typeof catalog>) => { r.tables[0]!.columns[0]!.hasDefault = true; }],
  ["unknown type", (r: ReturnType<typeof catalog>) => { r.tables[0]!.columns[0]!.type = "numeric"; }],
  ["unvalidated FK", (r: ReturnType<typeof catalog>) => { r.tables[0]!.constraints[0]!.validated = false; }],
  ["check", (r: ReturnType<typeof catalog>) => { r.tables[0]!.constraints[0]!.kind = "c"; }],
  ["view", (r: ReturnType<typeof catalog>) => { r.tables[0]!.kind = "v"; }],
  ["disabled trigger", (r: ReturnType<typeof catalog>) => { r.tables[0]!.disabledTriggers = 1; }],
  ["new major", (r: ReturnType<typeof catalog>) => { r.version = 180000; }],
] as const)("refuses unsupported %s with a stable diagnostic instead of dropping it", (_, edit) => {
  const raw = catalog(); edit(raw);
  const result = postgresSnapshot(raw);
  expect(result.tables).toBeUndefined();
  expect(result.diagnostics.some((d) => d.code === "DB_LIVE_UNSUPPORTED")).toBe(true);
});
it("validates catalog result shape instead of coercing driver data", () => {
  expect(postgresSnapshot({ version: "17", tables: [] }).diagnostics[0]?.code).toBe("DB_SCHEMA_INVALID");
});
