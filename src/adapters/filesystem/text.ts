import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}
