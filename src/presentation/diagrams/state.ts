import type { IR } from "../../contract/model.js";
import { stateLabel, nodeId, header } from "./common.js";
import { finish } from "../markdown.js";
export function generateState(ir: IR): string {
  const lines = header("stateDiagram-v2");
  lines.push("  direction TB");
  for (const m of ir.stateMachines) {
    lines.push(`  state "${stateLabel(m.id)}" as ${nodeId("machine", m.id)} {`);
    for (const s of m.states)
      lines.push(`    state "${stateLabel(s)}" as ${nodeId("state", m.id, s)}`);
    lines.push(`    [*] --> ${nodeId("state", m.id, m.initial)}`);
    for (const t of m.transitions) {
      const cmd = ir.indexes.commands.get(t.command)!;
      const label = `${t.id} / ${cmd.id}; pre: ${cmd.preconditions.join(", ") || "-"}; post: ${cmd.postconditions.join(", ") || "-"}`;
      lines.push(
        `    %% transition: ${t.id}`,
        `    ${nodeId("state", m.id, t.from)} --> ${nodeId("state", m.id, t.to)} : ${stateLabel(label)}`,
      );
    }
    lines.push("  }");
  }
  return finish(lines);
}
