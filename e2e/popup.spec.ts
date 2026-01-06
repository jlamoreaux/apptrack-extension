import { test, expect } from "@playwright/test";

// Note: E2E testing for browser extensions requires special setup
// This is a placeholder for when extension testing is configured

test.describe("Popup", () => {
  test.skip("should show login button when not authenticated", async ({ page }) => {
    // Extension E2E tests would load the popup.html directly
    // For now, this is a placeholder
    await page.goto("/src/popup/index.html");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test.skip("should show loading state initially", async ({ page }) => {
    await page.goto("/src/popup/index.html");
    // The popup should show a loading spinner while checking auth
  });
});
