import { chromium } from "@playwright/test";

const BASE = "http://localhost:4849";
const OUT = "docs/img";

const pages = [
  { name: "dashboard", path: "/", wait: 3000 },
  { name: "architecture", path: "/architecture", wait: 4000 },
  { name: "simulator", path: "/simulator", wait: 2000 },
  { name: "insights", path: "/insights", wait: 3000 },
  { name: "quality", path: "/quality", wait: 3000 },
  { name: "flows", path: "/flows", wait: 2000 },
  { name: "settings", path: "/settings", wait: 1000 },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });

  for (const p of pages) {
    const page = await context.newPage();
    console.log(`📸 ${p.name}...`);
    await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(p.wait);
    await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: false });
    await page.close();
  }

  await browser.close();
  console.log("✅ Done — screenshots saved to docs/img/");
})();
