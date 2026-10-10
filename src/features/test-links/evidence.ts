import type { Diagnostic } from "../../support/diagnostics.js";
export interface TestFiles {
  rootPath: string;
  files: ReadonlyMap<string, string>;
  issues: { index: number; message: string }[];
}
export interface TestResults {
  records?: ReadonlyMap<string, readonly string[]>;
  diagnostics: Diagnostic[];
}
