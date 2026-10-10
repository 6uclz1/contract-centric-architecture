import { it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { compile } from "../src/contract/compile.js";
import { generate } from "../src/presentation/outputs.js";
import { mermaidBrowser } from "../scripts/browser.js";
let context: Awaited<ReturnType<typeof mermaidBrowser>>;
beforeAll(async () => {
  context = await mermaidBrowser();
}, 30000);
afterAll(async () => {
  await context?.browser.close();
});
it.each(["expenses", "special-labels"])(
  "parses and renders all three diagram types: %s",
  async (name) => {
    const output = generate(
      compile(readFileSync(`tests/fixtures/${name}.yaml`, "utf8")).ir!,
    );
    for (const file of ["model.mmd", "class.mmd", "state.mmd"] as const) {
      const result = await context.page.evaluate(
        async ({ source, file }) => {
          const m = (
            window as unknown as {
              mermaid: {
                parse: (s: string) => Promise<unknown>;
                render: (id: string, s: string) => Promise<{ svg: string }>;
              };
            }
          ).mermaid;
          await m.parse(source);
          const { svg } = await m.render(
            `diagram_${file.replace(".", "_")}`,
            source,
          );
          const text =
            new DOMParser().parseFromString(svg, "image/svg+xml")
              .documentElement.textContent ?? "";
          return { svg, text };
        },
        { source: output[file], file },
      );
      expect(result.svg).toContain("<svg");
      expect(result.svg).not.toContain("<script>");
      if (name === "special-labels" && file !== "state.mmd") {
        expect(result.text).toContain(
          '表示 "引用" [括弧] <script> & end 日本語',
        );
      }
    }
  },
  30000,
);
it("renders empty Contract diagrams", async () => {
  const r = compile(
    "apiVersion: cca.dev/v1alpha1\nmetadata: {id: Empty, name: Empty}\nentities: []\nrelationships: []\nstateMachines: []\ncommands: []\nrules: []\nconstraints: []\n",
  );
  const out = generate(r.ir!);
  for (const file of ["model.mmd", "class.mmd", "state.mmd"] as const)
    await context.page.evaluate(async (source) => {
      const m = (
        window as unknown as {
          mermaid: {
            parse: (s: string) => Promise<unknown>;
            render: (id: string, s: string) => Promise<{ svg: string }>;
          };
        }
      ).mermaid;
      await m.parse(source);
      await m.render("emptyDiagram", source);
    }, out[file]);
});
it.each(["model-small", "class-small", "state-small"])(
  "parses hand-written reference %s",
  async (name) => {
    await context.page.evaluate(
      async (source) => {
        const m = (
          window as unknown as {
            mermaid: { parse: (s: string) => Promise<unknown> };
          }
        ).mermaid;
        await m.parse(source);
      },
      readFileSync(`tests/expected/${name}.mmd`, "utf8"),
    );
  },
);

it.each(["model", "class", "state"])(
  "parses and renders hand-written baseline %s",
  async (name) => {
    await context.page.evaluate(
      async ({ source, name }) => {
        const m = (
          window as unknown as {
            mermaid: {
              parse: (s: string) => Promise<unknown>;
              render: (id: string, s: string) => Promise<{ svg: string }>;
            };
          }
        ).mermaid;
        await m.parse(source);
        await m.render(`baseline_${name}`, source);
      },
      {
        source: readFileSync(`docs/evaluation/baseline/${name}.mmd`, "utf8"),
        name,
      },
    );
  },
);

it("renders multiple machine scopes, all types, ASCII edge IDs and reserved display text", async () => {
  const source = `apiVersion: cca.dev/v1alpha1
metadata: {id: All, name: end}
entities:
  - id: E-one
    name: class
    fields:
      - {id: end, type: string, required: false}
      - {id: field-one, type: integer, required: true}
      - {id: choice, type: enum, values: ['a [ ]', 'b < >'], required: true}
      - {id: time, type: datetime, required: true}
      - {id: date_one, type: date, required: false}
      - {id: flag, type: boolean, required: true}
      - {id: state-one, type: state, machine: M-one, required: true}
  - id: E_two
    name: stateDiagram-v2
    fields:
      - {id: state_two, type: state, machine: M_two, required: true}
relationships:
  - {id: R-one, name: 'role "x" <b> & end', from: E-one, to: E_two, targetsPerSource: {min: 1, max: many}, sourcesPerTarget: {min: 0, max: 1}}
commands:
  - {id: C-one, name: 'class [x]', target: E-one, preconditions: [], postconditions: [], effects: []}
stateMachines:
  - {id: M-one, entity: E-one, field: state-one, states: [end], initial: end, transitions: [{id: T-one, from: end, to: end, command: C-one}]}
  - {id: M_two, entity: E_two, field: state_two, states: [end], initial: end, transitions: []}
rules: []
constraints: []
`;
  const c = compile(source);
  expect(c.diagnostics).toEqual([]);
  const outputs = generate(c.ir!);
  for (const file of ["model.mmd", "class.mmd", "state.mmd"] as const)
    await context.page.evaluate(
      async ({ source, file }) => {
        const m = (
          window as unknown as {
            mermaid: {
              render: (id: string, s: string) => Promise<{ svg: string }>;
            };
          }
        ).mermaid;
        await m.render(`complex_${file.replace(".", "_")}`, source);
      },
      { source: outputs[file], file },
    );
});

it.each([
  "PK",
  "FK",
  "UK",
  "pk",
  "fk",
  "uk",
  "Pk",
  "fK",
  "Uk",
  "PK-field",
  "fk-field",
  "UK-field",
  "cca_field_504b",
])(
  "renders ER field ID %s and preserves the original ID in its comment",
  async (fieldId) => {
    const source = `apiVersion: cca.dev/v1alpha1
metadata: {id: Reserved, name: Reserved}
entities:
  - id: Entity
    name: Entity
    fields:
      - {id: ${fieldId}, type: string, required: true}
relationships: []
stateMachines: []
commands: []
rules: []
constraints: []
`;
    const compiled = compile(source);
    expect(compiled.diagnostics).toEqual([]);
    const diagram = generate(compiled.ir!)["model.mmd"];
    const text = await context.page.evaluate(async (source) => {
      const m = (
        window as unknown as {
          mermaid: {
            render: (id: string, text: string) => Promise<{ svg: string }>;
          };
        }
      ).mermaid;
      const { svg } = await m.render("reservedField", source);
      return new DOMParser().parseFromString(svg, "image/svg+xml")
        .documentElement.textContent;
    }, diagram);
    expect(text).toContain(fieldId);
  },
);
