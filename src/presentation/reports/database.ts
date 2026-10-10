import type { IR } from "../../contract/model.js";
import type { DatabaseMapping } from "../../features/database/schema.js";
import type { Diagnostic } from "../../support/diagnostics.js";
import { ascii } from "../../support/order.js";
import { multiplicity } from "../model-format.js";
import { md, finish } from "../markdown.js";
export function renderDatabase(ir: IR, model: DatabaseMapping, diagnostics: Diagnostic[], source: "snapshot" | "postgres17"): string {
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
  return finish(lines);
}
