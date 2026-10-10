import { it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  mkdir,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { run } from "../../src/cli.js";
import { managedFiles } from "../../src/presentation/outputs.js";
import { parse, stringify } from "yaml";
const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(await realpath(tmpdir()), "cca-test-"));
  roots.push(root);
  const input = join(root, "contract.yaml");
  await writeFile(input, await readFile("tests/fixtures/expenses.yaml"));
  return { root, input, out: join(root, "generated") };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});
const args = (command: string, input: string, out?: string) => [
  command,
  "--input",
  input,
  ...(out ? ["--out", out] : []),
];
it("validate writes nothing; generate and check produce and compare four files", async () => {
  const { root, input, out } = await setup();
  expect((await run(args("validate", input))).exitCode).toBe(0);
  expect(await readdir(root)).toEqual(["contract.yaml"]);
  expect((await run(args("generate", input, out))).exitCode).toBe(0);
  expect((await readdir(out)).sort()).toEqual([...managedFiles].sort());
  expect((await run(args("check", input, out))).exitCode).toBe(0);
});
it("check detects changed, missing and surplus, never repairs or deletes", async () => {
  const { input, out } = await setup();
  await run(args("generate", input, out));
  await rm(join(out, "state.mmd"));
  await writeFile(join(out, "model.mmd"), "stale");
  await writeFile(join(out, "extra.txt"), "preserve");
  const result = await run(args("check", input, out));
  expect(result.exitCode).toBe(2);
  expect(result.diagnostics.map((d) => d.code).sort()).toEqual([
    "OUTPUT_CHANGED",
    "OUTPUT_MISSING",
    "OUTPUT_UNEXPECTED",
  ]);
  expect(await readFile(join(out, "model.mmd"), "utf8")).toBe("stale");
  expect(await readFile(join(out, "extra.txt"), "utf8")).toBe("preserve");
  expect((await run(args("generate", input, out))).exitCode).toBe(3);
  await rm(join(out, "extra.txt"));
  expect((await run(args("generate", input, out))).exitCode).toBe(0);
  expect((await run(args("check", input, out))).exitCode).toBe(0);
});
it("check fails when only Contract changes, including Rule text", async () => {
  const { input, out } = await setup();
  await run(args("generate", input, out));
  const c = parse(await readFile(input, "utf8"));
  c.rules[0].description = "New";
  await writeFile(input, stringify(c));
  const result = await run(args("check", input, out));
  expect(result.exitCode).toBe(2);
  expect(result.diagnostics.map((d) => d.message)).toEqual([
    "Changed generated file: catalog.md",
  ]);
});
it("invalid Contract preserves all existing outputs", async () => {
  const { input, out } = await setup();
  await run(args("generate", input, out));
  const before = await Promise.all(
    managedFiles.map((f) => readFile(join(out, f), "utf8")),
  );
  await writeFile(input, await readFile("tests/fixtures/undefined-rule.yaml"));
  expect((await run(args("generate", input, out))).exitCode).toBe(1);
  expect(
    await Promise.all(managedFiles.map((f) => readFile(join(out, f), "utf8"))),
  ).toEqual(before);
});
it("warnings-as-errors applies to every command and does not write", async () => {
  const { input, out } = await setup();
  const c = parse(await readFile(input, "utf8"));
  c.stateMachines[0].states.push("unreachable");
  await writeFile(input, stringify(c));
  for (const command of ["validate", "generate", "check"])
    expect(
      (
        await run([
          ...args(command, input, command === "validate" ? undefined : out),
          "--warnings-as-errors",
        ])
      ).exitCode,
    ).toBe(1);
  expect((await run(args("validate", input))).exitCode).toBe(0);
});
it("rejects symlink outputs, parents, files and dangling links", async () => {
  const { root, input, out } = await setup();
  const real = join(root, "real");
  await mkdir(real);
  await symlink(real, out);
  expect((await run(args("generate", input, out))).diagnostics[0]?.code).toBe(
    "OUTPUT_SYMLINK",
  );
  expect(
    (await run(args("generate", input, join(out, "nested")))).exitCode,
  ).toBe(3);
  await rm(out);
  await mkdir(out);
  await symlink(join(root, "absent"), join(out, "model.mmd"));
  expect((await run(args("check", input, out))).exitCode).toBe(3);
  expect(await readdir(real)).toEqual([]);
});
it("lists all unexpected entries and refuses directories at managed filenames", async () => {
  const { input, out } = await setup();
  await mkdir(out);
  await mkdir(join(out, "model.mmd"));
  await writeFile(join(out, "z"), "z");
  await writeFile(join(out, "a"), "a");
  const result = await run(args("generate", input, out));
  expect(result.exitCode).toBe(3);
  expect(result.diagnostics).toHaveLength(3);
});
it("returns code 3 for I/O and invalid arguments", async () => {
  for (const list of [
    [],
    ["nope"],
    ["validate"],
    ["generate", "--input", "x"],
    ["validate", "--input", "x", "--format", "xml"],
    ["validate", "--input", "x", "--unknown"],
    ["validate", "--input", "x", "--input", "y"],
    ["validate", "--input", "x", "--out", "y"],
  ])
    expect((await run(list)).exitCode).toBe(3);
  expect(
    (await run(["validate", "--input", "/does-not-exist/contract.yaml"]))
      .diagnostics[0]?.code,
  ).toBe("IO_ERROR");
});
it("real process returns JSON diagnostics and exact exit code", async () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli.ts",
      "validate",
      "--input",
      "tests/fixtures/undefined-rule.yaml",
      "--format",
      "json",
    ],
    { encoding: "utf8" },
  );
  expect(child.status).toBe(1);
  const diagnostics = JSON.parse(child.stdout);
  expect(diagnostics[0]).toEqual(
    expect.objectContaining({
      code: "REF_NOT_FOUND",
      severity: "error",
      elementId: "ApproveExpense",
      line: expect.any(Number),
      column: expect.any(Number),
    }),
  );
  expect(Object.keys(diagnostics[0]).sort()).toEqual([
    "code",
    "column",
    "elementId",
    "line",
    "message",
    "path",
    "severity",
  ]);
});

