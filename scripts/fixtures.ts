import { readFileSync, writeFileSync } from "node:fs";
import { stringify, parse, parseDocument, isMap, isSeq, type Node } from "yaml";
import { cases } from "../tests/cases.js";
import type { Contract } from "../src/contract/model.js";
const original = readFileSync("contracts/expenses/contract.yaml", "utf8"),
  base = parse(original) as Contract;
for (const test of cases) {
  const copy = structuredClone(base);
  test.change(copy);
  writeFileSync(`tests/fixtures/${test.name}.yaml`, stringify(copy));
}
writeFileSync(
  "tests/fixtures/duplicate-yaml-key.yaml",
  original.replace(
    "apiVersion: cca.dev/v1alpha1",
    "apiVersion: cca.dev/v1alpha1\napiVersion: cca.dev/v1alpha1",
  ),
);
const special = structuredClone(base);
special.metadata.name = '表示 "引用" [括弧] <script> & end\n日本語';
special.entities.forEach((e) => {
  e.name = special.metadata.name;
});
special.relationships.forEach((r) => {
  r.name = special.metadata.name;
});
special.commands.forEach((c) => {
  c.name = special.metadata.name;
});
writeFileSync("tests/fixtures/special-labels.yaml", stringify(special));
writeFileSync(
  "tests/fixtures/expected-diagnostics.json",
  JSON.stringify(
    cases.map(({ name, code, path }) => {
      const input = readFileSync(`tests/fixtures/${name}.yaml`, "utf8");
      let node: Node | null = parseDocument(input).contents;
      let offset = 0;
      for (let i = 0; i < path.length; i++) {
        const part = path[i]!;
        if (isMap(node)) {
          const pair = node.items.find((p) => String(p.key) === part)!;
          offset = (pair.key as Node).range![0];
          node = pair.value as Node | null;
        } else if (isSeq(node) && typeof part === "number") {
          node = node.items[part] as Node | null;
          offset = node!.range![0];
        }
      }
      const prefix = input.slice(0, offset).split("\n");
      return {
        name,
        code,
        path,
        line: prefix.length,
        column: prefix.at(-1)!.length + 1,
      };
    }),
    null,
    2,
  ) + "\n",
);
