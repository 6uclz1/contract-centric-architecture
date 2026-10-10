import type { Contract } from "./model.js";
export const multiplicity = (
  m: Contract["relationships"][number]["targetsPerSource"],
) => `${m.min}..${m.max === "many" ? "*" : m.max}`;