it("nonexistent output is missing rather than repaired by check", async () => {
  const { input, out } = await setup();
  const r = await run(args("check", input, out));
  expect(r.exitCode).toBe(2);
  expect(r.diagnostics.map((d) => d.code)).toEqual(
    Array(4).fill("OUTPUT_MISSING"),
  );
  await expect(readdir(out)).rejects.toMatchObject({ code: "ENOENT" });
});
it("managed filename directory is an unexpected entry in check", async () => {
  const { input, out } = await setup();
  await run(args("generate", input, out));
  await rm(join(out, "model.mmd"));
  await mkdir(join(out, "model.mmd"));
  const r = await run(args("check", input, out));
  expect(r.exitCode).toBe(2);
  expect(r.diagnostics).toHaveLength(1);
  expect(r.diagnostics[0]?.code).toBe("OUTPUT_UNEXPECTED");
});

it("check detects enum boundary changes and ignores enum ordering", async () => {
  const { input, out } = await setup();
  const c = parse(await readFile(input, "utf8"));
  const field = {
    id: "choice",
    type: "enum",
    required: true,
    values: ["a, b", "c"],
  };
  c.entities[0].fields.push(field);
  await writeFile(input, stringify(c));
  expect((await run(args("generate", input, out))).exitCode).toBe(0);
  field.values.reverse();
  await writeFile(input, stringify(c));
  expect((await run(args("check", input, out))).exitCode).toBe(0);
  field.values = ["a", "b, c"];
  await writeFile(input, stringify(c));
  const result = await run(args("check", input, out));
  expect(result.exitCode).toBe(2);
  expect(result.diagnostics.map((d) => d.message)).toEqual([
    "Changed generated file: catalog.md",
  ]);
  expect((await run(args("generate", input, out))).exitCode).toBe(0);
  expect((await run(args("check", input, out))).exitCode).toBe(0);
});
