import { it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dependencies, localTarget, violations } from "./architecture-rules.js";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(`${dir}/${entry.name}`) : entry.name.endsWith(".ts") ? [`${dir}/${entry.name}`] : []);
}
it("source modules and the local DB entrypoint respect the documented dependency boundaries", () => {
  const errors = [...files("src"), "scripts/local-db.ts"].flatMap((file) => violations(file, readFileSync(file, "utf8")));
  expect(errors).toEqual([]);
});
it("source imports and reexports have no dependency cycles, including type-only edges", () => {
  const graph = new Map(files("src").map((file) => [file, dependencies(file, readFileSync(file, "utf8")).flatMap((d) => d.specifier?.startsWith(".") ? [localTarget(file, d.specifier)] : [])]));
  const visited = new Set<string>(), active = new Set<string>(), cycles: string[] = [];
  function visit(file: string, path: string[]) {
    if (active.has(file)) { cycles.push([...path, file].join(" → ")); return; }
    if (visited.has(file)) return;
    active.add(file);
    for (const next of graph.get(file) ?? []) visit(next, [...path, file]);
    active.delete(file); visited.add(file);
  }
  for (const file of graph.keys()) visit(file, []);
  expect(cycles).toEqual([]);
});
it.each([
  ["src/contract/model.ts", 'import type { View } from "../presentation/catalog.js";'],
  ["src/features/database/index.ts", 'export type { TestLinks } from "../test-links/schema.js";'],
  ["src/features/context/index.ts", 'export * from "../../presentation/catalog.js";'],
  ["src/support/source-map.ts", 'type Model = import("../contract/model.js").IR;'],
  ["src/application/load.ts", 'const fs = await import("node:fs/promises");'],
  ["src/features/database/index.ts", 'const fs = require("fs");'],
  ["src/adapters/filesystem/index.ts", 'import { execute } from "../../application/execute.js";'],
  ["src/adapters/filesystem/index.ts", 'import { databaseSchema } from "../../features/database/schema.js";'],
  ["src/cli/args.ts", 'import { validateContract } from "../contract/validation/index.js";'],
  ["src/presentation/catalog.ts", 'import { selectContext } from "../features/context/index.js";'],
  ["src/contract/model.ts", 'const dependency = import(name);'],
])("rejects forbidden dependency in %s: %s", (file, source) => {
  expect(violations(file, source).length).toBeGreaterThan(0);
});
it.each([
  ["src/contract/model.ts", 'export type { Contract } from "./input/schema.js";'],
  ["src/adapters/filesystem/index.ts", 'import { type Ports } from "../../application/ports.js";'],
  ["src/adapters/filesystem/index.ts", 'type Port = import("../../application/ports.js").Ports;'],
  ["src/features/database/index.ts", 'import { multiplicity } from "../../contract/multiplicity.js";'],
  ["src/presentation/catalog.ts", 'export { type ContextSelection } from "../features/context/index.js";'],
])("accepts allowed dependency in %s: %s", (file, source) => {
  expect(violations(file, source)).toEqual([]);
});
