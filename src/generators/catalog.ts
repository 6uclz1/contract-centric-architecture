import type { IR } from "../ir.js";
import { md, anchor, fieldType, multiplicity, finish } from "./common.js";
export function generateCatalog(ir: IR): string {
  const l = [
    `# ${md(ir.metadata.name)} (${ir.metadata.id})`,
    "",
    `API: ${ir.apiVersion}`,
    "",
    md(ir.metadata.description ?? ""),
    "",
    "## Entities",
    "",
  ];
  for (const e of ir.entities) {
    l.push(
      `### ${e.id}: ${md(e.name)}`,
      "",
      md(e.description ?? ""),
      "",
      "| Field | Type | Required | Description |",
      "| --- | --- | --- | --- |",
    );
    for (const f of e.fields)
      l.push(
        `| ${f.id} | ${md(fieldType(f))} | ${f.required} | ${md(f.description ?? "")} |`,
      );
    l.push("");
  }
  l.push(
    "## Relationships",
    "",
    "| ID / Name | From → To | Targets per source | Sources per target | Description |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const r of ir.relationships)
    l.push(
      `| ${r.id}: ${md(r.name)} | ${r.from} → ${r.to} | ${multiplicity(r.targetsPerSource)} | ${multiplicity(r.sourcesPerTarget)} | ${md(r.description ?? "")} |`,
    );
  l.push("", "## State Machines", "");
  for (const m of ir.stateMachines) {
    l.push(
      `### ${m.id}`,
      "",
      `Entity / field: ${m.entity}.${m.field}`,
      "",
      `States: ${m.states.join(", ")}; initial: ${m.initial}`,
      "",
      md(m.description ?? ""),
      "",
      "| Transition | From → To | Command | Description |",
      "| --- | --- | --- | --- |",
    );
    for (const t of m.transitions)
      l.push(
        `| ${t.id} | ${t.from} → ${t.to} | ${t.command} | ${md(t.description ?? "")} |`,
      );
    l.push("");
  }
  const refs = (ids: string[]) =>
    ids.map((id) => `[${id}](#${anchor(id)})`).join(", ") || "—";
  l.push("## Commands", "");
  for (const cmd of ir.commands) {
    l.push(
      `### ${cmd.id}: ${md(cmd.name)}`,
      "",
      `Target: ${cmd.target}`,
      "",
      md(cmd.description ?? ""),
      "",
      `Preconditions: ${refs(cmd.preconditions)}`,
      "",
      `Postconditions: ${refs(cmd.postconditions)}`,
      "",
      "Effects (unordered notification intentions):",
    );
    if (!cmd.effects.length) l.push("", "—");
    for (const e of cmd.effects)
      l.push("", `- ${e.id} (${e.kind}): ${md(e.description)}`);
    l.push("");
  }
  l.push("## Rules", "");
  for (const r of ir.rules)
    l.push(
      `<a id="${anchor(r.id)}"></a>`,
      "",
      `### ${r.id} (${r.kind})`,
      "",
      `Scope: ${r.scope.kind} ${r.scope.id}`,
      "",
      md(r.description),
      "",
    );
  l.push(
    "## Constraints",
    "",
    "| ID | Kind | Entity | Fields | Description |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const c of ir.constraints)
    l.push(
      `| ${c.id} | ${c.kind} | ${c.entity} | ${c.fields.join(", ")} | ${md(c.description ?? "")} |`,
    );
  l.push(
    "",
    "## Drawing conventions and validation boundaries",
    "",
    "ER uses dotted non-identifying connectors (`..`); line style is a drawing convention only and is not used to determine identifying relationships. No physical PK / FK / UK is claimed. ER field IDs reserved by Mermaid (PK/FK/UK, case-insensitive, including hyphen suffixes) and IDs beginning with cca_field_ use collision-free cca_field_ aliases; the attribute comment preserves the original ID.",
    "",
    "Validated: input structure, references, and defined model consistency.",
    "",
    "Not validated: meaning or satisfiability of Rule prose, real data, production implementation, DB constraints, and external effects.",
    "",
    "Omissions: ER omits Commands, state sets/transitions, Rules, Effects, Constraints and descriptions. Class omits state sets/transitions, Rules, Effects, Constraints, required flags, enum values and descriptions. State omits fields, Relationships, invariant Rules, Effects, Constraints and Command names/descriptions. Catalog includes the complete structured specification.",
    "",
    "## Warnings",
    "",
  );
  if (!ir.warnings.length) l.push("None.");
  for (const w of ir.warnings)
    l.push(`- ${w.code} / ${w.elementId ?? "—"}: ${md(w.message)}`);
  return finish(l);
}
