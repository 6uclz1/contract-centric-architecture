import { z } from "zod";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { text as displayText } from "../../support/input/schema.js";
import type { TestResults } from "../../features/test-links/evidence.js";
const text = displayText.min(1);
// Only the documented Vitest JSON projection is consumed. Runner metadata
// outside testResults/name/assertionResults/fullName/status is not interpreted.
const resultsSchema = z.object({
  testResults: z.array(z.object({
    name: text,
    assertionResults: z.array(z.object({
      fullName: text,
      status: z.enum(["passed", "failed", "pending", "todo", "skipped", "disabled"]),
    })),
  })),
});

export async function testResults(input: string, file: string, rootPath: string): Promise<TestResults> {
  let raw: unknown;
  try { raw = JSON.parse(input); } catch {
    return { diagnostics: [{ code: "SCHEMA_INVALID", severity: "error", message: "Invalid Vitest JSON results", elementId: null, path: file, line: null, column: null }] };
  }
  const checked = resultsSchema.safeParse(raw);
  if (!checked.success) return { diagnostics: [{ code: "SCHEMA_INVALID", severity: "error", message: checked.error.message, elementId: null, path: file, line: null, column: null }] };
  const records = new Map<string, string[]>();
  for (const suite of checked.data.testResults) {
    let path = resolve(rootPath, suite.name);
    try { path = await realpath(path); } catch { /* Missing files will not match a validated manifest file. */ }
    for (const assertion of suite.assertionResults) {
      const key = JSON.stringify([path, assertion.fullName]);
      records.set(key, [...(records.get(key) ?? []), assertion.status]);
    }
  }
  return { records, diagnostics: [] };
}
