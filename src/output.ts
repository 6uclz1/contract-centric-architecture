import {
  lstat,
  readdir,
  readFile,
  mkdir,
  writeFile,
  rename,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { resolve, parse, join } from "node:path";
import { tmpdir } from "node:os";
import { managedFiles } from "./generators/index.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
type Outputs = Record<(typeof managedFiles)[number], string>;
const missing = (err: unknown) =>
  (err as NodeJS.ErrnoException).code === "ENOENT";
export async function inspectOutput(out: string): Promise<Diagnostic[]> {
  const abs = resolve(out),
    root = parse(abs).root;
  // Walk every ancestor, not just the final path; reject dangling links too.
  let current = root;
  for (const component of abs.slice(root.length).split("/").filter(Boolean)) {
    current = join(current, component);
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink())
        return [
          diagnostic("OUTPUT_SYMLINK", `Symlink output path: ${current}`),
        ];
      if (!st.isDirectory())
        return [
          diagnostic("IO_ERROR", `Output path is not a directory: ${current}`),
        ];
    } catch (e) {
      if (missing(e)) break;
      throw e;
    }
  }
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
  const d: Diagnostic[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isSymbolicLink())
      d.push(
        diagnostic("OUTPUT_SYMLINK", `Symlink output entry: ${entry.name}`),
      );
    else if (
      !managedFiles.includes(entry.name as (typeof managedFiles)[number]) ||
      !entry.isFile()
    )
      d.push(
        diagnostic(
          "OUTPUT_UNEXPECTED",
          `Unexpected output entry: ${entry.name}`,
        ),
      );
  }
  return d;
}
export async function writeOutputs(
  out: string,
  outputs: Outputs,
): Promise<Diagnostic[]> {
  const errors = await inspectOutput(out);
  if (errors.length) return errors;
  // All validation and all text generation have finished before writing anything.
  await mkdir(out, { recursive: true });
  // Stage outside the output directory so check can always identify four managed files.
  const staging = await mkdtemp(join(resolve(out, ".."), ".cca-stage-"));
  try {
    for (const file of managedFiles)
      await writeFile(join(staging, file), outputs[file], "utf8");
    const again = await inspectOutput(out);
    if (again.length) return again;
    for (const file of managedFiles)
      await rename(join(staging, file), join(out, file));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return [];
}
export async function checkOutputs(
  out: string,
  outputs: Outputs,
): Promise<Diagnostic[]> {
  const d = await inspectOutput(out);
  if (d.some((x) => x.code === "OUTPUT_SYMLINK" || x.code === "IO_ERROR"))
    return d;
  const staging = await mkdtemp(join(tmpdir(), "cca-check-"));
  try {
    for (const file of managedFiles) {
      await writeFile(join(staging, file), outputs[file], "utf8");
      try {
        const st = await lstat(join(out, file));
        if (!st.isFile()) continue;
        const actual = await readFile(join(out, file)),
          expected = await readFile(join(staging, file));
        if (!actual.equals(expected))
          d.push(
            diagnostic("OUTPUT_CHANGED", `Changed generated file: ${file}`),
          );
      } catch (e) {
        if (missing(e))
          d.push(
            diagnostic("OUTPUT_MISSING", `Missing generated file: ${file}`),
          );
        else throw e;
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return d;
}
