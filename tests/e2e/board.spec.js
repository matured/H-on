const { test, expect } = require('@playwright/test');

// board.html's own DOMContentLoaded listener calls honRenderDengonbanBoardPage()
// as soon as the page loads, using the real hon* functions — with no session
// that resolves harmlessly (getSession() reads local storage only, no network
// round trip) and honFetchDengonban() hitting the real (unmocked) backend. We
// let that first real pass happen, then override the relevant hon* functions
// on window (they're plain top-level `function`/const declarations in
// js/circulation.js, so reassigning the identifier on window is all
// honRenderDengonbanBoardPage sees the next time it calls them) and
// re-invoke honRenderDengonbanBoardPage() ourselves — same technique
// tests/e2e/admin-waitlist.spec.js uses for admin.html.
//
// onPost/onRemove may also be the string 'DEFERRED', which installs a wrapper
// whose promise never settles on its own — it stashes its resolve/reject on
// window.__postDeferred / window.__removeDeferred so a test can inspect
// in-flight DOM state before deliberately settling it from the test side.
async function mockBoardAndRender(page, { messages = [], messagesError, signedIn = null, isAdmin = false, onPost, onRemove } = {}) {
  // Unlike admin.html (which early-returns before any network call for a
  // signed-out visitor), the board is intentionally public, so the real
  // first pass's honFetchDengonban() hits the real Supabase project over
  // the network regardless of session state. Left unblocked, that real
  // call can resolve AFTER this function's own mocked render and silently
  // overwrite the board area mid-test (same page.route() technique
  // tests/e2e/support-donation.spec.js already uses for its own real
  // network call) — block it up front so the only render that ever
  // completes is the mocked one this function drives explicitly.
  await page.route('**/*.supabase.co/**', (route) => route.abort());

  await page.goto('/board.html');

  await page.evaluate(({ messages, messagesError, signedIn, isAdmin, onPost, onRemove }) => {
    window.honGetCurrentUser = async () => (signedIn ? { id: signedIn, email: `${signedIn}@example.com` } : null);
    window.honFetchMyProfile = async () => (signedIn ? { user_id: signedIn, is_admin: isAdmin, banned: false } : null);
    window.honFetchDengonban = messagesError
      ? async () => { throw new Error(messagesError); }
      : async () => messages;

    if (onPost === 'DEFERRED') {
      window.honPostDengonban = (body, opts) => new Promise((resolve, reject) => {
        window.__postDeferred = { resolve, reject, body, opts };
      });
    } else {
      window.honPostDengonban = onPost
        ? new Function('body', 'opts', `return (${onPost})(body, opts);`)
        : async (body, opts) => {
          window.__lastPostOpts = opts;
          return { id: 'new-1', body, created_at: new Date().toISOString(), color: opts.color, pos_x: opts.x, pos_y: opts.y, doodle: opts.doodle || null };
        };
    }

    if (onRemove === 'DEFERRED') {
      window.honAdminHideDengonban = (id) => new Promise((resolve, reject) => {
        window.__removeDeferred = { resolve, reject, id };
      });
    } else {
      window.honAdminHideDengonban = onRemove
        ? new Function('id', `return (${onRemove})(id);`)
        : async () => {};
    }
  }, {
    messages, messagesError, signedIn, isAdmin,
    onPost: onPost === 'DEFERRED' ? 'DEFERRED' : (onPost ? onPost.toString() : null),
    onRemove: onRemove === 'DEFERRED' ? 'DEFERRED' : (onRemove ? onRemove.toString() : null),
  });

  await page.evaluate(() => window.honRenderDengonbanBoardPage());
}

function note(overrides) {
  return { id: 'm1', body: 'a note', created_at: '2026-01-01T00:00:00Z', color: '#fef3c7', pos_x: 20, pos_y: 30, doodle: null, ...overrides };
}

