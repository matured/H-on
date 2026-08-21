const { test, expect } = require('@playwright/test');

// admin.html's own DOMContentLoaded listener calls honRenderAdmin() as soon
// as the page loads, using the real honGetCurrentUser/honFetchMyProfile —
// with no session that resolves to "Sign in first" harmlessly (getSession()
// reads local storage only, no network round trip). We let that first real
// pass happen, then override the admin/auth functions on window (they're
// plain top-level `function` declarations in js/circulation.js, so
// reassigning the identifier on window is all `honRenderAdmin` sees the
// next time it calls them) and re-invoke honRenderAdmin() ourselves. This
// exercises honRenderWaitlistTable() (admin.html) without a real Supabase
// backend or a real admin session.
async function mockAdminAndRender(page, { waitlist, waitlistError } = {}) {
  await page.goto('/admin.html');

  await page.evaluate(({ waitlist, waitlistError }) => {
    window.honGetCurrentUser = async () => ({ id: 'admin-1', email: 'admin@example.com' });
    window.honFetchMyProfile = async () => ({ user_id: 'admin-1', is_admin: true, banned: false });
    window.honAdminListWaitlist = waitlistError
      ? async () => { throw new Error(waitlistError); }
      : async () => waitlist;
    window.honAdminListLoans = async () => [];
    window.honAdminListProfiles = async () => [];
    window.honFetchCatalog = async () => [];
  }, { waitlist, waitlistError });

  await page.evaluate(() => window.honRenderAdmin());
}

test.describe('Admin — Waitlist panel (honRenderWaitlistTable)', () => {
  test('renders name, email, note, and a formatted submitted date for each request', async ({ page }) => {
    await mockAdminAndRender(page, {
      waitlist: [
        { id: 1, name: 'Jane Doe', email: 'jane@example.com', note: 'Big fan of the archive', created_at: '2026-03-05T12:00:00Z' },
      ],
    });

    const wrap = page.locator('#waitlist-table-wrap');
    const row = wrap.locator('tbody tr').first();
    const cells = row.locator('td');

    await expect(cells.nth(0)).toHaveText('Jane Doe');
    await expect(cells.nth(1)).toHaveText('jane@example.com');
    await expect(cells.nth(2)).toHaveText('Big fan of the archive');
    // Same MON DD, YYYY uppercase format honFormatDate produces elsewhere
    // (tests/circulation.test.js asserts the pattern directly).
    await expect(cells.nth(3)).toHaveText('MAR 05, 2026');
  });

  test('escapes HTML in name/email/note instead of rendering it (XSS)', async ({ page }) => {
    await mockAdminAndRender(page, {
      waitlist: [{
        id: 2,
        name: '<img src=x onerror=alert(1)>',
        email: '"><script>window.__xss = true</script>',
        note: '<b>bold</b> & <i>italic</i>',
        created_at: '2026-01-15T00:00:00Z',
      }],
    });

    const row = page.locator('#waitlist-table-wrap tbody tr').first();
    const cells = row.locator('td');

    // Rendered as literal text, not markup: no injected <img>/<script>
    // elements exist anywhere in the waitlist wrap, and the raw tags show
    // up as visible text instead.
    await expect(cells.nth(0)).toHaveText('<img src=x onerror=alert(1)>');
    await expect(cells.nth(1)).toHaveText('"><script>window.__xss = true</script>');
    await expect(cells.nth(2)).toHaveText('<b>bold</b> & <i>italic</i>');

    const injectedImg = await page.locator('#waitlist-table-wrap img').count();
    const injectedScript = await page.locator('#waitlist-table-wrap script').count();
    expect(injectedImg).toBe(0);
    expect(injectedScript).toBe(0);
    const xssRan = await page.evaluate(() => window.__xss);
    expect(xssRan).toBeUndefined();
  });

  test('a null note renders the em-dash placeholder instead of blank or "null"', async ({ page }) => {
    await mockAdminAndRender(page, {
      waitlist: [{ id: 3, name: 'No Note', email: 'nonote@example.com', note: null, created_at: '2026-01-01T00:00:00Z' }],
    });

    const noteCell = page.locator('#waitlist-table-wrap tbody tr').first().locator('td').nth(2);
    await expect(noteCell).toHaveText('—');
  });

  test('empty waitlist shows "No requests yet." instead of an empty table', async ({ page }) => {
    await mockAdminAndRender(page, { waitlist: [] });

    const wrap = page.locator('#waitlist-table-wrap');
    await expect(wrap).toHaveText('No requests yet.');
    await expect(wrap.locator('table')).toHaveCount(0);
  });

  test('an RPC error (e.g. a non-admin caller) shows an escaped error message instead of throwing', async ({ page }) => {
    await mockAdminAndRender(page, { waitlistError: 'admin only' });

    const wrap = page.locator('#waitlist-table-wrap');
    await expect(wrap).toContainText('Couldn’t load the waitlist: admin only');
    await expect(wrap.locator('table')).toHaveCount(0);
  });

  // honRenderAdmin() awaits loans -> members -> waitlist -> catalog in
  // sequence (admin.html), and honRenderWaitlistTable() catches its own
  // error rather than letting it propagate. This proves that containment:
  // a waitlist RPC failure must not stop the Catalog panel after it from
  // rendering — a regression here would silently freeze admin.html's
  // catalog-editing tools on "Loading..." any time the waitlist RPC fails.
  test('a waitlist RPC failure does not block the Catalog panel from rendering afterward', async ({ page }) => {
    await mockAdminAndRender(page, { waitlistError: 'admin only' });

    await expect(page.locator('#waitlist-table-wrap')).toContainText('Couldn’t load the waitlist');
    await expect(page.locator('#catalog-table-wrap')).not.toHaveText('Loading…');
    await expect(page.locator('#catalog-save-btn')).toBeVisible();
  });
});
