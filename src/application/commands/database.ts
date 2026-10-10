import { compareDatabase } from "../../features/database/index.js";
import { databaseSchema } from "../../features/database/schema.js";
import type { IR } from "../../contract/model.js";
import { parseInput } from "../../support/input/parse.js";
import type { ReportResult } from "../../support/report.js";
import { renderDatabase } from "../../presentation/reports/database.js";
import type { Loaded } from "../load.js";
import type { Ports } from "../ports.js";
import type { Request } from "../request.js";
import { invalid, type Result } from "../result.js";
export async function dbCheck(request: Extract<Request, { command: "db-check" }>, loaded: Loaded, ports: Ports): Promise<Result> {
  const file = ports.resolvePath(request.db);
  const result = database(loaded.ir, await ports.readText(file), file);
  const diagnostics = [...loaded.diagnostics, ...result.diagnostics], failed = invalid(diagnostics, request.strict);
  return { exitCode: failed ? 1 : 0, diagnostics, ...(failed ? {} : { report: result.report }) };
}

export function database(ir: IR, input: string, file: string, source: "snapshot" | "postgres17" = "snapshot"): ReportResult {
  const parsed = parseInput(input, file, databaseSchema, "cca.dev/db-mapping/v1alpha1");
  if (!parsed.value) return { diagnostics: parsed.diagnostics };
  const result = compareDatabase(ir, parsed.value, parsed.source);
  return { diagnostics: result.diagnostics, ...(result.mapping ? { report: renderDatabase(ir, result.mapping, result.diagnostics, source) } : {}) };
}
