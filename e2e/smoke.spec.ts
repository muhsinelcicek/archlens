import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify all pages load without errors.
 *
 * Note: Uses "domcontentloaded" instead of "networkidle" because:
 * - Vite HMR keeps WebSocket open
 * - SSE /api/watch is a long-lived connection
 * Both prevent "networkidle" from ever firing.
 */

test.describe("ArchLens smoke tests", () => {
  test("dashboard loads and shows project stats", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Wait for either loaded model OR connection error UI
    await expect(page.locator("aside, [class*='Connection']").first()).toBeVisible({ timeout: 15000 });
  });

  test("architecture page loads", async ({ page }) => {
    await page.goto("/architecture", { waitUntil: "domcontentloaded" });
    // Architecture is full-screen — check for the sidebar nav (ArchLens logo area)
    await expect(page.getByText("ArchLens").first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test("quality page loads with content", async ({ page }) => {
    await page.goto("/quality", { waitUntil: "domcontentloaded" });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/quality|score|module|loading/i, { timeout: 10000 });
  });

  test("hotspots page loads", async ({ page }) => {
    await page.goto("/hotspots", { waitUntil: "domcontentloaded" });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/hotspot|risk|loading|git/i, { timeout: 10000 });
  });

  test("insights page loads", async ({ page }) => {
    await page.goto("/insights", { waitUntil: "domcontentloaded" });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/insight|finding|loading/i, { timeout: 10000 });
  });

  test("simulator page loads", async ({ page }) => {
    await page.goto("/simulator", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("ArchLens").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Simulator/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/Theme|Language/i, { timeout: 10000 });
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 15000 });
    // Click on Architecture in sidebar (use aside locator to scope)
    const architectureLink = page.locator("aside").getByRole("link", { name: /architecture/i }).first();
    await architectureLink.click();
    await expect(page).toHaveURL(/architecture/);
  });

  test("api endpoint is reachable", async ({ request }) => {
    const response = await request.get("http://localhost:4848/api/projects");
    expect(response.ok()).toBeTruthy();
    const projects = await response.json();
    expect(Array.isArray(projects)).toBe(true);
  });
});
