import { selectContext, type ContextKind } from "../../features/context/index.js";
import type { IR } from "../../contract/model.js";
import { renderContext } from "../../presentation/reports/context.js";
import { diagnostic } from "../../support/diagnostics.js";
import type { Loaded } from "../load.js";
import type { Request } from "../request.js";
import type { Result } from "../result.js";
export function context(request: Extract<Request, { command: "context" }>, loaded: Loaded): Result {
  const report = contextReport(loaded.ir, request.kind, request.id);
  if (!report) return { exitCode: 1, diagnostics: [...loaded.diagnostics, { ...diagnostic("REF_NOT_FOUND", `Unknown ${request.kind}: ${request.id}`), elementId: request.id }] };
  return { exitCode: 0, diagnostics: loaded.diagnostics, report };
}

export function contextReport(ir: IR, kind: ContextKind, id: string): string | undefined {
  const selected = selectContext(ir, kind, id);
  return selected ? renderContext(ir, selected) : undefined;
}
