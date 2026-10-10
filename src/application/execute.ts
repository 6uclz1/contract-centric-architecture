import type { Request } from "./request.js";
import type { Ports } from "./ports.js";
import type { Result } from "./result.js";
import { load } from "./load.js";
import { validate } from "./commands/validate.js";
import { outputs } from "./commands/outputs.js";
import { review } from "./commands/review.js";
import { context } from "./commands/context.js";
import { testLinksCommand } from "./commands/test-links.js";
import { dbCheck } from "./commands/database.js";
export async function execute(request: Request, ports: Ports): Promise<Result> {
  const loaded = await load(request.input, request.strict, ports);
  if ("exitCode" in loaded) return loaded;
  switch (request.command) {
    case "validate": return validate(loaded);
    case "generate": case "check": return outputs(request, loaded, ports);
    case "review": return review(request, loaded, ports);
    case "context": return context(request, loaded);
    case "test-links": return testLinksCommand(request, loaded, ports);
    case "db-check": return dbCheck(request, loaded, ports);
  }
}
