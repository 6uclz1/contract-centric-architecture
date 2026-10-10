import type { IR } from "../ir.js";
import { generateER } from "./er.js";
import { generateClass } from "./class.js";
import { generateState } from "./state.js";
import { generateCatalog } from "./catalog.js";
export const managedFiles = [
  "model.mmd",
  "class.mmd",
  "state.mmd",
  "catalog.md",
] as const;
export function generate(
  ir: IR,
): Record<(typeof managedFiles)[number], string> {
  return {
    "model.mmd": generateER(ir),
    "class.mmd": generateClass(ir),
    "state.mmd": generateState(ir),
    "catalog.md": generateCatalog(ir),
  };
}
