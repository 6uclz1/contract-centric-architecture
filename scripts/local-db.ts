import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compose, sql, projectRoot, postgresCatalog } from "../src/adapters/postgres/local.js";
import { filesystem } from "../src/adapters/filesystem/index.js";
import { writeText } from "../src/adapters/filesystem/text.js";
import { liveDatabase } from "../src/application/commands/live-database.js";
export async function liveCheck() {
  return liveDatabase({
    input: resolve(projectRoot, "contracts/expenses/contract.yaml"),
    mapping: resolve(projectRoot, "contracts/expenses/db-mapping.yaml"),
    output: resolve(projectRoot, ".artifacts/db-live.yaml"),
  }, { ...filesystem, writeText, postgresCatalog });
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
