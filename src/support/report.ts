import type { Diagnostic } from "./diagnostics.js";
export interface ReportResult { diagnostics: Diagnostic[]; report?: string }
