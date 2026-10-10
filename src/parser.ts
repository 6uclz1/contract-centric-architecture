import {
  parseAllDocuments,
  isAlias,
  isMap,
  isSeq,
  isScalar,
  LineCounter,
  type Node,
} from "yaml";
import { contractSchema, type Contract } from "./schema.js";
import {
  stableDiagnostics,
  type Diagnostic,
  type Code,
} from "./diagnostics.js";
type Location = { path: string; line: number; column: number };
export class SourceMap {
  private locations = new Map<string, Location>();
  private elements = new Map<string, (string | number)[]>();
  constructor(public readonly file: string) {}
  set(parts: (string | number)[], loc: Location) {
    this.locations.set(JSON.stringify(parts), loc);
  }
  bind(kind: string, id: string, parts: (string | number)[]) {
    this.elements.set(JSON.stringify([kind, id]), parts);
  }
  get(parts: (string | number)[]): Location | undefined {
    for (let p = parts; ; p = p.slice(0, -1)) {
      const loc = this.locations.get(JSON.stringify(p));
      if (loc) return loc;
      if (!p.length) return undefined;
    }
  }
  element(kind: string, id: string, property: (string | number)[] = []) {
    const p = this.elements.get(JSON.stringify([kind, id]));
    return p ? this.get([...p, ...property]) : undefined;
  }
}
export interface Parsed {
  contract?: Contract;
  source: SourceMap;
  diagnostics: Diagnostic[];
}
export function parseContract(input: string, file = "contract.yaml"): Parsed {
  const source = new SourceMap(file),
    diagnostics: Diagnostic[] = [],
    lines = new LineCounter();
  const add = (
    code: Code,
    message: string,
    offset: number,
    elementId: string | null = null,
  ) =>
    diagnostics.push({
      code,
      severity: "error",
      message,
      elementId,
      path: file,
      ...position(offset),
    });
  const position = (offset: number) => {
    const p = lines.linePos(offset);
    return { line: p.line, column: p.col };
  };
  const docs = parseAllDocuments(input, {
    lineCounter: lines,
    uniqueKeys: true,
    strict: true,
    version: "1.2",
  });
  if (docs.length !== 1)
    add("YAML_INVALID", "Exactly one YAML document is required", 0);
  for (const doc of docs) {
    for (const err of doc.errors) add("YAML_INVALID", err.message, err.pos[0]);
    for (const warn of doc.warnings)
      add("YAML_INVALID", warn.message, warn.pos[0]);
    if (
      doc.directives?.yaml.explicit ||
      Object.keys(doc.directives?.tags ?? {}).some((k) => k !== "!!")
    )
      add("YAML_INVALID", "YAML directives are unsupported", 0);
    const walk = (node: Node | null, parts: (string | number)[]) => {
      if (!node) return;
      const offset = node.range?.[0] ?? 0;
      source.set(parts, { path: file, ...position(offset) });
      if (isAlias(node)) {
        add("YAML_INVALID", "Aliases are unsupported", offset);
        return;
      }
      if (node.anchor || node.tag)
        add(
          "YAML_INVALID",
          "Anchors and explicit tags are unsupported",
          offset,
        );
      if (isMap(node))
        for (const pair of node.items) {
          if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
            add(
              "YAML_INVALID",
              "Mapping keys must be strings",
              (pair.key as Node | null)?.range?.[0] ?? offset,
            );
            continue;
          }
          if (pair.key.anchor || pair.key.tag)
            add(
              "YAML_INVALID",
              "Anchors and explicit tags on keys are unsupported",
              pair.key.range?.[0] ?? offset,
            );
          if (pair.key.value === "<<")
            add(
              "YAML_INVALID",
              "Merge keys are unsupported",
              pair.key.range?.[0] ?? offset,
            );
          const p = [...parts, pair.key.value];
          walk(pair.value as Node | null, p);
          // Point properties at their key, including unknown keys and missing/null values.
          source.set(p, {
            path: file,
            ...position(pair.key.range?.[0] ?? offset),
          });
        }
      if (isSeq(node))
        node.items.forEach((v, i) => walk(v as Node | null, [...parts, i]));
    };
    walk(doc.contents, []);
  }
  if (diagnostics.length)
    return { source, diagnostics: stableDiagnostics(diagnostics) };
  const raw: unknown = docs[0]!.toJS({ maxAliasCount: 0 });
  if (
    raw &&
    typeof raw === "object" &&
    "apiVersion" in raw &&
    typeof raw.apiVersion === "string" &&
    raw.apiVersion !== "cca.dev/v1alpha1"
  ) {
    diagnostics.push({
      code: "VERSION_UNSUPPORTED",
      severity: "error",
      message: `Unsupported apiVersion: ${raw.apiVersion}`,
      elementId: null,
      path: file,
      line: null,
      column: null,
      ...source.get(["apiVersion"]),
    });
    return { source, diagnostics };
  }
  const checked = contractSchema.safeParse(raw);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      const parts = issue.path.filter(
        (v): v is string | number =>
          typeof v === "string" || typeof v === "number",
      );
      const targets =
        issue.code === "unrecognized_keys"
          ? issue.keys.map((k) => [...parts, k])
          : [parts];
      for (const p of targets) {
        let elementId: string | null = null,
          cursor: unknown = raw;
        for (const part of p) {
          if (
            cursor &&
            typeof cursor === "object" &&
            "id" in cursor &&
            typeof cursor.id === "string"
          )
            elementId = cursor.id;
          cursor =
            cursor && typeof cursor === "object"
              ? (cursor as Record<string | number, unknown>)[part]
              : undefined;
        }
        diagnostics.push({
          code: "SCHEMA_INVALID",
          severity: "error",
          message: issue.message,
          elementId,
          path: file,
          line: null,
          column: null,
          ...source.get(p),
        });
      }
    }
    return { source, diagnostics: stableDiagnostics(diagnostics) };
  }
  const contract = checked.data;
  for (const kind of [
    "entities",
    "relationships",
    "stateMachines",
    "commands",
    "rules",
    "constraints",
  ] as const)
    contract[kind].forEach((v, i) => {
      source.bind(kind, v.id, [kind, i]);
      if (kind === "entities")
        contract.entities[i]!.fields.forEach((f, j) =>
          source.bind("fields", `${v.id}.${f.id}`, [kind, i, "fields", j]),
        );
      if (kind === "stateMachines")
        contract.stateMachines[i]!.states.forEach((s, j) =>
          source.bind("states", `${v.id}.${s}`, [kind, i, "states", j]),
        );
      if (kind === "stateMachines")
        contract.stateMachines[i]!.transitions.forEach((t, j) =>
          source.bind("transitions", t.id, [kind, i, "transitions", j]),
        );
      if (kind === "commands")
        contract.commands[i]!.effects.forEach((e, j) =>
          source.bind("effects", `${v.id}.${e.id}`, [kind, i, "effects", j]),
        );
    });
  return { contract, source, diagnostics: [] };
}
