import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { execute } from "../src/application/execute.js";
import { liveDatabase } from "../src/application/commands/live-database.js";
import type { Ports, LiveDatabasePorts } from "../src/application/ports.js";
import type { DatabaseMapping } from "../src/features/database/schema.js";
import { compile } from "../src/contract/compile.js";
import type { Contract } from "../src/contract/model.js";
import { selectContext } from "../src/features/context/index.js";
import { renderContext } from "../src/presentation/reports/context.js";

const input = readFileSync("contracts/expenses/contract.yaml", "utf8");
const mapping = readFileSync("contracts/expenses/db-mapping.yaml", "utf8");
const links = readFileSync("contracts/expenses/test-links.yaml", "utf8");
function ports(text = input): Ports {
  return {
    resolvePath: (path) => path,
    readText: vi.fn(async () => text),
    writeOutputs: vi.fn(async () => []),
    checkOutputs: vi.fn(async () => []),
    inspectTestFiles: vi.fn(async () => { throw new Error("Unexpected file probe"); }),
    testResults: vi.fn(async () => { throw new Error("Unexpected test results"); }),
  };
}
const base = { input: "input.yaml", strict: false, format: "text" as const };
it("invalid Contract stops generation before any output IO", async () => {
  const io = ports("unknown: value");
  const result = await execute({ ...base, command: "generate", out: "out" }, io);
  expect(result.exitCode).toBe(1);
  expect(io.writeOutputs).not.toHaveBeenCalled();
  expect(io.checkOutputs).not.toHaveBeenCalled();
  expect(io.inspectTestFiles).not.toHaveBeenCalled();
});
it("strict warnings stop before reading companion inputs or output IO", async () => {
  const contract = parse(input) as Contract;
  contract.stateMachines[0]!.states.push("isolated");
  const io = ports(stringify(contract));
  const result = await execute({ ...base, strict: true, command: "db-check", db: "db.yaml" }, io);
  expect(result.exitCode).toBe(1);
  expect(result.diagnostics.map((d) => d.code)).toEqual(["STATE_UNREACHABLE"]);
  expect(io.readText).toHaveBeenCalledTimes(1);
  expect(io.inspectTestFiles).not.toHaveBeenCalled();
});
it("generate supplies all four completed artifacts to the output port, while check uses only comparison", async () => {
  const io = ports();
  expect((await execute({ ...base, command: "generate", out: "out" }, io)).exitCode).toBe(0);
  const [, output] = vi.mocked(io.writeOutputs).mock.calls[0]!;
  expect(Object.keys(output).sort()).toEqual(["catalog.md", "class.mmd", "model.mmd", "state.mmd"]);
  expect(output["catalog.md"]).toContain("EXP-006");
  expect(io.checkOutputs).not.toHaveBeenCalled();
  vi.mocked(io.checkOutputs).mockResolvedValue([{ code: "OUTPUT_CHANGED", severity: "error", message: "changed", elementId: null, path: null, line: null, column: null }]);
  expect((await execute({ ...base, command: "check", out: "out" }, io)).exitCode).toBe(2);
  expect(io.writeOutputs).toHaveBeenCalledTimes(1);
});
it("traceability uses supplied file and execution evidence without direct filesystem access", async () => {
  const io = ports();
  io.readText = vi.fn<Ports["readText"]>(async (file) => ({ "input.yaml": input, "links.yaml": links, "results.json": "opaque runner input" } as Record<string, string>)[file]!);
  io.inspectTestFiles = vi.fn<Ports["inspectTestFiles"]>(async (_root, tests) => ({ rootPath: "/project", files: new Map(tests.map((t) => [t.id, `/project/${t.file}`])), issues: [] }));
  io.testResults = vi.fn(async () => ({ diagnostics: [], records: new Map((parse(links).tests as { file: string; title: string }[]).map((t) => [JSON.stringify([`/project/${t.file}`, t.title]), ["passed"]])) }));
  const result = await execute({ ...base, command: "test-links", links: "links.yaml", root: "root", results: "results.json" }, io);
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toEqual([]);
  expect(result.report).toContain("| passed |");
  expect(io.testResults).toHaveBeenCalledWith("opaque runner input", "results.json", "/project");
  expect(io.writeOutputs).not.toHaveBeenCalled();
});
it("context returns a reading selection and preserves full-Contract warnings without partial IR indexes", () => {
  const contract = parse(input) as Contract;
  contract.entities.push({ id: "Other", name: "Other", fields: [] });
  contract.rules.push({ id: "Unused", kind: "precondition", description: "unrelated", scope: { kind: "entity", id: "Other" } });
  const ir = compile(stringify(contract)).ir!;
  const selection = selectContext(ir, "entity", "Expense")!;
  expect(selection.selected.entity.has("Other")).toBe(false);
  expect(selection).not.toHaveProperty("indexes");
  expect(selection).not.toHaveProperty("entities");
  const report = renderContext(ir, selection);
  expect(report).not.toContain("### Other");
  expect(report).toContain("RULE_UNUSED / Unused");
  expect(ir.indexes.entities.has("Other")).toBe(true);
});
it("live DB replaces the sample inventory completely while keeping explicit mappings", async () => {
  const model = parse(mapping) as DatabaseMapping;
  const { tables } = model;
  model.tables = [];
  const written = vi.fn<LiveDatabasePorts["writeText"]>(async () => {});
  const io: LiveDatabasePorts = {
    resolvePath: (path) => path,
    readText: async (path) => path === "contract" ? input : stringify(model),
    writeText: written,
    postgresCatalog: vi.fn(async () => ({ tables, diagnostics: [] })),
  };
  const result = await liveDatabase({ input: "contract", mapping: "mapping", output: "snapshot" }, io);
  expect(result.exitCode).toBe(0);
  const [path, saved] = written.mock.calls[0]!;
  expect(path).toBe("snapshot");
  expect(parse(saved)).toEqual({ ...model, tables });
  expect(result.report).toContain("Source: live PostgreSQL 17");
});
it("unsupported live catalog returns its diagnostics before snapshot saving", async () => {
  const io: LiveDatabasePorts = {
    resolvePath: (path) => path,
    readText: async (path) => path === "contract" ? input : mapping,
    writeText: vi.fn(async () => {}),
    postgresCatalog: async () => ({ diagnostics: [{ code: "DB_LIVE_UNSUPPORTED", severity: "error", message: "unsupported", elementId: "table", path: null, line: null, column: null }] }),
  };
  const result = await liveDatabase({ input: "contract", mapping: "mapping", output: "snapshot" }, io);
  expect(result.exitCode).toBe(1);
  expect(result.diagnostics[0]?.code).toBe("DB_LIVE_UNSUPPORTED");
  expect(io.writeText).not.toHaveBeenCalled();
});
