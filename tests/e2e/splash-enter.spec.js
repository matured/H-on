const { test, expect } = require('@playwright/test');

// index.html's splash grid enters the site on click (any tile) or on any
// keypress anywhere on the page (not just Enter/Space, and not scoped to a
// focused element) — see the document-level keydown listener in index.html.
test.describe('Splash page — enter on click or any key', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('pressing an arbitrary key (not Enter/Space) enters the site', async ({ page }) => {
    await page.keyboard.press('a');
    await expect(page).toHaveURL(/catalog\.html$/);
  });

  test('clicking a tile enters the site', async ({ page }) => {
    await page.locator('.tile').first().click();
    await expect(page).toHaveURL(/catalog\.html$/);
  });

  test('modifier-held keys (Cmd/Ctrl/Alt) do not enter the site', async ({ page }) => {
    await page.keyboard.press('Control+r'); // would refresh, not enter, if it did anything
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/index\.html$|\/$/);
  });

  test('Tab does not enter the site and moves focus to the Skip link', async ({ page }) => {
    await page.keyboard.press('Tab'); // -> #splash-grid
    await page.keyboard.press('Tab'); // -> #hon-skip
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/index\.html$|\/$/);

    const focused = await page.evaluate(() => document.activeElement.id);
    expect(focused).toBe('hon-skip');
  });

  test('the Skip link itself still navigates on Enter, unraced by the any-key handler', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/catalog\.html$/);
  });
});
