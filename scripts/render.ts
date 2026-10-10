import { readFile, mkdir, writeFile } from "node:fs/promises";
import { mermaidBrowser } from "./browser.js";
const { browser, page } = await mermaidBrowser();
try {
  await mkdir(".artifacts/render", { recursive: true });
  for (const file of ["model", "class", "state"]) {
    const source = await readFile(
      `docs/generated/expenses/${file}.mmd`,
      "utf8",
    );
    const svg = await page.evaluate(
      async ({ source, file }) => {
        const m = (
          window as unknown as {
            mermaid: {
              render: (id: string, s: string) => Promise<{ svg: string }>;
            };
          }
        ).mermaid;
        const { svg } = await m.render(`render_${file}`, source);
        document.getElementById("diagram")!.innerHTML = svg;
        return svg;
      },
      { source, file },
    );
    await writeFile(`.artifacts/render/${file}.svg`, svg);
    await page
      .locator("#diagram")
      .screenshot({ path: `.artifacts/render/${file}.png` });
  }
} finally {
  await browser.close();
}
