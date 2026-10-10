import type { Field } from "../contract/model.js";
export const fieldType = (f: Field) =>
  f.type === "state"
    ? `state (${f.machine})`
    : f.type === "enum"
      ? `enum (${f.values.map((value) => JSON.stringify(value)).join(", ")})`
      : f.type;
export { multiplicity } from "../contract/multiplicity.js";
