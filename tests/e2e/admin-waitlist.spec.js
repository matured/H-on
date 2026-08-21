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
async function mockAdminAndRender(page, { waitlist, waitlistError, onAccept, onDecline } = {}) {
  await page.goto('/admin.html');

  await page.evaluate(({ waitlist, waitlistError, onAccept, onDecline }) => {
    window.honGetCurrentUser = async () => ({ id: 'admin-1', email: 'admin@example.com' });
    window.honFetchMyProfile = async () => ({ user_id: 'admin-1', is_admin: true, banned: false });
    window.honAdminListWaitlist = waitlistError
      ? async () => { throw new Error(waitlistError); }
      : async () => waitlist;
    window.honAdminAcceptWaitlistRequest = onAccept
      ? new Function('requestId', `return (${onAccept})(requestId);`)
      : async () => ({ code: 'ABCD-1234' });
    window.honAdminDeclineWaitlistRequest = onDecline
      ? new Function('requestId', `return (${onDecline})(requestId);`)
      : async () => {};
    window.honAdminListLoans = async () => [];
    window.honAdminListProfiles = async () => [];
    window.honFetchCatalog = async () => [];
  }, { waitlist, waitlistError, onAccept: onAccept ? onAccept.toString() : null, onDecline: onDecline ? onDecline.toString() : null });

  await page.evaluate(() => window.honRenderAdmin());
}

test.describe('Admin — Waitlist panel (honRenderWaitlistTable)', () => {
  test('renders name, email, note, and a formatted submitted date for each request', async ({ page }) => {
    await mockAdminAndRender(page, {
      waitlist: [
        { id: 1, name: 'Jane Doe', email: 'jane@example.com', note: 'Big fan of the archive', status: 'pending', created_at: '2026-03-05T12:00:00Z' },
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
    await expect(cells.nth(4)).toHaveText('Pending');
  });

  test('escapes HTML in name/email/note instead of rendering it (XSS)', async ({ page }) => {
    await mockAdminAndRender(page, {
      waitlist: [{
        id: 2,
        name: '<img src=x onerror=alert(1)>',
        email: '"><script>window.__xss = true</script>',
        note: '<b>bold</b> & <i>italic</i>',
        status: 'pending',
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
      waitlist: [{ id: 3, name: 'No Note', email: 'nonote@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
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

  // admin_list_waitlist() hard-caps at 500 rows (the migration's own LIMIT)
  // so an unbounded flood of anon submissions can't blow up this render.
  // Hitting that cap must never be silent — it means older requests exist
  // beyond what's shown. This test pins the row count that triggers the
  // warning, not just that a warning banner CAN exist.
  function makeRows(n) {
    return Array.from({ length: n }, (_, i) => ({
      id: i + 1, name: `Person ${i}`, email: `p${i}@example.com`, note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z',
    }));
  }

  test('hitting the 500-row cap shows a "showing most recent" warning', async ({ page }) => {
    await mockAdminAndRender(page, { waitlist: makeRows(500) });

    await expect(page.locator('#waitlist-table-wrap')).toContainText('Showing the 500 most recent requests');
    await expect(page.locator('#waitlist-table-wrap tbody tr')).toHaveCount(500);
  });

  test('below the cap shows no truncation warning', async ({ page }) => {
    await mockAdminAndRender(page, { waitlist: makeRows(499) });

    await expect(page.locator('#waitlist-table-wrap')).not.toContainText('Showing the');
    await expect(page.locator('#waitlist-table-wrap tbody tr')).toHaveCount(499);
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

  test.describe('Accept / Decline', () => {
    test('a pending request shows Accept and Decline buttons', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 10, name: 'Pending Person', email: 'p@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      await expect(row.locator('button[data-accept-id="10"]')).toBeVisible();
      await expect(row.locator('button[data-decline-id="10"]')).toBeVisible();
    });

    test('an already-accepted or declined request shows no buttons', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [
          { id: 11, name: 'Already In', email: 'a@example.com', note: null, status: 'accepted', created_at: '2026-01-01T00:00:00Z' },
          { id: 12, name: 'Turned Away', email: 'd@example.com', note: null, status: 'declined', created_at: '2026-01-01T00:00:00Z' },
        ],
      });

      const rows = page.locator('#waitlist-table-wrap tbody tr');
      await expect(rows.nth(0).locator('button')).toHaveCount(0);
      await expect(rows.nth(1).locator('button')).toHaveCount(0);
      await expect(rows.nth(0).locator('td').nth(4)).toHaveText('Accepted');
      await expect(rows.nth(1).locator('td').nth(4)).toHaveText('Declined');
    });

    // Accepting mints a card (admin_accept_waitlist_request) that isn't
    // linked back to the request row in the database — the code is only
    // ever surfaced here, once, right after acceptance. This pins that the
    // code actually reaches the screen, since there's no second chance to
    // see it from this panel.
    test('clicking Accept issues a card, shows the code, and updates the status', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 20, name: 'Ada Lovelace', email: 'ada@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onAccept: (requestId) => Promise.resolve({ code: `CODE-${requestId}` }),
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      await row.locator('button[data-accept-id="20"]').click();

      await expect(row.locator('td').nth(4)).toHaveText('Accepted');
      await expect(row.locator('td').nth(5)).toContainText('Card issued: CODE-20');
      await expect(row.locator('button')).toHaveCount(0);
    });

    test('clicking Decline marks the request declined with no card issued', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 21, name: 'No Thanks', email: 'no@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onAccept: () => Promise.reject(new Error('accept should not be called from Decline')),
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      await row.locator('button[data-decline-id="21"]').click();

      await expect(row.locator('td').nth(4)).toHaveText('Declined');
      await expect(row.locator('button')).toHaveCount(0);
      await expect(row.locator('td').nth(5)).not.toContainText('Card issued');
    });

    test('a failed Accept re-enables both buttons and shows a retry state instead of silently failing', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 22, name: 'Flaky', email: 'flaky@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onAccept: () => Promise.reject(new Error('request not found or already handled')),
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      const acceptBtn = row.locator('button[data-accept-id="22"]');
      await acceptBtn.click();

      await expect(acceptBtn).toHaveText('Failed — retry?');
      await expect(acceptBtn).toBeEnabled();
      await expect(row.locator('button[data-decline-id="22"]')).toBeEnabled();
      // Status must stay Pending — a failed accept is not a silent accept.
      await expect(row.locator('td').nth(4)).toHaveText('Pending');
    });
  });
});
