import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { postgresSnapshot } from "./snapshot.js";
export const projectRoot = resolve(import.meta.dirname, "../../..");
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

export async function postgresCatalog(): Promise<ReturnType<typeof postgresSnapshot>> {
  const raw = JSON.parse(await sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL statement_timeout = '15s';\n${await inspectSQL()}\nCOMMIT;`));
  return postgresSnapshot(raw);
}
