import { compareContracts } from "../../features/review/index.js";
import type { IR } from "../../contract/model.js";
import { generate } from "../../presentation/outputs.js";
import { renderReview } from "../../presentation/reports/review.js";
import { ascii } from "../../support/order.js";
import { load, type Loaded } from "../load.js";
import type { Ports } from "../ports.js";
import type { Request } from "../request.js";
import type { Result } from "../result.js";
export async function review(request: Extract<Request, { command: "review" }>, loaded: Loaded, ports: Ports): Promise<Result> {
  const before = await load(request.before, request.strict, ports);
  const diagnostics = [...before.diagnostics, ...loaded.diagnostics];
  if ("exitCode" in before) return { exitCode: 1, diagnostics };
  return { exitCode: 0, diagnostics, report: reviewReport(before.ir, loaded.ir) };
}

export function reviewReport(before: IR, after: IR): string {
  const a = generate(before), b = generate(after);
  const changed = Object.keys(a).filter((key) => a[key as keyof typeof a] !== b[key as keyof typeof b]).sort(ascii);
  return renderReview(before, after, compareContracts(before, after), changed);
}
