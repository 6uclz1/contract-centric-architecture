import type { SourceMap } from "./source-map.js";
import { ascii } from "./order.js";
import { diagnostic, type Diagnostic, type Code } from "./diagnostics.js";
export type Parts = (string | number)[];
export function collector(source: SourceMap, diagnostics: Diagnostic[]) {
  return (code: Code, message: string, parts: Parts, elementId: string | null = null, severity: "error" | "warning" = "error") => {
    diagnostics.push({ ...diagnostic(code, message), severity, elementId, path: source.file, ...source.get(parts) });
  };
}
export const sameSet = (a: string[], b: string[]) => {
  const left = [...a].sort(ascii), right = [...b].sort(ascii);
  return left.length === right.length && left.every((v, i) => v === right[i]);
};
export function duplicates<T>(values: T[], key: (v: T) => string, report: (i: number, key: string) => void) {
  const seen = new Set<string>();
  values.forEach((value, i) => {
    const k = key(value);
    if (seen.has(k)) report(i, k);
    seen.add(k);
  });
}
