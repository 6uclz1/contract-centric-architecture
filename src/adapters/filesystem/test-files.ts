import { lstat, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import type { TestLinks } from "../../features/test-links/schema.js";
import type { TestFiles } from "../../features/test-links/evidence.js";
export async function inspectTestFiles(root: string, tests: TestLinks["tests"]): Promise<TestFiles> {
  const issues: TestFiles["issues"] = [];
  const add = (index: number, message: string) => issues.push({ index, message });
  const rootPath = await realpath(root);
  if (!(await stat(rootPath)).isDirectory()) throw new Error("Test root must be a directory");
  const files = new Map<string, string>();
  for (const [i, t] of tests.entries()) {
    const p = resolve(rootPath, t.file);
    const inside = (target: string) => { const r = relative(rootPath, target); return r !== ".." && !r.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(r); };
    if (isAbsolute(t.file) || !inside(p)) { add(i, "Test file must be relative and inside --root"); continue; }
    try {
      const actual = await realpath(p);
      if (!inside(actual) || !(await lstat(actual)).isFile()) { add(i, "Test file must resolve to a regular file inside --root"); continue; }
      files.set(t.id, actual);
    } catch (e) {
      if (!["ENOENT", "ENOTDIR", "ELOOP"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
      add(i, `Test file unavailable: ${t.file}`);
    }
  }
  return { rootPath, files, issues };
}
