import { parseAllDocuments, isAlias, isMap, isSeq, isScalar, LineCounter, type Node } from "yaml";
import type { z } from "zod";
import { stableDiagnostics, type Diagnostic, type Code } from "../diagnostics.js";
import { SourceMap } from "../source-map.js";
export function parseInput<T>(
  input: string,
  file: string,
  schema: z.ZodType<T>,
  apiVersion: string,
): { value?: T; source: SourceMap; diagnostics: Diagnostic[] } {
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
    raw.apiVersion !== apiVersion
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
  const checked = schema.safeParse(raw);
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
  return { value: checked.data, source, diagnostics: [] };
}
