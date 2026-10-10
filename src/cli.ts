import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./cli/args.js";
import { formatResult } from "./cli/format.js";
import { execute } from "./application/execute.js";
import type { Result } from "./application/result.js";
import { filesystem } from "./adapters/filesystem/index.js";
import { inspectTestFiles } from "./adapters/filesystem/test-files.js";
import { testResults } from "./adapters/vitest/results.js";
import { diagnostic } from "./support/diagnostics.js";
export type { Result } from "./application/result.js";
export async function run(args: string[]): Promise<Result> {
  const request = parseArgs(args);
  if ("exitCode" in request) return request;
  try { return await execute(request, { ...filesystem, inspectTestFiles, testResults }); }
  catch (e) { return { exitCode: 3, diagnostics: [diagnostic("IO_ERROR", e instanceof Error ? e.message : String(e))] }; }
}
async function main() {
  const args = process.argv.slice(2), result = await run(args);
  process.stdout.write(formatResult(args, result));
  process.exitCode = result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
