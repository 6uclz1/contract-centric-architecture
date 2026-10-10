export const managedFiles = [
  "model.mmd",
  "class.mmd",
  "state.mmd",
  "catalog.md",
] as const;
export type Outputs = Record<(typeof managedFiles)[number], string>;
