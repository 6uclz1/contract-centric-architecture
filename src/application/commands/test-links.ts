import { validateDeclarations, validateIdentities, matchResults } from "../../features/test-links/index.js";
import { testLinksSchema } from "../../features/test-links/schema.js";
import type { IR } from "../../contract/model.js";
import { parseInput } from "../../support/input/parse.js";
import { collector } from "../../support/validation.js";
import { stableDiagnostics } from "../../support/diagnostics.js";
import type { ReportResult } from "../../support/report.js";
import { renderTestLinks } from "../../presentation/reports/test-links.js";
import type { Loaded } from "../load.js";
import type { Ports } from "../ports.js";
import type { Request } from "../request.js";
import { invalid, type Result } from "../result.js";
export async function testLinksCommand(request: Extract<Request, { command: "test-links" }>, loaded: Loaded, ports: Ports): Promise<Result> {
  const file = ports.resolvePath(request.links), input = await ports.readText(file);
  const resultPath = request.results ? ports.resolvePath(request.results) : undefined;
  const evidence = resultPath ? { file: resultPath, input: await ports.readText(resultPath) } : undefined;
  const result = await testLinks(loaded.ir, input, file, ports.resolvePath(request.root), ports, evidence);
  const diagnostics = [...loaded.diagnostics, ...result.diagnostics], failed = invalid(diagnostics, request.strict);
  return { exitCode: failed ? 1 : 0, diagnostics, ...(failed ? {} : { report: result.report }) };
}

export async function testLinks(ir: IR, input: string, file: string, root: string, ports: Pick<Ports, "inspectTestFiles" | "testResults">, results?: { input: string; file: string }): Promise<ReportResult> {
  const parsed = parseInput(input, file, testLinksSchema, "cca.dev/test-links/v1alpha1");
  if (!parsed.value) return { diagnostics: parsed.diagnostics };
  const manifest = parsed.value;
  const { diagnostics, ruleLinks } = validateDeclarations(ir, manifest, parsed.source);
  const { rootPath, files, issues } = await ports.inspectTestFiles(root, manifest.tests);
  const add = collector(parsed.source, diagnostics);
  for (const issue of issues) add("TEST_FILE_INVALID", issue.message, ["tests", issue.index, "file"], manifest.tests[issue.index]!.id);
  validateIdentities(manifest, files, parsed.source, diagnostics);
  let statuses = new Map<string, string>();
  if (results) {
    const evidence = await ports.testResults(results.input, results.file, rootPath);
    if (!evidence.records) return { diagnostics: [...diagnostics, ...evidence.diagnostics] };
    statuses = matchResults(manifest, files, evidence.records, parsed.source, diagnostics);
  }
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics: stableDiagnostics(diagnostics) };
  return { diagnostics: stableDiagnostics(diagnostics), report: renderTestLinks(ir, manifest, ruleLinks, statuses, !!results) };
}
