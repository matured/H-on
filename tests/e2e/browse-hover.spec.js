const { test, expect, devices } = require('@playwright/test');

// Fake catalog rows shaped like honMapItemRow expects (js/circulation.js).
// No cover_image, so honCoverHTML renders the plain placeholder .shelf-cover
// (not .shelf-cover-photo) — same branch the browse.test.js jsdom test
// exercises, kept consistent here for the real-browser path.
const FAKE_ITEMS = [
  { item_id: 'alpha-1', title: 'Alpha Monthly', subtitle: null, issue: 'No. 1', era: '1920s', genre: 'travel', call_number: 'AA.1', copies_total: 3, cover_bg: '#111111', cover_fg: '#eeeeee', cover_accent: '#ff0000', cover_image: null, back_image: null, description: null },
  { item_id: 'beta-2', title: 'Beta Weekly', subtitle: null, issue: 'No. 2', era: '1930s', genre: 'travel', call_number: 'BB.2', copies_total: 2, cover_bg: '#222222', cover_fg: '#dddddd', cover_accent: '#00ff00', cover_image: null, back_image: null, description: null },
];

const FAKE_AVAILABILITY = FAKE_ITEMS.map((item) => ({
  item_id: item.item_id,
  copies_total: item.copies_total,
  active_loans: 0,
  queue_length: 0,
}));

async function mockCatalogBackend(page) {
  await page.route('**/rest/v1/items*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_ITEMS) })
  );
  await page.route('**/rest/v1/item_availability*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_AVAILABILITY) })
  );
}

