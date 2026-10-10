import { stringify } from "yaml";
import { compile } from "../../contract/compile.js";
import { parseInput } from "../../support/input/parse.js";
import { databaseSchema } from "../../features/database/schema.js";
import { database } from "./database.js";
import type { LiveDatabasePorts } from "../ports.js";
import type { Result } from "../result.js";
export interface LiveDatabasePaths { input: string; mapping: string; output: string }
export async function liveDatabase(paths: LiveDatabasePaths, ports: LiveDatabasePorts): Promise<Result> {
  const input = ports.resolvePath(paths.input);
  const compiled = compile(await ports.readText(input), input);
  if (!compiled.ir || compiled.diagnostics.length) return { exitCode: 1, diagnostics: compiled.diagnostics };
  const mappingFile = ports.resolvePath(paths.mapping);
  const mapping = parseInput(await ports.readText(mappingFile), mappingFile, databaseSchema, "cca.dev/db-mapping/v1alpha1");
  if (!mapping.value) return { exitCode: 1, diagnostics: mapping.diagnostics };
  const snapshot = await ports.postgresCatalog();
  if (!snapshot.tables) return { exitCode: 1, diagnostics: snapshot.diagnostics };
  // Replace the illustrative tables completely. Only explicit mappings are reused.
  const file = ports.resolvePath(paths.output);
  const text = stringify({ ...mapping.value, tables: snapshot.tables });
  await ports.writeText(file, text);
  const result = database(compiled.ir, text, file, "postgres17");
  return { exitCode: result.diagnostics.length ? 1 : 0, ...result,
    ...(result.report ? { report: `Source: live PostgreSQL 17 public-schema catalog (read-only transaction).\n\n${result.report}` } : {}) };
}
