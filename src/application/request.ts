import type { ContextKind } from "../features/context/index.js";
export type { ContextKind } from "../features/context/index.js";
export { contextKinds } from "../features/context/index.js";
type Base = { input: string; strict: boolean; format: "text" | "json" };
export type Request = Base & (
  | { command: "validate" }
  | { command: "generate" | "check"; out: string }
  | { command: "review"; before: string }
  | { command: "context"; kind: ContextKind; id: string }
  | { command: "test-links"; links: string; root: string; results?: string }
  | { command: "db-check"; db: string }
);
