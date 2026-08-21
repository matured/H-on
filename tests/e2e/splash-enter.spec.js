const { test, expect } = require('@playwright/test');

// index.html's splash grid enters the site on click (any tile) or on any
// keypress anywhere on the page (not just Enter/Space, and not scoped to a
// focused element) — see the document-level keydown listener in index.html.
const STILL_ON_SPLASH = /index\.html$|\/$/;

async function tabTimes(page, n) {
  for (let i = 0; i < n; i++) await page.keyboard.press('Tab');
}

function focusedId(page) {
  return page.evaluate(() => document.activeElement.id);
}

// index.html's own document keydown handler adds `hon-leaving` to <body>
// synchronously, before the (possibly 480ms-delayed) navigation — checking
// it right after the keypress is a deterministic proxy for "did entry
// trigger", no waitForTimeout race needed.
function isLeaving(page) {
  return page.evaluate(() => document.body.classList.contains('hon-leaving'));
}

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
    expect(await isLeaving(page)).toBe(false);
    await expect(page).toHaveURL(STILL_ON_SPLASH);
  });

  test('Tab does not enter the site and moves focus to the Skip link', async ({ page }) => {
    await tabTimes(page, 2); // #splash-grid -> #hon-skip
    expect(await isLeaving(page)).toBe(false);
    await expect(page).toHaveURL(STILL_ON_SPLASH);
    expect(await focusedId(page)).toBe('hon-skip');
  });

  // Regression: the browser fires a keydown for the bare Shift press itself
  // (shiftKey already true on that event, key === 'Shift') before the Tab
  // keydown that follows it. Without excluding shiftKey alongside
  // ctrl/meta/alt, that first event alone satisfied every other guard and
  // fired enterSite() — but only when nothing has focus yet, i.e. its
  // target is document.body. (Pressing Shift+Tab from an already-focused
  // element, e.g. the Skip link, wouldn't have caught this: the bare
  // Shift keydown's target would already be that focused element, which
  // the target guard excludes on its own regardless of the shiftKey bug —
  // confirmed by reverting the fix and observing this test still passed
  // in that scenario, but failed once fired from a fresh, unfocused load.)
  test('Shift+Tab from a fresh, unfocused page does not enter the site', async ({ page }) => {
    await page.keyboard.press('Shift+Tab');
    expect(await isLeaving(page)).toBe(false);
    await expect(page).toHaveURL(STILL_ON_SPLASH);
  });

  // The interesting half of the e.target guard: a keypress that ISN'T Enter
  // while the skip link holds focus must be ignored by the document handler
  // just like it would be anywhere else, not treated as "entering via body".
  test('a non-Enter key while the Skip link is focused does not enter the site', async ({ page }) => {
    await tabTimes(page, 2); // -> #hon-skip
    await page.keyboard.press('a');
    expect(await isLeaving(page)).toBe(false);
    await expect(page).toHaveURL(STILL_ON_SPLASH);
  });

  // Distinguishes "native anchor activation" from "our handler also fired
  // enterSite()" — both would land on catalog.html, so asserting the final
  // URL alone (as an earlier version of this test did) can't tell them
  // apart. enterSite() imposes a deliberate 480ms delay before navigating
  // (the exit-fade transition); native anchor activation navigates
  // essentially immediately. A fast landing here proves the skip link took
  // its own native path, unraced by our handler adding a delay on top.
  test('the Skip link itself still navigates on Enter via its native action, not enterSite()', async ({ page }) => {
    await tabTimes(page, 2); // -> #hon-skip
    const start = Date.now();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/catalog\.html$/);
    expect(Date.now() - start).toBeLessThan(400); // well under enterSite()'s 480ms delay
  });

  // Guards against a real double-fire risk: without the `hon-leaving` early
  // return, every keydown that lands while the exit animation is already in
  // flight would call enterSite() again, scheduling another navigation.
  test('repeated keydowns while already leaving do not trigger multiple navigations', async ({ page }) => {
    let catalogRequests = 0;
    await page.route('**/catalog.html', (route) => {
      catalogRequests++;
      route.continue();
    });

    await page.keyboard.press('a'); // starts the leave (hon-leaving set, 480ms delay before nav)
    await page.keyboard.press('b'); // should be ignored by the hon-leaving guard
    await page.keyboard.press('c');
    await page.keyboard.press('d');

    await expect(page).toHaveURL(/catalog\.html$/);
    expect(catalogRequests).toBe(1);
  });

  // e.target !== document.body branch, other half: a keypress while the grid
  // itself is focused (post-Tab, pre-Skip-link) must still enter — the
  // handler accepts document.body OR the grid, not body only.
  test('pressing a key while the grid itself has focus still enters', async ({ page }) => {
    await page.keyboard.press('Tab'); // -> #splash-grid
    expect(await focusedId(page)).toBe('splash-grid');

    await page.keyboard.press('a');
    await expect(page).toHaveURL(/catalog\.html$/);
  });

  // enterSite()'s reduced-motion branch (0ms delay instead of 480ms) predates
  // this diff, but the new any-key path is a new caller of it — confirm the
  // combination still skips the animation delay instead of hanging on it.
  test('any-key entry still works under prefers-reduced-motion and skips the transition delay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/index.html'); // reload so matchMedia() picks up reduced-motion at parse time

    const start = Date.now();
    await page.keyboard.press('a');
    await expect(page).toHaveURL(/catalog\.html$/);
    expect(Date.now() - start).toBeLessThan(400); // well under the 480ms non-reduced-motion delay
  });

  // Trivial but cheap: the caption copy changed as part of this diff
  // ("Click any 本 to enter" -> "Click or press any key to enter"); pin it
  // so an unrelated future edit doesn't silently revert the affordance text.
  test('caption text reflects the any-key affordance', async ({ page }) => {
    await expect(page.locator('#hon-caption')).toHaveText('Click or press any key to enter');
  });

  // Regression: the caption used to sit directly on the busy tile grid in a
  // muted grey (#a8a397) with no backing — ~2.4:1 contrast against the
  // #faf9f4 tiles, well under WCAG AA's 4.5:1 minimum for normal text, and
  // worse still where it crossed a tile's black glyph stroke. A solid
  // near-black plate with cream text (~17.9:1) fixes that regardless of
  // what's rendered behind it. This pins the actual computed colors, not
  // just that SOME background exists, so a future edit can't quietly
  // reintroduce a low-contrast pairing.
  test('caption has a solid, high-contrast background instead of floating on the tile grid', async ({ page }) => {
    const caption = page.locator('#hon-caption');
    const styles = await caption.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { color: computed.color, background: computed.backgroundColor };
    });
    expect(styles.color).toBe('rgb(250, 249, 244)'); // #faf9f4
    expect(styles.background).toBe('rgb(10, 10, 10)'); // #0a0a0a
  });

  // The new backing plate's horizontal padding (18px each side, 36px total)
  // widens the caption's shrink-to-fit box from ~275px to ~311px. #hon-caption
  // is centered with left:50%+translateX(-50%) and never wraps
  // (white-space: nowrap), so it has no reflow escape hatch — measured at
  // WCAG 1.4.10's 320px reflow baseline, the widened box now clears the
  // viewport edge by only ~4px per side (vs. ~22px before this diff). That's
  // not yet a regression, but it's a much thinner margin than it looks like
  // from the source, and a future nudge to padding, font-size, or
  // letter-spacing on this element could push it into clipping at exactly
  // the width WCAG says must stay usable. Pin the box inside the viewport now
  // so that regression fails loudly instead of shipping silently.
  test('caption stays within the viewport at the 320px WCAG reflow baseline', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/index.html');
    const rect = await page.locator('#hon-caption').evaluate((el) => el.getBoundingClientRect());
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(320);
  });
});
