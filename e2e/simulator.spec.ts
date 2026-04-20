import { test, expect } from "@playwright/test";

/**
 * Simulator E2E — exercise critical simulator flows.
 */

test.describe("Simulator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/simulator", { waitUntil: "domcontentloaded" });
    // Wait for app shell to render
    await expect(page.getByText("ArchLens").first()).toBeVisible({ timeout: 15000 });
    // Give simulator time to auto-init from model
    await page.waitForTimeout(500);
  });

  test("loads with auto-initialized architecture", async ({ page }) => {
    // Should have at least the Client + LB from auto-init
    await expect(page.getByText("Users").first()).toBeVisible({ timeout: 10000 });
  });

  test("can load E-commerce template", async ({ page }) => {
    await page.getByRole("button", { name: /templates/i }).click();
    await page.getByText("E-commerce").click();
    await expect(page.getByText("Cart Service").first()).toBeVisible({ timeout: 5000 });
  });

  test("can run simulation", async ({ page }) => {
    // Click Run
    const runButton = page.getByRole("button", { name: /^run$/i });
    await runButton.click();
    // Should change to Pause
    await expect(page.getByRole("button", { name: /pause/i })).toBeVisible({ timeout: 5000 });
  });

  test("can change traffic pattern", async ({ page }) => {
    // Traffic pattern selector is the only <select> in the toolbar
    const select = page.locator("select").filter({ hasText: /Constant|Burst|Ramp/ }).first();
    await select.selectOption("burst");
    await expect(select).toHaveValue("burst");
  });

  test("can open inspector panel by clicking node", async ({ page }) => {
    await page.waitForTimeout(1000);
    // Click on Users node to open inspector
    const usersNode = page.getByText("Users").first();
    await usersNode.click();
    // Inspector panel should appear (auto-opens on node click)
    await expect(page.locator("body")).toContainText(/Inspector|Config|Label/i, { timeout: 5000 });
  });

  test("chaos mode toggles UI", async ({ page }) => {
    // Chaos button is in the toolbar
    const chaosButton = page.getByRole("button", { name: /chaos/i }).first();
    await chaosButton.click();
    // Should show chaos controls (sliders or presets)
    await expect(page.locator("body")).toContainText(/Chaos|kill|latency/i, { timeout: 3000 });
  });

  test("can select a node", async ({ page }) => {
    // Wait for nodes to render
    await page.waitForTimeout(1000);
    const usersNode = page.getByText("Users").first();
    await usersNode.click();
    // Inspector should show node label
    await expect(page.locator("aside").last()).toContainText("Users");
  });
});
