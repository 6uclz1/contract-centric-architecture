import { chromium } from "playwright";
import { resolve } from "node:path";
export async function mermaidBrowser() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
  });
  await page.setContent(
    '<!doctype html><html><body><div id="diagram"></div></body></html>',
  );
  await page.addScriptTag({
    path: resolve("node_modules/mermaid/dist/mermaid.min.js"),
  });
  await page.evaluate(() => {
    (
      window as unknown as { mermaid: { initialize: (v: unknown) => void } }
    ).mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
    });
  });
  return { browser, page };
}
