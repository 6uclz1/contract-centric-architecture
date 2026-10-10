import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { compile } from "../src/contract/compile.js";
import { generate, managedFiles } from "../src/presentation/outputs.js";
import { nodeId, stateLabel } from "../src/presentation/diagrams/common.js";
import { anchor } from "../src/presentation/markdown.js";
import type { Contract } from "../src/contract/model.js";
const base = parse(
  readFileSync("tests/fixtures/expenses.yaml", "utf8"),
) as Contract;
const output = (c: Contract) => {
  const r = compile(stringify(c));
  expect(r.ir).toBeDefined();
  return generate(r.ir!);
};
const original = output(base);
const changed = (mutate: (c: Contract) => void) => {
  const c = structuredClone(base);
  mutate(c);
  const o = output(c);
  return managedFiles.filter((f) => o[f] !== original[f]).sort();
};
it("matches the hand-written expected model semantics", () => {
  const expected = JSON.parse(
    readFileSync("tests/expected/semantics.json", "utf8"),
  ) as {
    entities: string[];
    relationships: Record<
      string,
      {
        from: string;
        to: string;
        targetsPerSource: string;
        sourcesPerTarget: string;
      }
    >;
    transitions: Record<string, string[]>;
    approve: { pre: string[]; post: string[] };
  };
  for (const id of expected.entities)
    expect(original["model.mmd"]).toContain(nodeId("entity", id));
  for (const e of base.entities)
    for (const f of e.fields) {
      expect(original["model.mmd"]).toContain(`${f.type} ${f.id}`);
      expect(original["class.mmd"]).toContain(`${f.type} ${f.id}`);
    }
  for (const [id, r] of Object.entries(expected.relationships)) {
    expect(original["class.mmd"]).toContain(
      `${nodeId("entity", r.from)} "${r.sourcesPerTarget}" -- "${r.targetsPerSource}" ${nodeId("entity", r.to)}`,
    );
    expect(original["model.mmd"]).toContain(`%% relationship: ${id}`);
  }
  expect(original["model.mmd"]).toContain(
    `${nodeId("entity", "Expense")} ||..o| ${nodeId("entity", "Payment")}`,
  );
  const state = original["state.mmd"];
  for (const [id, [from, to, cmd]] of Object.entries(expected.transitions)) {
    expect(state).toContain(
      `${nodeId("state", "ExpenseLifecycle", from!)} --> ${nodeId("state", "ExpenseLifecycle", to!)} : ${stateLabel(`${id} / ${cmd}`)}`,
    );
  }
  expect(state).toContain(stateLabel("pre: EXP-001, EXP-002"));
  expect(state).toContain(stateLabel("post: EXP-003"));
  expect(state).not.toContain("EXP-004");
  expect(state).not.toContain("--> [*]");
  expect(state).toContain(
    `[*] --> ${nodeId("state", "ExpenseLifecycle", "draft")}`,
  );
  expect(original["class.mmd"]).toContain("<<Command>>");
  expect(original["class.mmd"]).toContain("<<Entity>>");
  expect(original["model.mmd"]).not.toMatch(/\b(PK|FK|UK)\b/);
});
it("catalog covers every structured definition and rule prose, with usable anchors", () => {
  const catalog = original["catalog.md"];
  for (const e of base.entities) {
    expect(catalog).toContain(e.id);
    for (const f of e.fields) expect(catalog).toContain(`| ${f.id} |`);
  }
  for (const r of base.rules) {
    expect(catalog).toContain(r.description);
    expect(catalog).toContain(`id="${anchor(r.id)}"`);
  }
  expect(catalog).toContain(`[EXP-001](#${anchor("EXP-001")})`);
  expect(catalog).toContain("ApprovalNotice");
  expect(catalog).toContain("PaymentReceiptUnique");
  expect(catalog).toContain("receiptNumber");
});
it.each([
  [0, 1, "|o", "o|"],
  [1, 1, "||", "||"],
  [0, "many", "}o", "o{"],
  [1, "many", "}|", "|{"],
] as const)(
  "preserves cardinality direction for %s..%s",
  (min, max, left, right) => {
    const c = structuredClone(base);
    c.relationships = [
      {
        ...c.relationships[2]!,
        targetsPerSource: { min, max },
        sourcesPerTarget: { min, max },
      },
    ];
    expect(output(c)["model.mmd"]).toContain(
      `${nodeId("entity", "Expense")} ${left}..${right} ${nodeId("entity", "Payment")}`,
    );
  },
);
it.each([
  [
    "resubmit",
    (c: Contract) =>
      c.stateMachines[0]!.transitions.push({
        id: "Resubmit",
        from: "rejected",
        to: "submitted",
        command: "SubmitExpense",
      }),
    ["catalog.md", "state.mmd"],
  ],
  [
    "command and precondition",
    (c: Contract) => {
      c.rules.push({
        id: "NewRule",
        kind: "precondition",
        scope: { kind: "entity", id: "Expense" },
        description: "New",
      });
      c.commands.push({
        id: "NewCommand",
        name: "New",
        target: "Expense",
        preconditions: ["NewRule"],
        postconditions: [],
        effects: [],
      });
      c.stateMachines[0]!.transitions.push({
        id: "NewTransition",
        from: "approved",
        to: "approved",
        command: "NewCommand",
      });
    },
    ["catalog.md", "class.mmd", "state.mmd"],
  ],
  [
    "field",
    (c: Contract) =>
      c.entities[1]!.fields.push({
        id: "memo",
        type: "string",
        required: false,
      }),
    ["catalog.md", "class.mmd", "model.mmd"],
  ],
  [
    "multiplicity",
    (c: Contract) => {
      c.relationships[2]!.targetsPerSource.max = "many";
    },
    ["catalog.md", "class.mmd", "model.mmd"],
  ],
  [
    "Rule prose",
    (c: Contract) => {
      c.rules[0]!.description = "Changed prose";
    },
    ["catalog.md"],
  ],
  [
    "Rule association",
    (c: Contract) => {
      c.commands[1]!.preconditions.shift();
    },
    ["catalog.md", "state.mmd"],
  ],
] as const)("changes exactly the appropriate outputs: %s", (_, edit, files) => {
  expect(changed(edit)).toEqual(files);
});
it("normalizes every set independently, without locale or input order", () => {
  const c = structuredClone(base);
  c.entities.reverse().forEach((e) => e.fields.reverse());
  c.relationships.reverse();
  c.stateMachines.reverse().forEach((m) => {
    m.states.reverse();
    m.transitions.reverse();
  });
  c.commands.reverse().forEach((cmd) => {
    cmd.preconditions.reverse();
    cmd.postconditions.reverse();
    cmd.effects.reverse();
  });
  c.rules.reverse();
  c.constraints.reverse().forEach((c) => c.fields.reverse());
  expect(output(c)).toEqual(original);
  expect(compile(stringify(c)).ir).toEqual(compile(stringify(base)).ir);
  const enums = structuredClone(base);
  enums.entities[0]!.fields.push({
    id: "choice",
    type: "enum",
    required: false,
    values: ["b", "a"],
  });
  const before = output(enums);
  const f = enums.entities[0]!.fields.at(-1)!;
  if (f.type === "enum") f.values.reverse();
  expect(output(enums)).toEqual(before);
});
it("IDs are collision-free across kinds and component scopes", () => {
  expect(
    new Set([
      nodeId("entity", "A"),
      nodeId("command", "A"),
      nodeId("state", "A-B", "C"),
      nodeId("state", "A", "B-C"),
      nodeId("state", "A", "C"),
    ]).size,
  ).toBe(5);
});
it("warning catalog is independent of input positions and filenames", () => {
  const c = structuredClone(base);
  c.stateMachines[0]!.states.push("z");
  const a = compile(stringify(c), "first.yaml").ir!;
  c.stateMachines[0]!.states.reverse();
  const b = compile(stringify(c), "second.yaml").ir!;
  expect(generate(a)).toEqual(generate(b));
  expect(generate(a)["catalog.md"]).not.toContain("first.yaml");
});
it("emits UTF8/LF with exactly one trailing newline", () => {
  for (const s of Object.values(original)) {
    expect(s.endsWith("\n")).toBe(true);
    expect(s.endsWith("\n\n")).toBe(false);
    expect(s).not.toContain("\r");
  }
});

it("catalog preserves enum value boundaries, quotes and escapes", () => {
  const c = structuredClone(base);
  const values = ["", "a, b", 'a"b', "a\\b", "line\nbreak"];
  c.entities[0]!.fields.push({
    id: "choice",
    type: "enum",
    required: true,
    values,
  });
  const catalog = output(c)["catalog.md"];
  expect(catalog).toContain(
    'enum ("", "a\\"b", "a, b", "a\\\\b", "line\\nbreak")'.replace(
      /\\/g,
      "&#92;",
    ),
  );
});

it("ER aliases cannot collide with real field IDs", () => {
  const c = structuredClone(base);
  c.entities[0]!.fields.push(
    { id: "PK", type: "string", required: true },
    { id: "cca_field_504b", type: "string", required: true },
  );
  const lines = output(c)
    ["model.mmd"].split("\n")
    .filter((line) => line.includes('"id: '));
  expect(lines).toHaveLength(2);
  expect(new Set(lines.map((line) => line.trim().split(/\s+/)[1])).size).toBe(
    2,
  );
  expect(lines.some((line) => line.includes("id: PK#59; required"))).toBe(true);
  expect(
    lines.some((line) => line.includes("id: cca_field_504b#59; required")),
  ).toBe(true);
});
