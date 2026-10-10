import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stringify } from "yaml";
import { parseInput } from "../src/parser.js";
import { compile } from "../src/validate.js";
import { database, databaseSchema } from "../src/extensions/database.js";
import { postgresSnapshot } from "../src/extensions/postgres.js";
import type { Diagnostic } from "../src/diagnostics.js";
export const projectRoot = resolve(import.meta.dirname, "..");
export async function compose(args: string[], input?: string): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn("docker", ["compose", "--file", resolve(projectRoot, "compose.yaml"), ...args], {
      cwd: projectRoot, stdio: ["pipe", "pipe", "pipe"], timeout: 300_000,
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (s: string) => { stdout += s; });
    child.stderr.setEncoding("utf8").on("data", (s: string) => { stderr += s; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? accept(stdout) : reject(new Error(`docker compose failed (${code}): ${stderr}`)));
    child.stdin.on("error", (e: NodeJS.ErrnoException) => { if (e.code !== "EPIPE") reject(e); });
    child.stdin.end(input);
  });
}
export async function sql(input: string): Promise<string> {
  return compose(["exec", "-T", "db", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "cca", "-d", "cca"], input);
}
export async function inspectSQL(): Promise<string> { return readFile(resolve(projectRoot, "infra/postgres/introspect.sql"), "utf8"); }
export async function liveCheck(): Promise<{ exitCode: number; diagnostics: Diagnostic[]; report?: string }> {
  const input = resolve(projectRoot, "contracts/expenses/contract.yaml");
  const compiled = compile(await readFile(input, "utf8"), input);
  if (!compiled.ir || compiled.diagnostics.length) return { exitCode: 1, diagnostics: compiled.diagnostics };
  const mappingFile = resolve(projectRoot, "contracts/expenses/db-mapping.yaml");
  const mapping = parseInput(await readFile(mappingFile, "utf8"), mappingFile, databaseSchema, "cca.dev/db-mapping/v1alpha1");
  if (!mapping.value) return { exitCode: 1, diagnostics: mapping.diagnostics };
  const raw = JSON.parse(await sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL statement_timeout = '15s';\n${await inspectSQL()}\nCOMMIT;`));
  const snapshot = postgresSnapshot(raw);
  if (!snapshot.tables) return { exitCode: 1, diagnostics: snapshot.diagnostics };
  // Replace the illustrative tables completely. Only explicit mappings are reused.
  const file = resolve(projectRoot, ".artifacts/db-live.yaml");
  const text = stringify({ ...mapping.value, tables: snapshot.tables });
  await mkdir(resolve(projectRoot, ".artifacts"), { recursive: true });
  await writeFile(file, text);
  const result = database(compiled.ir, text, file, "postgres17");
  return { exitCode: result.diagnostics.length ? 1 : 0, ...result,
    ...(result.report ? { report: `Source: live PostgreSQL 17 public-schema catalog (read-only transaction).\n\n${result.report}` } : {}) };
}
async function main() {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !["up", "down", "check", "test"].includes(command ?? "")) throw new Error("Usage: local-db.ts up|down|check|test");
  if (command === "up") { await compose(["up", "-d", "--wait", "--wait-timeout", "90", "db"]); console.log(`PostgreSQL is healthy; localhost:${process.env.CCA_DB_PORT ?? "55432"}.`); }
  else if (command === "down") { await compose(["down"]); console.log("DB stopped; named volume preserved."); }
  else if (command === "test") {
    const result = await liveCheck();
    if (result.exitCode) { console.log(JSON.stringify(result.diagnostics, null, 2)); process.exitCode = result.exitCode; return; }
    await sql(await readFile(resolve(projectRoot, "infra/postgres/verify.sql"), "utf8"));
    console.log("Live DB catalog and seven physical constraint probes passed; all probe data rolled back.");
  } else {
    const result = await liveCheck();
    console.log(result.report ?? JSON.stringify(result.diagnostics, null, 2));
    process.exitCode = result.exitCode;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 3; }
}
