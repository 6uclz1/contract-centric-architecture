import type { IR } from "./ir.js";
import { ascii } from "./diagnostics.js";
import { generate } from "./generators/index.js";
import { md, finish } from "./generators/common.js";

// Review is a human-facing projection, not a serialized/public IR.
const groups = ["entities", "relationships", "stateMachines", "commands", "rules", "constraints"] as const;
function properties(value: unknown, path = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (Array.isArray(value)) {
    if (value.length && value.every((v) => typeof v === "object" && v !== null && "id" in v)) {
      for (const item of value) {
        for (const [key, val] of properties(item, `${path}[${item.id}]`)) result.set(key, val);
      }
    } else result.set(path, JSON.stringify(value));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, val] of Object.entries(value)) {
      for (const [nested, text] of properties(val, path ? `${path}.${key}` : key)) result.set(nested, text);
    }
  } else result.set(path, JSON.stringify(value));
  return result;
}
export function review(before: IR, after: IR): string {
  const lines = ["# Contract change review", "", "Structural changes only. Rule meaning, business correctness and compatibility are not evaluated.", "", "| Element / property | Before | After |", "| --- | --- | --- |"];
  let count = 0;
  const compare = (label: string, left: unknown, right: unknown) => {
    const a = properties(left), b = properties(right);
    for (const path of [...new Set([...a.keys(), ...b.keys()])].sort(ascii)) {
      if (a.get(path) === b.get(path)) continue;
      count++;
      lines.push(`| ${md(`${label}${path ? `.${path}` : ""}`)} | ${a.has(path) ? md(a.get(path)!) : "— (absent)"} | ${b.has(path) ? md(b.get(path)!) : "— (absent)"} |`);
    }
  };
  compare("metadata", before.metadata, after.metadata);
  for (const group of groups) {
    const a = new Map<string, unknown>(before[group].map((v) => [v.id, v]));
    const b = new Map<string, unknown>(after[group].map((v) => [v.id, v]));
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort(ascii)) {
      // Absence has no properties: additions/removals list every declared property.
      compare(`${group}[${id}]`, a.get(id) ?? {}, b.get(id) ?? {});
    }
  }
  if (!count) lines.push("| — | No structural changes | No structural changes |");
  const a = generate(before), b = generate(after);
  lines.push("", "## Generated output changes", "");
  const changed = Object.keys(a).filter((key) => a[key as keyof typeof a] !== b[key as keyof typeof b]).sort(ascii);
  lines.push(...(changed.length ? changed.map((key) => `- ${key}`) : ["None."]));
  lines.push("", "## Warnings", "");
  for (const [label, ir] of [["Before", before], ["After", after]] as const) {
    lines.push(`${label}:`, "");
    lines.push(...(ir.warnings.length ? ir.warnings.map((w) => `- ${w.code} / ${w.elementId ?? "—"}: ${md(w.message)}`) : ["None."]), "");
  }
  return finish(lines);
}
