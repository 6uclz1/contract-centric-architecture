import type { IR } from "../contract/model.js";
import { generateER } from "./diagrams/er.js";
import { generateClass } from "./diagrams/class.js";
import { generateState } from "./diagrams/state.js";
import { generateCatalog } from "./catalog.js";
import type { Outputs } from "../support/artifacts.js";
export { managedFiles } from "../support/artifacts.js";
export function generate(
  ir: IR,
): Outputs {
  return {
    "model.mmd": generateER(ir),
    "class.mmd": generateClass(ir),
    "state.mmd": generateState(ir),
    "catalog.md": generateCatalog(ir),
  };
}
