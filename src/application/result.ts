import type { Diagnostic } from "../support/diagnostics.js";
export interface Result {
  exitCode: number;
  diagnostics: Diagnostic[];
  report?: string;
}
export const hasWarnings = (diagnostics: Diagnostic[]) => diagnostics.some((d) => d.severity === "warning");
export const invalid = (diagnostics: Diagnostic[], strict: boolean) => diagnostics.some((d) => d.severity === "error" || (strict && d.severity === "warning"));
