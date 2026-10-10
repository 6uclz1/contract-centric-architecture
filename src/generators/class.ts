import type { IR } from "../ir.js";
import { classLabel, nodeId, header, finish, multiplicity } from "./common.js";
export function generateClass(ir: IR): string {
  const lines = header("classDiagram");
  lines.push("  direction TB");
  for (const e of ir.entities) {
    const id = nodeId("entity", e.id);
    lines.push(
      `  class ${id}["${classLabel(`${e.id}: ${e.name}`)}"]`,
      `  class ${id} {`,
      "    <<Entity>>",
    );
    for (const f of e.fields) lines.push(`    ${f.type} ${f.id}`);
    lines.push("  }");
  }
  for (const cmd of ir.commands) {
    const id = nodeId("command", cmd.id);
    lines.push(
      `  class ${id}["${classLabel(`${cmd.id}: ${cmd.name}`)}"]`,
      `  class ${id} {`,
      "    <<Command>>",
      "  }",
      `  ${id} ..> ${nodeId("entity", cmd.target)} : target`,
    );
  }
  for (const r of ir.relationships)
    lines.push(
      `  %% relationship: ${r.id}`,
      `  ${nodeId("entity", r.from)} "${multiplicity(r.sourcesPerTarget)}" -- "${multiplicity(r.targetsPerSource)}" ${nodeId("entity", r.to)} : ${classLabel(`${r.id}: ${r.name}`)}`,
    );
  return finish(lines);
}
