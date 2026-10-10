import type { IR } from "../../contract/model.js";
import { ascii } from "../../support/order.js";

// Internal structural differences, never a serialized/public IR.
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
export interface PropertyChange { property: string; before?: string; after?: string }
export function compareContracts(before: IR, after: IR): PropertyChange[] {
  const changes: PropertyChange[] = [];
  const compare = (label: string, left: unknown, right: unknown) => {
    const a = properties(left), b = properties(right);
    for (const path of [...new Set([...a.keys(), ...b.keys()])].sort(ascii)) {
      if (a.get(path) === b.get(path)) continue;
      changes.push({ property: `${label}${path ? `.${path}` : ""}`, before: a.get(path), after: b.get(path) });
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
  return changes;
}
