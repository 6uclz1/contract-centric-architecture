import { z } from "zod";
import { text as displayText } from "../schema.js";
import type { IR } from "../ir.js";
import { parseInput } from "../parser.js";
import { ascii, stableDiagnostics, type Diagnostic } from "../diagnostics.js";
import { md, finish, multiplicity } from "../generators/common.js";
import { collector, duplicates, sameSet, type Parts } from "./common.js";
import type { ExtensionResult } from "./test-links.js";
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const columns = z.array(id).min(1);
const key = z.strictObject({ id, columns });
const column = z.discriminatedUnion("type", [
  z.strictObject({ id, type: z.enum(["string", "integer", "boolean", "date", "datetime"]), nullable: z.boolean() }),
  z.strictObject({ id, type: z.literal("enum"), nullable: z.boolean(), values: z.array(displayText).min(1) }),
]);
export const databaseSchema = z.strictObject({
  apiVersion: z.literal("cca.dev/db-mapping/v1alpha1"),
  tables: z.array(z.strictObject({
    id, columns: z.array(column), primaryKey: key.nullable(), uniqueKeys: z.array(key),
    foreignKeys: z.array(z.strictObject({ id, columns, references: z.strictObject({ table: id, columns }) })),
  })),
  entities: z.array(z.strictObject({ entity: id, table: id, fields: z.array(z.strictObject({ field: id, column: id })) })),
  relationships: z.array(z.strictObject({ relationship: id, owner: z.enum(["from", "to"]), table: id, foreignKey: id })),
  constraints: z.array(z.strictObject({ constraint: id, table: id, key: id })),
});
export type DatabaseMapping = z.infer<typeof databaseSchema>;
export function database(ir: IR, input: string, file: string, source: "snapshot" | "postgres17" = "snapshot"): ExtensionResult {
  const parsed = parseInput(input, file, databaseSchema, "cca.dev/db-mapping/v1alpha1");
  if (!parsed.value) return { diagnostics: parsed.diagnostics };
  const model = parsed.value, diagnostics: Diagnostic[] = [];
  const add = collector(parsed.source, diagnostics);
  const checkIds = <T>(items: T[], key: (v: T) => string, path: Parts, prop: string) =>
    duplicates(items, key, (i, k) => add("ID_DUPLICATE", `Duplicate ${prop}: ${k}`, [...path, i, prop], k));
  const checkColumns = (names: string[], available: Set<string>, path: Parts, element: string) => {
    duplicates(names, (v) => v, (i, k) => add("DB_SCHEMA_INVALID", `Duplicate key column: ${k}`, [...path, i], element));
    names.forEach((c, i) => { if (!available.has(c)) add("DB_SCHEMA_INVALID", `Unknown column: ${c}`, [...path, i], element); });
  };
  checkIds(model.tables, (v) => v.id, ["tables"], "id");
  const tables = new Map(model.tables.map((t) => [t.id, t]));
  for (const [i, t] of model.tables.entries()) {
    checkIds(t.columns, (v) => v.id, ["tables", i, "columns"], "id");
    checkIds(t.uniqueKeys, (v) => v.id, ["tables", i, "uniqueKeys"], "id");
    if (t.primaryKey && t.uniqueKeys.some((k) => k.id === t.primaryKey!.id)) add("ID_DUPLICATE", `Duplicate key ID: ${t.primaryKey.id}`, ["tables", i, "primaryKey", "id"], t.primaryKey.id);
    checkIds(t.foreignKeys, (v) => v.id, ["tables", i, "foreignKeys"], "id");
    const names = new Set(t.columns.map((c) => c.id));
    for (const [j, c] of t.columns.entries()) if (c.type === "enum") duplicates(c.values, (v) => v, (k, value) => add("DB_SCHEMA_INVALID", `Duplicate enum value: ${value}`, ["tables", i, "columns", j, "values", k], t.id));
    for (const [j, k] of t.uniqueKeys.entries()) checkColumns(k.columns, names, ["tables", i, "uniqueKeys", j, "columns"], t.id);
    if (t.primaryKey) {
      checkColumns(t.primaryKey.columns, names, ["tables", i, "primaryKey", "columns"], t.id);
      for (const c of t.primaryKey.columns) if (t.columns.find((v) => v.id === c)?.nullable) add("DB_SCHEMA_INVALID", "Primary key columns must be NOT NULL", ["tables", i, "primaryKey", "columns"], t.id);
    }
    for (const [j, fk] of t.foreignKeys.entries()) {
      const path: Parts = ["tables", i, "foreignKeys", j];
      checkColumns(fk.columns, names, [...path, "columns"], fk.id);
      const target = tables.get(fk.references.table);
      if (!target) { add("DB_SCHEMA_INVALID", `Unknown referenced table: ${fk.references.table}`, [...path, "references", "table"], fk.id); continue; }
      checkColumns(fk.references.columns, new Set(target.columns.map((c) => c.id)), [...path, "references", "columns"], fk.id);
      if (fk.columns.length !== fk.references.columns.length) add("DB_SCHEMA_INVALID", "FK column counts differ", path, fk.id);
      if (![...target.uniqueKeys, ...(target.primaryKey ? [target.primaryKey] : [])].some((k) => sameSet(k.columns, fk.references.columns))) add("DB_SCHEMA_INVALID", "FK target must be a declared full unique/primary key", [...path, "references", "columns"], fk.id);
      fk.columns.forEach((name, k) => {
        const local = t.columns.find((c) => c.id === name), remote = target.columns.find((c) => c.id === fk.references.columns[k]);
        if (local && remote && (local.type !== remote.type || (local.type === "enum" && remote.type === "enum" && !sameSet(local.values, remote.values)))) add("DB_SCHEMA_INVALID", "FK column types differ", [...path, "columns", k], fk.id);
      });
    }
  }
  // Avoid diagnostics derived from an invalid schema inventory.
  if (diagnostics.length) return { diagnostics: stableDiagnostics(diagnostics) };
  checkIds(model.entities, (v) => v.entity, ["entities"], "entity");
  checkIds(model.entities, (v) => v.table, ["entities"], "table");
  checkIds(model.relationships, (v) => v.relationship, ["relationships"], "relationship");
  checkIds(model.relationships, (v) => `${v.table}/${v.foreignKey}`, ["relationships"], "foreignKey");
  checkIds(model.constraints, (v) => v.constraint, ["constraints"], "constraint");
  const entities = new Map(model.entities.map((e) => [e.entity, e]));
  for (const [i, mapping] of model.entities.entries()) {
    const e = ir.indexes.entities.get(mapping.entity), table = tables.get(mapping.table);
    if (!e) add("REF_NOT_FOUND", `Unknown Entity: ${mapping.entity}`, ["entities", i, "entity"], mapping.entity);
    if (!table) add("DB_MAPPING_INVALID", `Unknown table: ${mapping.table}`, ["entities", i, "table"], mapping.entity);
    checkIds(mapping.fields, (v) => v.field, ["entities", i, "fields"], "field");
    checkIds(mapping.fields, (v) => v.column, ["entities", i, "fields"], "column");
    if (!e || !table) continue;
    for (const [j, pair] of mapping.fields.entries()) {
      const field = e.fields.find((f) => f.id === pair.field), col = table.columns.find((c) => c.id === pair.column);
      const path: Parts = ["entities", i, "fields", j];
      if (!field) add("FIELD_NOT_FOUND", `Unknown field: ${e.id}.${pair.field}`, [...path, "field"], e.id);
      if (!col) add("DB_MAPPING_INVALID", `Unknown column: ${table.id}.${pair.column}`, [...path, "column"], e.id);
      if (!field || !col) continue;
      const expectedType = field.type === "state" ? "enum" : field.type;
      const values = field.type === "state" ? ir.indexes.machines.get(field.machine)!.states : field.type === "enum" ? field.values : undefined;
      if (expectedType !== col.type || (values && col.type === "enum" && !sameSet(values, col.values))) add("DB_TYPE_MISMATCH", `Type/value set mismatch: ${e.id}.${field.id} → ${table.id}.${col.id}`, [...path, "column"], e.id);
      if (field.required === col.nullable) add("DB_NULLABILITY_MISMATCH", `required:${field.required} expects nullable:${!field.required}`, [...path, "column"], e.id);
    }
    for (const f of e.fields) if (!mapping.fields.some((m) => m.field === f.id)) add("DB_UNVERIFIED", `Unmapped field: ${e.id}.${f.id}`, ["entities", i, "fields"], e.id, "warning");
  }
  for (const e of ir.entities) if (!entities.has(e.id)) add("DB_UNVERIFIED", `Unmapped Entity: ${e.id}`, [], e.id, "warning");
  // Invalid mappings must not masquerade as type/cardinality mismatches.
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics: stableDiagnostics(diagnostics) };
  const usedTables = new Set(model.entities.map((m) => m.table));
  for (const t of model.tables) if (!usedTables.has(t.id)) add("DB_UNVERIFIED", `Table outside Entity mappings: ${t.id}`, ["tables", model.tables.indexOf(t)], t.id, "warning");
  for (const [i, mapping] of model.relationships.entries()) {
    const r = ir.indexes.relationships.get(mapping.relationship), table = tables.get(mapping.table);
    const path: Parts = ["relationships", i];
    if (!r) { add("REF_NOT_FOUND", `Unknown Relationship: ${mapping.relationship}`, [...path, "relationship"], mapping.relationship); continue; }
    const fk = table?.foreignKeys.find((v) => v.id === mapping.foreignKey);
    if (!fk) { add("DB_MAPPING_INVALID", `Unknown foreign key: ${mapping.table}.${mapping.foreignKey}`, [...path, "foreignKey"], r.id); continue; }
    const ownerEntity = mapping.owner === "from" ? r.from : r.to, otherEntity = mapping.owner === "from" ? r.to : r.from;
    const owner = entities.get(ownerEntity), other = entities.get(otherEntity);
    if (!owner || !other || owner.table !== mapping.table || other.table !== fk.references.table) { add("DB_MAPPING_INVALID", "FK owner/target tables do not match explicit Relationship endpoints", path, r.id); continue; }
    if (fk.columns.length !== 1) { add("DB_MAPPING_INVALID", "Relationship checks support single-column FKs only", [...path, "foreignKey"], r.id); continue; }
    const perOwner = mapping.owner === "from" ? r.targetsPerSource : r.sourcesPerTarget;
    const perOther = mapping.owner === "from" ? r.sourcesPerTarget : r.targetsPerSource;
    if (perOwner.max !== 1) add("DB_CARDINALITY_MISMATCH", "A direct FK represents at most one referenced endpoint per owner; junction tables are unsupported", [...path, "owner"], r.id);
    const col = table!.columns.find((c) => c.id === fk.columns[0])!;
    if (col.nullable !== (perOwner.min === 0)) add("DB_NULLABILITY_MISMATCH", `Relationship owner-side ${multiplicity(perOwner)} does not match FK nullable:${col.nullable}`, [...path, "foreignKey"], r.id);
    const unique = [...table!.uniqueKeys, ...(table!.primaryKey ? [table!.primaryKey] : [])].some((k) => sameSet(k.columns, fk.columns));
    if (unique !== (perOther.max === 1)) add("DB_CARDINALITY_MISMATCH", `Opposite endpoint ${multiplicity(perOther)} ${perOther.max === 1 ? "requires" : "does not permit the restriction of"} a single-column unique FK`, [...path, "foreignKey"], r.id);
    if (perOther.min === 1) add("DB_UNVERIFIED", "A foreign key cannot guarantee at least one owner row for every referenced row", [...path, "foreignKey"], r.id, "warning");
  }
  for (const r of ir.relationships) if (!model.relationships.some((m) => m.relationship === r.id)) add("DB_UNVERIFIED", `Unmapped Relationship: ${r.id}`, [], r.id, "warning");
  for (const [i, mapping] of model.constraints.entries()) {
    const c = ir.indexes.constraints.get(mapping.constraint), table = tables.get(mapping.table), path: Parts = ["constraints", i];
    if (!c) { add("REF_NOT_FOUND", `Unknown Constraint: ${mapping.constraint}`, [...path, "constraint"], mapping.constraint); continue; }
    const entity = entities.get(c.entity), mappedKey = [...(table?.uniqueKeys ?? []), ...(table?.primaryKey ? [table.primaryKey] : [])].find((k) => k.id === mapping.key);
    if (!entity || entity.table !== mapping.table) { add("DB_MAPPING_INVALID", "Constraint must map to its Entity table", [...path, "table"], c.id); continue; }
    if (!mappedKey) { add("DB_UNIQUE_MISSING", "Mapped full unique/primary key is absent", [...path, "key"], c.id); continue; }
    const names = c.fields.map((f) => entity.fields.find((pair) => pair.field === f)?.column);
    if (names.some((n) => n === undefined)) add("DB_MAPPING_INVALID", "Constraint fields must all have explicit column mappings", path, c.id);
    else if (!sameSet(names as string[], mappedKey.columns)) add("DB_UNIQUE_MISSING", "Unique key columns must exactly match mapped Constraint fields", [...path, "key"], c.id);
  }
  for (const c of ir.constraints) if (!model.constraints.some((m) => m.constraint === c.id)) add("DB_UNVERIFIED", `Unmapped Constraint: ${c.id}`, [], c.id, "warning");
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics: stableDiagnostics(diagnostics) };
  const boundary = source === "postgres17"
    ? "Checked against a live PostgreSQL 17 public-schema catalog and explicit mappings. Physical types are projected to logical types; lengths, ranges, timezone/collation semantics, migrations, data and Rule prose are not evaluated. required maps to NOT NULL by this mapping convention; Contract semantics are unchanged."
    : "Checked against a supplied logical schema snapshot and explicit mappings. No live DB, SQL dialect, physical storage type, migration, data or Rule prose is inspected. required maps to NOT NULL by this mapping convention; Contract semantics are unchanged.";
  const lines = ["# Limited DB consistency review", "", boundary, "", "## Entity mappings", "", "| Entity | Table | Field → column |", "| --- | --- | --- |"];
  for (const e of [...model.entities].sort((a, b) => ascii(a.entity, b.entity))) lines.push(`| ${e.entity} | ${e.table} | ${[...e.fields].sort((a, b) => ascii(a.field, b.field)).map((f) => `${f.field} → ${f.column}`).join(", ")} |`);
  lines.push("", "## Relationship mappings", "", "| Relationship | From → To | Targets per source | Sources per target | Explicit FK owner | FK |", "| --- | --- | --- | --- | --- | --- |");
  for (const m of [...model.relationships].sort((a, b) => ascii(a.relationship, b.relationship))) {
    const r = ir.indexes.relationships.get(m.relationship)!;
    lines.push(`| ${r.id} | ${r.from} → ${r.to} | ${multiplicity(r.targetsPerSource)} | ${multiplicity(r.sourcesPerTarget)} | ${m.owner} | ${m.table}.${m.foreignKey} |`);
  }
  lines.push("", "## Constraint mappings", "", "| Constraint | Key |", "| --- | --- |");
  for (const c of [...model.constraints].sort((a, b) => ascii(a.constraint, b.constraint))) lines.push(`| ${c.constraint} | ${c.table}.${c.key} |`);
  lines.push("", "## Unverified items", "");
  const warnings = diagnostics.filter((d) => d.severity === "warning").sort((a, b) => ascii(a.elementId ?? "", b.elementId ?? "") || ascii(a.message, b.message));
  lines.push(...(warnings.length ? warnings.map((d) => `- ${d.code} / ${d.elementId ?? "—"}: ${md(d.message)}`) : [source === "postgres17" ? "None within the supported catalog checks. Row enforcement is measured separately by db:test." : "None within the supported checks. Snapshot freshness and physical enforcement remain unverified."]));
  lines.push("", "Extra columns, keys and FKs outside explicit mappings receive inventory validation only. Defaults, checks, partial/expression indexes, generated columns, cascades, triggers, composite relationship FKs and junction-table relationships are unsupported. Reverse-side minimum participation cannot be proved by FK declarations.");
  return { diagnostics: stableDiagnostics(diagnostics), report: finish(lines) };
}
