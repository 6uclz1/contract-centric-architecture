export type Code =
  | "YAML_INVALID"
  | "SCHEMA_INVALID"
  | "VERSION_UNSUPPORTED"
  | "ID_DUPLICATE"
  | "REF_NOT_FOUND"
  | "FIELD_NOT_FOUND"
  | "STATE_INVALID"
  | "MACHINE_BINDING_INVALID"
  | "TRANSITION_AMBIGUOUS"
  | "COMMAND_TARGET_MISMATCH"
  | "RULE_KIND_MISMATCH"
  | "RULE_SCOPE_MISMATCH"
  | "CONSTRAINT_INVALID"
  | "STATE_UNREACHABLE"
  | "RULE_UNUSED"
  | "CLI_INVALID"
  | "IO_ERROR"
  | "GENERATION_ERROR"
  | "OUTPUT_UNEXPECTED"
  | "OUTPUT_SYMLINK"
  | "OUTPUT_MISSING"
  | "OUTPUT_CHANGED";
export interface Diagnostic {
  code: Code;
  severity: "error" | "warning";
  message: string;
  elementId: string | null;
  path: string | null;
  line: number | null;
  column: number | null;
}
export const ascii = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
export function stableDiagnostics(d: Diagnostic[]): Diagnostic[] {
  return d.sort(
    (a, b) =>
      ascii(a.path ?? "", b.path ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      ascii(a.code, b.code) ||
      ascii(a.elementId ?? "", b.elementId ?? "") ||
      ascii(a.message, b.message),
  );
}
export const diagnostic = (code: Code, message: string): Diagnostic => ({
  code,
  severity: "error",
  message,
  elementId: null,
  path: null,
  line: null,
  column: null,
});
