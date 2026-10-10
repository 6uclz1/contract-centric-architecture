import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stringify, parse } from "yaml";
import { compile } from "../src/contract/compile.js";
import { cases } from "./cases.js";
import type { Contract } from "../src/contract/model.js";
const fixture = (name: string) =>
  readFileSync(`tests/fixtures/${name}.yaml`, "utf8");
const base = parse(fixture("expenses")) as Contract;
const expectedDiagnostics = JSON.parse(
  readFileSync("tests/fixtures/expected-diagnostics.json", "utf8"),
) as { name: string; code: string; line: number; column: number }[];
describe("staged parsing, reference validation and precise diagnostics", () => {
  it("accepts the exact plan fixture without warnings", () => {
    const r = compile(fixture("expenses"));
    expect(r.diagnostics).toEqual([]);
    expect(r.ir?.entities).toHaveLength(3);
    expect(fixture("expenses")).toBe(
      readFileSync("contracts/expenses/contract.yaml", "utf8"),
    );
  });
  it.each(cases)("$name gives $code at the defective property", (test) => {
    const input = fixture(test.name),
      r = compile(input, "fixture.yaml");
    const loc = expectedDiagnostics.find((d) => d.name === test.name)!;
    expect(r.ir).toBeUndefined();
    expect(r.diagnostics).toContainEqual(
      expect.objectContaining({
        code: test.code,
        severity: "error",
        path: "fixture.yaml",
        line: loc?.line,
        column: loc?.column,
      }),
    );
    expect(loc?.line).toBeGreaterThan(0);
    expect(loc?.column).toBeGreaterThan(0);
    // Independent defect fixture: regenerating from the baseline produces exactly the stored input.
    const copy = structuredClone(base);
    test.change(copy);
    expect(input).toBe(stringify(copy));
  });
  it("checks SourceMap by kind, scoped ID and property", () => {
    const r = compile(fixture("expenses"), "a.yaml");
    expect(r.source.element("fields", "Expense.status", ["machine"])).toEqual({
      path: "a.yaml",
      line: 17,
      column: 36,
    });
  });
  it.each([
    ["duplicate keys", fixture("duplicate-yaml-key")],
    ["alias", "apiVersion: &a cca.dev/v1alpha1\nmetadata: *a"],
    ["anchor", "apiVersion: &a cca.dev/v1alpha1"],
    ["merge", "metadata: { <<: { id: x } }"],
    ["tag", "metadata: !thing x"],
    ["standard explicit tag", "metadata: !!str x"],
    ["multiple documents", "---\n{}\n---\n{}"],
    ["syntax", "entities: ["],
    ["directive", "%YAML 1.1\n---\n{}"],
  ])("rejects unsupported YAML: %s", (_, input) => {
    const r = compile(input);
    expect(r.ir).toBeUndefined();
    expect(r.diagnostics.every((d) => d.code === "YAML_INVALID")).toBe(true);
    expect(r.diagnostics[0]?.line).toBeGreaterThan(0);
  });
  it("does not coerce or strip input and requires arrays", () => {
    for (const edit of [
      (c: Contract) => delete (c as Partial<Contract>).commands,
      (c: Contract) =>
        Object.assign(c.entities[0]!.fields[0]!, { required: "true" }),
      (c: Contract) =>
        Object.assign(c.entities[0]!.fields[0]!, { values: ["x"] }),
    ]) {
      const c = structuredClone(base);
      edit(c);
      const r = compile(stringify(c));
      expect(r.diagnostics.every((d) => d.code === "SCHEMA_INVALID")).toBe(
        true,
      );
    }
  });
  it("allows empty top-level arrays, unicode text, enum and conceptual date", () => {
    const c: Contract = {
      apiVersion: base.apiVersion,
      metadata: base.metadata,
      entities: [],
      relationships: [],
      commands: [],
      rules: [],
      constraints: [],
      stateMachines: [],
    };
    expect(compile(stringify(c)).diagnostics).toEqual([]);
    c.entities.push({
      id: "E",
      name: "空",
      fields: [
        { id: "choice", type: "enum", required: false, values: ["a", "b"] },
        { id: "day", type: "date", required: true },
      ],
    });
    expect(compile(stringify(c)).diagnostics).toEqual([]);
  });
  it("enforces global transition IDs, per-command effect IDs, one machine per entity", () => {
    const c = structuredClone(base);
    c.stateMachines[0]!.transitions[1]!.id = "Submit";
    expect(compile(stringify(c)).diagnostics[0]?.code).toBe("ID_DUPLICATE");
    const e = structuredClone(base);
    e.commands[1]!.effects.push({ ...e.commands[1]!.effects[0]! });
    expect(compile(stringify(e)).diagnostics[0]?.code).toBe("ID_DUPLICATE");
    const m = structuredClone(base);
    m.stateMachines.push({
      ...structuredClone(m.stateMachines[0]!),
      id: "Other",
      transitions: [],
    });
    expect(
      compile(stringify(m)).diagnostics.some(
        (d) => d.code === "MACHINE_BINDING_INVALID",
      ),
    ).toBe(true);
  });
  it("allows non-transition commands, self-transitions and reuse from different sources", () => {
    const c = structuredClone(base);
    c.commands.push({
      id: "Inspect",
      name: "Inspect",
      target: "Expense",
      preconditions: [],
      postconditions: [],
      effects: [],
    });
    c.stateMachines[0]!.transitions.push(
      {
        id: "Resubmit",
        from: "rejected",
        to: "submitted",
        command: "SubmitExpense",
      },
      { id: "InspectSelf", from: "draft", to: "draft", command: "Inspect" },
    );
    expect(compile(stringify(c)).diagnostics).toEqual([]);
  });
  it("warns about graph-only reachability and unused pre/post, not invariant", () => {
    const c = structuredClone(base);
    c.stateMachines[0]!.states.push("unreachable");
    c.commands[1]!.preconditions.shift();
    const r = compile(stringify(c));
    expect(r.ir).toBeDefined();
    expect(r.diagnostics.map((d) => d.code).sort()).toEqual([
      "RULE_UNUSED",
      "STATE_UNREACHABLE",
    ]);
  });
  it("does not infer prose contradictions from cardinality", () => {
    const c = structuredClone(base);
    c.relationships[2]!.targetsPerSource.max = "many";
    expect(compile(stringify(c)).diagnostics).toEqual([]);
  });
  it("rejects unsupported display controls at a position", () => {
    const c = structuredClone(base);
    c.entities[0]!.name = "bad\u0000";
    const r = compile(stringify(c));
    expect(r.diagnostics[0]?.code).toBe("SCHEMA_INVALID");
    expect(r.diagnostics[0]?.line).toBeGreaterThan(0);
  });
});

