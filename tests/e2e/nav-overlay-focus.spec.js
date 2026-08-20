const { test, expect } = require('@playwright/test');

// The black-circle -> fullscreen overlay nav is injected by js/main.js
// (honInjectNav) on every page except index.html (the splash has no site
// chrome) — home.html needs no backend mocking to exercise it, unlike
// catalog.html/membership.html/admin.html.
test.describe('Fullscreen nav overlay — focus management', () => {
  test('overlay links are not tabbable while closed, even though they sit off-screen rather than display:none', async ({ page }) => {
    await page.goto('/home.html');
    const overlay = page.locator('.menu-overlay');
    await expect(overlay).toHaveAttribute('inert', '');

    // Confirms the fix, not just the attribute: keyboard-only Tab traversal
    // from the top of the document must never land inside the overlay while
    // it's closed. Before this fix, the overlay's links were transformed
    // off-screen (translateY(-100%)) but still in normal tab order.
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // menu button
    const onMenuBtn = await page.evaluate(() => document.activeElement.className);
    expect(onMenuBtn).toContain('menu-btn');
    await page.keyboard.press('Tab'); // should skip the inert overlay entirely, land in page content
    const insideOverlay = await page.evaluate(() => !!document.activeElement.closest('.menu-overlay'));
    expect(insideOverlay).toBe(false);
  });

  test('opening the menu moves focus in, traps Tab inside it, and Escape returns focus to the trigger', async ({ page }) => {
    await page.goto('/home.html');
    const btn = page.locator('.menu-btn');
    const overlay = page.locator('.menu-overlay');

    await btn.click();

    await expect(overlay).toHaveClass(/open/);
    await expect(overlay).not.toHaveAttribute('inert', '');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(btn).toHaveAttribute('aria-label', 'Close menu');

    // Focus should land on the first nav link, not stay on the trigger.
    const firstLinkFocused = await page.evaluate(() => document.activeElement.textContent.trim());
    expect(firstLinkFocused).toBe('Top');

    // Every other top-level element must be inert while the overlay is open
    // — this is what makes the overlay an actual focus trap (Tab can't
    // reach content behind it) without a hand-rolled keydown Tab-cycler.
    const othersAllInert = await page.evaluate(() => {
      const overlay = document.querySelector('.menu-overlay');
      return [...document.body.children].filter((el) => el !== overlay).every((el) => el.hasAttribute('inert'));
    });
    expect(othersAllInert).toBe(true);

    // Tab past the last link (6 nav links) should wrap back inside the
    // overlay, never escape to the page behind it.
    for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
    const stillInsideOverlay = await page.evaluate(() => !!document.activeElement.closest('.menu-overlay'));
    expect(stillInsideOverlay).toBe(true);

    await page.keyboard.press('Escape');

    await expect(overlay).not.toHaveClass(/open/);
    await expect(overlay).toHaveAttribute('inert', '');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-label', 'Open menu');

    const focusReturnedToBtn = await page.evaluate(() => document.activeElement.className.includes('menu-btn'));
    expect(focusReturnedToBtn).toBe(true);

    const othersNoneInert = await page.evaluate(() => {
      const overlay = document.querySelector('.menu-overlay');
      return [...document.body.children].filter((el) => el !== overlay).some((el) => el.hasAttribute('inert'));
    });
    expect(othersNoneInert).toBe(false);
  });
});
