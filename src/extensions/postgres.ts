import { z } from "zod";
import type { DatabaseMapping } from "./database.js";
import { diagnostic, type Diagnostic } from "../diagnostics.js";
const strings = z.array(z.string());
const catalogSchema = z.strictObject({
  version: z.number().int(),
  tables: z.array(z.strictObject({
    id: z.string(), kind: z.string(), rowSecurity: z.boolean(), inherited: z.boolean(),
    triggers: z.number().int(), disabledTriggers: z.number().int(),
    columns: z.array(z.strictObject({
      id: z.string(), type: z.string(), typeSchema: z.string(), typeKind: z.string(),
      nullable: z.boolean(), dimensions: z.number().int(), generated: z.string(),
      identity: z.string(), hasDefault: z.boolean(), values: strings.nullable(),
    })),
    indexes: z.array(z.strictObject({
      id: z.string(), primary: z.boolean(), unique: z.boolean(), valid: z.boolean(),
      ready: z.boolean(), partial: z.boolean(), expression: z.boolean(), immediate: z.boolean(),
      method: z.string(), columns: z.array(z.string().nullable()).nullable(),
    })),
    constraints: z.array(z.strictObject({
      id: z.string(), kind: z.string(), validated: z.boolean(), deferrable: z.boolean(),
      columns: strings.nullable(), targetSchema: z.string().nullable(), targetTable: z.string().nullable(),
      targetColumns: strings.nullable(), updateAction: z.string(), deleteAction: z.string(), match: z.string(),
    })),
  })),
});
export function postgresSnapshot(raw: unknown): { tables?: DatabaseMapping["tables"]; diagnostics: Diagnostic[] } {
  const checked = catalogSchema.safeParse(raw);
  if (!checked.success) return { diagnostics: [diagnostic("DB_SCHEMA_INVALID", `Invalid PostgreSQL catalog result: ${checked.error.message}`)] };
  const diagnostics: Diagnostic[] = [];
  const unsupported = (elementId: string, message: string) => diagnostics.push({ ...diagnostic("DB_LIVE_UNSUPPORTED", message), elementId });
  if (checked.data.version < 170000 || checked.data.version >= 180000) unsupported("PostgreSQL", "Live catalog adapter supports PostgreSQL 17 only");
  const tables: DatabaseMapping["tables"] = [];
  const types: Record<string, "string" | "integer" | "boolean" | "date" | "datetime"> = {
    text: "string", varchar: "string", bpchar: "string", int2: "integer", int4: "integer", int8: "integer",
    bool: "boolean", date: "date", timestamp: "datetime", timestamptz: "datetime",
  };
  for (const table of checked.data.tables) {
    if (table.kind !== "r" || table.rowSecurity || table.inherited || table.triggers || table.disabledTriggers)
      unsupported(table.id, "Views, partition/inheritance, RLS, user triggers or disabled constraint triggers are unsupported");
    const columns: DatabaseMapping["tables"][number]["columns"] = [];
    for (const col of table.columns) {
      const element = `${table.id}.${col.id}`;
      if (col.dimensions || col.generated || col.identity || col.hasDefault) unsupported(element, "Arrays, generated/identity columns and defaults are unsupported");
      if (col.typeKind === "e" && col.values) columns.push({ id: col.id, type: "enum", nullable: col.nullable, values: col.values });
      else if (col.typeKind === "b" && col.typeSchema === "pg_catalog" && types[col.type]) columns.push({ id: col.id, type: types[col.type]!, nullable: col.nullable });
      else unsupported(element, `Unsupported PostgreSQL type: ${col.typeSchema}.${col.type}`);
    }
    let primaryKey: DatabaseMapping["tables"][number]["primaryKey"] = null;
    const uniqueKeys: DatabaseMapping["tables"][number]["uniqueKeys"] = [];
    for (const index of table.indexes) {
      if (!index.valid || !index.ready || index.partial || index.expression || !index.immediate || index.method !== "btree" || !index.columns?.length || index.columns.some((c) => c === null)) {
        unsupported(`${table.id}.${index.id}`, "Unique/primary indexes must be valid, ready, immediate, full-column btree indexes");
        continue;
      }
      const key = { id: index.id, columns: index.columns as string[] };
      if (index.primary) primaryKey = key;
      else if (index.unique) uniqueKeys.push(key);
    }
    const foreignKeys: DatabaseMapping["tables"][number]["foreignKeys"] = [];
    for (const constraint of table.constraints) {
      if (!constraint.validated || constraint.deferrable) unsupported(`${table.id}.${constraint.id}`, "Unvalidated or deferrable constraints are unsupported");
      if (constraint.kind === "p" || constraint.kind === "u") continue;
      if (constraint.kind !== "f" || constraint.targetSchema !== "public" || constraint.updateAction !== "a" || constraint.deleteAction !== "a" || constraint.match !== "s" || !constraint.columns?.length || !constraint.targetTable || !constraint.targetColumns?.length) {
        unsupported(`${table.id}.${constraint.id}`, "Only validated public-schema FKs with NO ACTION and MATCH SIMPLE are supported; CHECK/exclusion constraints are unsupported");
        continue;
      }
      foreignKeys.push({ id: constraint.id, columns: constraint.columns, references: { table: constraint.targetTable, columns: constraint.targetColumns } });
    }
    tables.push({ id: table.id, columns, primaryKey, uniqueKeys, foreignKeys });
  }
  return diagnostics.length ? { diagnostics } : { tables, diagnostics };
}
