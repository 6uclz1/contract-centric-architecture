import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Ports } from "../../application/ports.js";
import { checkOutputs, writeOutputs } from "./outputs.js";
export const filesystem: Pick<Ports, "resolvePath" | "readText" | "checkOutputs" | "writeOutputs"> = {
  resolvePath: resolve,
  readText: (file) => readFile(file, "utf8"),
  checkOutputs,
  writeOutputs,
};