it("rejects anchors on mapping keys and keeps YAML failure isolated", () => {
  const r = compile("&key apiVersion: cca.dev/v1alpha1\nmetadata: {}\n");
  expect(r.ir).toBeUndefined();
  expect(r.diagnostics.every((d) => d.code === "YAML_INVALID")).toBe(true);
});
it("rejects each definition namespace duplicate", () => {
  for (const kind of [
    "relationships",
    "commands",
    "rules",
    "constraints",
    "stateMachines",
  ] as const) {
    const c = structuredClone(base);
    const list = c[kind] as { id: string }[];
    list.push(structuredClone(list[0]!));
    const r = compile(stringify(c));
    expect(r.diagnostics[0]?.code).toBe("ID_DUPLICATE");
  }
});
it("resolves references by kind even when IDs coincide", () => {
  const c = structuredClone(base);
  c.entities[0]!.id = "Same";
  c.relationships.forEach((r) => {
    if (r.to === "User") r.to = "Same";
  });
  c.rules.push({
    id: "Same",
    kind: "invariant",
    scope: { kind: "entity", id: "Same" },
    description: "Same name",
  });
  expect(compile(stringify(c)).diagnostics).toEqual([]);
  c.commands[0]!.preconditions = ["User"];
  expect(
    compile(stringify(c)).diagnostics.some((d) => d.code === "REF_NOT_FOUND"),
  ).toBe(true);
});
it("reports unknown root keys at their own location and before references", () => {
  const input = fixture("expenses") + "unknown: true\n";
  const r = compile(input, "root.yaml");
  expect(r.diagnostics).toHaveLength(1);
  expect(r.diagnostics[0]).toMatchObject({
    code: "SCHEMA_INVALID",
    elementId: null,
    line: input.trimEnd().split("\n").length,
    column: 1,
  });
});
