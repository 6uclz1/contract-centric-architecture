import type { Diagnostic } from "../support/diagnostics.js";
import type { Outputs } from "../support/artifacts.js";
import type { TestLinks } from "../features/test-links/schema.js";
import type { TestFiles, TestResults } from "../features/test-links/evidence.js";
export interface Ports {
  inspectTestFiles(root: string, tests: TestLinks["tests"]): Promise<TestFiles>;
  testResults(input: string, file: string, rootPath: string): Promise<TestResults>;
  resolvePath(path: string): string;
  readText(path: string): Promise<string>;
  writeOutputs(path: string, outputs: Outputs): Promise<Diagnostic[]>;
  checkOutputs(path: string, outputs: Outputs): Promise<Diagnostic[]>;
}

export interface LiveDatabasePorts extends Pick<Ports, "resolvePath" | "readText"> {
  writeText(path: string, text: string): Promise<void>;
  postgresCatalog(): Promise<{ tables?: import("../features/database/schema.js").DatabaseMapping["tables"]; diagnostics: Diagnostic[] }>;
}