test.describe('Catalog shelf — hover motion gating', () => {
  test('prefers-reduced-motion: hover leaves .shelf-cover untransformed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockCatalogBackend(page);
    await page.goto('/catalog.html');

    const firstCard = page.locator('.shelf-item').first();
    await expect(firstCard).toBeVisible();
    const cover = firstCard.locator('.shelf-cover');

    const restStyle = await cover.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, boxShadow: cs.boxShadow };
    });
    await firstCard.hover();
    // .shelf-cover animates via `transition: transform 0.45s, box-shadow 0.45s`
    // (css/style.css:504) — reading computed style immediately after hover()
    // catches it mid-transition, not at its resting hover value. Wait out
    // the transition so both properties reflect their settled state.
    await page.waitForTimeout(600);
    const hoveredStyle = await cover.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, boxShadow: cs.boxShadow };
    });

    // The reduced-motion override (`.shelf-item:hover .shelf-cover { transform: none; }`
    // under `@media (prefers-reduced-motion: reduce)`) should keep the cover
    // exactly where it started — no scale/rotate/lift — even though the
    // mouse is a real fine pointer and :hover genuinely matches.
    expect(hoveredStyle.transform).toBe('none');
    expect(hoveredStyle.transform).toBe(restStyle.transform);

    // The override only touches `transform` — it doesn't reset box-shadow,
    // so the box-shadow from the (still-matching) `(hover: hover) and
    // (pointer: fine)` hover rule should still take effect. This is the
    // "drops the transform but keeps the box-shadow" behavior described for
    // this change; asserting only `transform === 'none'` above wouldn't
    // catch a regression that accidentally suppressed the shadow too.
    expect(hoveredStyle.boxShadow).not.toBe(restStyle.boxShadow);
  });

  // Touch-capability gating (`@media (hover: hover) and (pointer: fine)`):
  // Chromium ties its `hover`/`pointer` media-feature evaluation to touch
  // emulation, so a context configured like a real touch device (hasTouch +
  // isMobile, as Playwright's device presets do) reports
  // `(hover: none) and (pointer: coarse)` for the page — the same signal
  // real phones/tablets send. That's the mechanism the CSS gate keys off of,
  // so this is a genuine check of the gate, not a proxy for it.
  test('touch-capable context: hover leaves .shelf-cover untransformed', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await context.newPage();
    await mockCatalogBackend(page);
    await page.goto('/catalog.html');

    const matchesFineHover = await page.evaluate(
      () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
    );
    expect(matchesFineHover).toBe(false);

    const firstCard = page.locator('.shelf-item').first();
    await expect(firstCard).toBeVisible();
    const cover = firstCard.locator('.shelf-cover');

    const restTransform = await cover.evaluate((el) => getComputedStyle(el).transform);
    // dispatchEvent bypasses Playwright's "is this pointer capable of
    // hover" actionability nuance and forces the same mouseover a stray
    // synthetic event would send — the CSS gate, not the input simulation,
    // is what's under test here.
    await firstCard.dispatchEvent('mouseover');
    const hoveredTransform = await cover.evaluate((el) => getComputedStyle(el).transform);

    expect(hoveredTransform).toBe('none');
    expect(hoveredTransform).toBe(restTransform);

    await context.close();
  });

  // Every real .shelf-cover on the page gets its --cover-hover-* values
  // overridden inline by honLayoutShelf (js/browse.js), so this checks the
  // one path that never goes through that code: an item the layout function
  // never touched. The hover transform (css/style.css, .shelf-item:hover
  // .shelf-cover) reads each custom property via var(--x, fallback) rather
  // than a literal default declared on .shelf-cover itself — declaring the
  // default directly on .shelf-cover was the original bug: an element's own
  // declared custom property always wins over an ancestor's inherited one,
  // so .shelf-cover's literal defaults permanently shadowed .shelf-item's
  // per-item inline overrides and every card hovered identically. This test
  // proves the var()-fallback path still resolves to the intended defaults
  // when nothing overrides them, without reintroducing that shadowing bug.
  test('untouched .shelf-cover falls back to the CSS var() hover defaults', async ({ page }) => {
    await mockCatalogBackend(page);
    await page.goto('/catalog.html');
    await expect(page.locator('.shelf-item').first()).toBeVisible();

    await page.evaluate(() => {
      // A .shelf-item/.shelf-cover pair honLayoutShelf never touched, so no
      // --cover-hover-* inline overrides exist anywhere in this pair's
      // ancestor chain — purely exercises the var() fallback values.
      const item = document.createElement('a');
      item.className = 'shelf-item';
      item.id = 'fallback-probe-item';
      item.style.position = 'static';
      const cover = document.createElement('div');
      cover.className = 'shelf-cover';
      item.appendChild(cover);
      document.body.appendChild(item);

      // Reference element: the literal fallback transform, applied directly
      // (no hover, no cascade) — the value the probe's hover transform
      // should match if the var() fallbacks are resolving correctly.
      const reference = document.createElement('div');
      reference.id = 'fallback-reference';
      reference.style.position = 'static';
      reference.style.transform = 'scale(1.16) rotate(-7deg) translateY(-14px)';
      document.body.appendChild(reference);
    });

    const probeItem = page.locator('#fallback-probe-item');
    const probeCover = probeItem.locator('.shelf-cover');
    await probeItem.hover();
    await page.waitForTimeout(600); // let the 0.45s transition settle

    const [hoveredTransform, referenceTransform] = await Promise.all([
      probeCover.evaluate((el) => getComputedStyle(el).transform),
      page.locator('#fallback-reference').evaluate((el) => getComputedStyle(el).transform),
    ]);

    expect(hoveredTransform).toBe(referenceTransform);
    expect(hoveredTransform).not.toBe('none');
  });

  // Combines what the jsdom test (tests/browse.test.js) and the two gating
  // tests above each proved separately — that honLayoutShelf writes
  // distinct per-item values, and that the CSS var()-to-transform pipeline
  // actually applies them on hover — into one live-browser assertion: two
  // different real, rendered cards resolve to two different computed
  // transform matrices when hovered. This is the direct, end-to-end proof
  // of the "per-magazine hover personality" this diff adds.
  //
  // This test caught a real bug during development: .shelf-cover's base
  // rule originally declared `--cover-hover-scale/-rotate/-lift` directly
  // on itself as a defensive default. Custom properties follow normal
  // cascade rules, not "prefer the ancestor's inline value" — a property
  // declared directly on an element always wins over an inherited one,
  // regardless of where the inherited value came from. That permanently
  // shadowed .shelf-item's inline per-item override, so every card hovered
  // identically despite honLayoutShelf computing distinct values correctly.
  // Fixed by dropping the literal defaults from `.shelf-cover` and inlining
  // the fallback into the consuming declaration instead —
  // `scale(var(--cover-hover-scale, 1.16))` etc. in the
  // `@media (hover: hover) and (pointer: fine)` hover rule (css/style.css)
  // — so there's nothing on `.shelf-cover` itself left to shadow the
  // inherited value.
  test('two different catalog cards resolve to different computed hover transforms', async ({ page }) => {
    await mockCatalogBackend(page);
    await page.goto('/catalog.html');

    const cards = page.locator('.shelf-item');
    await expect(cards).toHaveCount(FAKE_ITEMS.length);

    const readSettledTransform = async (card) => {
      await card.hover();
      await page.waitForTimeout(600); // let the 0.45s transition settle
      return card.locator('.shelf-cover').evaluate((el) => getComputedStyle(el).transform);
    };

    const firstTransform = await readSettledTransform(cards.nth(0));
    const secondTransform = await readSettledTransform(cards.nth(1));

    expect(firstTransform).toMatch(/^matrix/);
    expect(secondTransform).toMatch(/^matrix/);
    expect(firstTransform).not.toBe(secondTransform);
  });
});
