import type { IR } from "../../contract/model.js";
import { erLabel, erAttributeName, nodeId, header } from "./common.js";
import { finish } from "../markdown.js";
const left = (m: { min: 0 | 1; max: 1 | "many" }) =>
  m.max === 1 ? (m.min === 1 ? "||" : "|o") : m.min === 1 ? "}|" : "}o";
const right = (m: { min: 0 | 1; max: 1 | "many" }) =>
  m.max === 1 ? (m.min === 1 ? "||" : "o|") : m.min === 1 ? "|{" : "o{";
export function generateER(ir: IR): string {
  const lines = header("erDiagram");
  for (const e of ir.entities) {
    lines.push(
      `  ${nodeId("entity", e.id)}["${erLabel(`${e.id}: ${e.name}`)}"] {`,
    );
    for (const f of e.fields) {
      const attribute = erAttributeName(f.id);
      const required = f.required ? "required" : "optional";
      const comment =
        attribute === f.id ? required : `id: ${f.id}; ${required}`;
      lines.push(`    ${f.type} ${attribute} "${erLabel(comment)}"`);
    }
    lines.push("  }");
  }
  for (const r of ir.relationships)
    lines.push(
      `  %% relationship: ${r.id}`,
      `  ${nodeId("entity", r.from)} ${left(r.sourcesPerTarget)}..${right(r.targetsPerSource)} ${nodeId("entity", r.to)} : "${erLabel(`${r.id}: ${r.name}`)}"`,
    );
  return finish(lines);
}