test.describe('Community Board — corkboard redesign', () => {
  test('anonymous visitors see the compose form with no sign-in gate', async ({ page }) => {
    await mockBoardAndRender(page, { messages: [] });
    await expect(page.locator('#dengonban-compose')).toBeVisible();
    // The sign-in gate was removed from the markup entirely, not just hidden.
    await expect(page.locator('#dengonban-signin-note')).toHaveCount(0);
  });

  test('an anonymous visitor can post a note', async ({ page }) => {
    await mockBoardAndRender(page, { messages: [] });

    await page.fill('#dengonban-body', 'hello from a guest');
    await page.click('#dengonban-submit');

    const posted = page.locator('.dengonban-note:not(.dengonban-note-preview) .dengonban-note-body');
    await expect(posted).toHaveText('hello from a guest');
  });

  test('an anon rate-limit error surfaces in the status line', async ({ page }) => {
    await mockBoardAndRender(page, {
      messages: [],
      onPost: async () => { throw new Error('rate limit exceeded for anonymous posting, try again shortly'); },
    });

    await page.fill('#dengonban-body', 'spam');
    await page.click('#dengonban-submit');

    await expect(page.locator('#dengonban-status')).toHaveText('rate limit exceeded for anonymous posting, try again shortly');
  });

  test('selecting a note color posts that exact color', async ({ page }) => {
    await mockBoardAndRender(page, { messages: [] });

    const swatches = page.locator('.dengonban-color-swatch');
    await swatches.nth(2).click();
    const expectedColor = await swatches.nth(2).getAttribute('data-color');

    await page.fill('#dengonban-body', 'color test');
    await page.click('#dengonban-submit');

    const opts = await page.evaluate(() => window.__lastPostOpts);
    expect(opts.color).toBe(expectedColor);
  });

  test('the pending note starts within the board bounds, and dragging it changes the posted position', async ({ page }) => {
    await mockBoardAndRender(page, { messages: [] });

    const preview = page.locator('#dengonban-preview-note');
    await expect(preview).toBeVisible();

    const initialLeft = await preview.evaluate((el) => parseFloat(el.style.left));
    const initialTop = await preview.evaluate((el) => parseFloat(el.style.top));
    expect(initialLeft).toBeGreaterThanOrEqual(0);
    expect(initialLeft).toBeLessThanOrEqual(100);
    expect(initialTop).toBeGreaterThanOrEqual(0);
    expect(initialTop).toBeLessThanOrEqual(100);

    // page.mouse is a raw viewport-coordinate API with no built-in
    // actionability/auto-scroll (unlike locator methods such as .click()),
    // and the board area routinely sits below the fold — without this,
    // boundingBox() below reflects a real page position the synthetic
    // mouse can't actually reach.
    await preview.scrollIntoViewIfNeeded();
    const box = await preview.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 150, { steps: 8 });
    await page.mouse.up();

    const movedLeft = await preview.evaluate((el) => parseFloat(el.style.left));
    expect(Math.abs(movedLeft - initialLeft)).toBeGreaterThan(2);

    await page.fill('#dengonban-body', 'moved note');
    await page.click('#dengonban-submit');

    const opts = await page.evaluate(() => window.__lastPostOpts);
    expect(Math.abs(opts.x - movedLeft)).toBeLessThan(0.5);
  });

  test('drawing a short stroke on the doodle canvas posts non-empty stroke data', async ({ page }) => {
    await mockBoardAndRender(page, { messages: [] });

    const canvas = page.locator('#dengonban-doodle-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
    await page.mouse.up();

    await page.fill('#dengonban-body', 'doodle test');
    await page.click('#dengonban-submit');

    const opts = await page.evaluate(() => window.__lastPostOpts);
    expect(Array.isArray(opts.doodle)).toBe(true);
    expect(opts.doodle.length).toBeGreaterThan(0);
    expect(opts.doodle[0].length).toBeGreaterThan(1);
  });

  test('an admin sees a remove button on every note', async ({ page }) => {
    await mockBoardAndRender(page, {
      signedIn: 'admin-1',
      isAdmin: true,
      messages: [note({ id: 'm1', body: 'note one' }), note({ id: 'm2', body: 'note two' })],
    });
    await expect(page.locator('button[data-remove-id]')).toHaveCount(2);
  });

  test('a signed-out visitor sees no remove buttons', async ({ page }) => {
    await mockBoardAndRender(page, { messages: [note()] });
    await expect(page.locator('button[data-remove-id]')).toHaveCount(0);
  });

  test('a signed-in non-admin sees no remove buttons', async ({ page }) => {
    await mockBoardAndRender(page, { signedIn: 'member-1', isAdmin: false, messages: [note()] });
    await expect(page.locator('button[data-remove-id]')).toHaveCount(0);
  });

  test('removing a note shows an in-flight disabled state, then removes it from the DOM', async ({ page }) => {
    await mockBoardAndRender(page, {
      signedIn: 'admin-1',
      isAdmin: true,
      messages: [note({ id: 'm1', body: 'to remove' })],
      onRemove: 'DEFERRED',
    });

    const target = page.locator('.dengonban-note', { hasText: 'to remove' });
    const removeBtn = target.locator('button[data-remove-id]');

    await removeBtn.click();
    await expect(removeBtn).toBeDisabled();
    await expect(target).toBeVisible(); // still present mid-flight

    await page.evaluate(() => window.__removeDeferred.resolve());

    await expect(target).toHaveCount(0);
  });

  test('a failed remove re-enables the button and carries the error as a tooltip', async ({ page }) => {
    await mockBoardAndRender(page, {
      signedIn: 'admin-1',
      isAdmin: true,
      messages: [note({ id: 'm1', body: 'stubborn note' })],
      onRemove: async () => { throw new Error('admin only'); },
    });

    const target = page.locator('.dengonban-note', { hasText: 'stubborn note' });
    const removeBtn = target.locator('button[data-remove-id]');

    await removeBtn.click();
    await expect(removeBtn).toBeEnabled();
    await expect(removeBtn).toHaveText('×');
    await expect(removeBtn).toHaveAttribute('title', 'admin only');
  });

  test('a note body with markup renders as inert text, not markup (XSS)', async ({ page }) => {
    await mockBoardAndRender(page, {
      messages: [note({ id: 'm1', body: '<img src=x onerror="window.__xss=true">' })],
    });

    const body = page.locator('.dengonban-note:not(.dengonban-note-preview) .dengonban-note-body').first();
    await expect(body).toHaveText('<img src=x onerror="window.__xss=true">');
    expect(await page.locator('#dengonban-board-area img').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('an existing note renders at its stored color and position', async ({ page }) => {
    await mockBoardAndRender(page, {
      messages: [note({ id: 'm1', body: 'placed note', color: '#bfdbfe', pos_x: 33, pos_y: 66 })],
    });

    const target = page.locator('.dengonban-note', { hasText: 'placed note' });
    await expect(target).toHaveCSS('background-color', 'rgb(191, 219, 254)'); // #bfdbfe
    const left = await target.evaluate((el) => parseFloat(el.style.left));
    const top = await target.evaluate((el) => parseFloat(el.style.top));
    expect(left).toBe(33);
    expect(top).toBe(66);
  });

  test('a board-load error shows an escaped error message instead of throwing', async ({ page }) => {
    await mockBoardAndRender(page, { messagesError: 'network error' });
    await expect(page.locator('#dengonban-board-area')).toContainText('Couldn’t load the board: network error');
  });
});
