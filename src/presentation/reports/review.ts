import type { IR } from "../../contract/model.js";
import type { PropertyChange } from "../../features/review/index.js";
import { md, finish } from "../markdown.js";
export function renderReview(before: IR, after: IR, changes: PropertyChange[], changed: string[]): string {
  const lines = ["# Contract change review", "", "Structural changes only. Rule meaning, business correctness and compatibility are not evaluated.", "", "| Element / property | Before | After |", "| --- | --- | --- |"];
  for (const change of changes) lines.push(`| ${md(change.property)} | ${change.before !== undefined ? md(change.before) : "— (absent)"} | ${change.after !== undefined ? md(change.after) : "— (absent)"} |`);
  if (!changes.length) lines.push("| — | No structural changes | No structural changes |");
  lines.push("", "## Generated output changes", "");
  lines.push(...(changed.length ? changed.map((key) => `- ${key}`) : ["None."]));
  lines.push("", "## Warnings", "");
  for (const [label, ir] of [["Before", before], ["After", after]] as const) {
    lines.push(`${label}:`, "");
    lines.push(...(ir.warnings.length ? ir.warnings.map((w) => `- ${w.code} / ${w.elementId ?? "—"}: ${md(w.message)}`) : ["None."]), "");
  }
  return finish(lines);
}
