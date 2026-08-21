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
// onAccept/onDecline may also be the string 'DEFERRED', which installs a
// wrapper whose promise never settles on its own — it stashes its
// resolve/reject on window.__acceptDeferred / window.__declineDeferred so a
// test can inspect in-flight DOM state (buttons disabled, "Accepting…"
// text) before deliberately settling it from the test side.
async function mockAdminAndRender(page, { waitlist, waitlistError, onAccept, onDecline } = {}) {
  await page.goto('/admin.html');

  await page.evaluate(({ waitlist, waitlistError, onAccept, onDecline }) => {
    window.honGetCurrentUser = async () => ({ id: 'admin-1', email: 'admin@example.com' });
    window.honFetchMyProfile = async () => ({ user_id: 'admin-1', is_admin: true, banned: false });
    window.honAdminListWaitlist = waitlistError
      ? async () => { throw new Error(waitlistError); }
      : async () => waitlist;

    if (onAccept === 'DEFERRED') {
      window.honAdminAcceptWaitlistRequest = (requestId) => new Promise((resolve, reject) => {
        window.__acceptDeferred = { resolve, reject, requestId };
      });
    } else {
      window.honAdminAcceptWaitlistRequest = onAccept
        ? new Function('requestId', `return (${onAccept})(requestId);`)
        : async () => ({ code: 'ABCD-1234' });
    }

    if (onDecline === 'DEFERRED') {
      window.honAdminDeclineWaitlistRequest = (requestId) => new Promise((resolve, reject) => {
        window.__declineDeferred = { resolve, reject, requestId };
      });
    } else {
      window.honAdminDeclineWaitlistRequest = onDecline
        ? new Function('requestId', `return (${onDecline})(requestId);`)
        : async () => {};
    }

    window.honAdminListLoans = async () => [];
    window.honAdminListProfiles = async () => [];
    window.honFetchCatalog = async () => [];
  }, {
    waitlist, waitlistError,
    onAccept: onAccept === 'DEFERRED' ? 'DEFERRED' : (onAccept ? onAccept.toString() : null),
    onDecline: onDecline === 'DEFERRED' ? 'DEFERRED' : (onDecline ? onDecline.toString() : null),
  });

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

    // admin_list_waitlist() left-joins library_cards on waitlist_request_id
    // (added alongside these RPCs), so a card issued on a PAST visit is
    // still recoverable on this one — this is what makes the "already
    // handled" reload hint below actually useful instead of a dead end.
    test('a previously-accepted request shows its card code on a fresh load, not just right after clicking Accept', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 13, name: 'Returning Admin View', email: 'r@example.com', note: null, status: 'accepted', card_code: 'PAST-CODE-99', created_at: '2026-01-01T00:00:00Z' }],
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      await expect(row.locator('td').nth(4)).toHaveText('Accepted');
      await expect(row.locator('td').nth(5)).toContainText('Card issued: PAST-CODE-99');
    });

    // Accepting mints a card (admin_accept_waitlist_request), linked back
    // to the request via waitlist_request_id so it's recoverable later
    // too (see the fresh-load test above) — this test pins that the code
    // actually reaches the screen at the moment of acceptance itself.
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
        onAccept: () => Promise.reject(new Error('network error')),
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      const acceptBtn = row.locator('button[data-accept-id="22"]');
      await acceptBtn.click();

      await expect(acceptBtn).toHaveText('Failed — retry?');
      await expect(acceptBtn).toBeEnabled();
      await expect(row.locator('button[data-decline-id="22"]')).toBeEnabled();
      // Status must stay Pending — a failed accept is not a silent accept.
      await expect(row.locator('td').nth(4)).toHaveText('Pending');
      // The underlying error must actually reach the admin (via the title
      // attribute), not just a generic "Failed" label.
      await expect(acceptBtn).toHaveAttribute('title', 'network error');
    });

    // Only Accept's failure path had a test before this — Decline's own
    // catch block is separate code (admin.html's second click listener)
    // and could regress independently (e.g. forgetting to re-enable the
    // Accept button, or leaving the row silently stuck on "Declining…").
    test('a failed Decline re-enables both buttons and shows a retry state instead of silently failing', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 23, name: 'Also Flaky', email: 'flaky2@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onDecline: () => Promise.reject(new Error('network error')),
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      const declineBtn = row.locator('button[data-decline-id="23"]');
      await declineBtn.click();

      await expect(declineBtn).toHaveText('Failed — retry?');
      await expect(declineBtn).toBeEnabled();
      await expect(row.locator('button[data-accept-id="23"]')).toBeEnabled();
      // Status must stay Pending — a failed decline is not a silent decline.
      await expect(row.locator('td').nth(4)).toHaveText('Pending');
      await expect(declineBtn).toHaveAttribute('title', 'network error');
    });

    // "request not found or already handled" specifically means the row
    // lock rejected the call — including the case where an earlier attempt
    // of THIS SAME click actually succeeded server-side and only the
    // response was lost (network drop after commit). That's a materially
    // different situation from a generic failure: a bare "retry" prompt
    // would just fail the same way again, so it gets a message pointing at
    // reloading instead, where admin_list_waitlist()'s card_code join
    // (added in this same migration) would actually show the outcome.
    test('an "already handled" failure shows a reload hint instead of a generic retry prompt', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 24, name: 'Maybe Handled', email: 'maybe@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onAccept: () => Promise.reject(new Error('request not found or already handled')),
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      const acceptBtn = row.locator('button[data-accept-id="24"]');
      await acceptBtn.click();

      await expect(acceptBtn).toHaveText('Already handled — reload to see the outcome');
      await expect(acceptBtn).toHaveAttribute('title', 'request not found or already handled');
    });

    // Proves the disable-during-request behavior actually happens while the
    // RPC is in flight, not just that it's true by the time the promise has
    // already settled (which every prior test here implicitly hides, since
    // their mocks resolve immediately). A deferred promise lets us inspect
    // the DOM mid-request. This also doubles as the front-end's half of the
    // double-accept guard: both buttons are disabled before the request
    // completes, so a second click can't fire a second RPC call.
    test('clicking Accept disables both buttons and shows an in-flight state before the request resolves', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 30, name: 'Slow Poke', email: 'slow@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onAccept: 'DEFERRED',
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      const acceptBtn = row.locator('button[data-accept-id="30"]');
      const declineBtn = row.locator('button[data-decline-id="30"]');

      await acceptBtn.click();

      await expect(acceptBtn).toBeDisabled();
      await expect(declineBtn).toBeDisabled();
      await expect(acceptBtn).toHaveText('Accepting…');
      // Still resolving — must not have jumped to Accepted yet.
      await expect(row.locator('td').nth(4)).toHaveText('Pending');

      await page.evaluate((code) => window.__acceptDeferred.resolve({ code }), 'CODE-30');

      await expect(row.locator('td').nth(4)).toHaveText('Accepted');
      await expect(row.locator('td').nth(5)).toContainText('Card issued: CODE-30');
    });

    test('clicking Decline disables both buttons and shows an in-flight state before the request resolves', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [{ id: 31, name: 'Slow Poke Two', email: 'slow2@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onDecline: 'DEFERRED',
      });

      const row = page.locator('#waitlist-table-wrap tbody tr').first();
      const acceptBtn = row.locator('button[data-accept-id="31"]');
      const declineBtn = row.locator('button[data-decline-id="31"]');

      await declineBtn.click();

      await expect(declineBtn).toBeDisabled();
      await expect(acceptBtn).toBeDisabled();
      await expect(declineBtn).toHaveText('Declining…');
      await expect(row.locator('td').nth(4)).toHaveText('Pending');

      await page.evaluate(() => window.__declineDeferred.resolve());

      await expect(row.locator('td').nth(4)).toHaveText('Declined');
    });

    // The in-place update writes to `row.querySelector('.hon-waitlist-status')`
    // / `.hon-waitlist-actions` scoped to the clicked row's own <tr> — but
    // nothing before this proved that OTHER rows survive untouched. A bug
    // here (e.g. accidentally re-running honRenderWaitlistTable() instead of
    // patching just the one row) would wipe every row's in-flight/failed
    // state back to a fresh render pulled from the last-fetched list.
    test('accepting or declining one row does not disturb other rows (no full re-render)', async ({ page }) => {
      await mockAdminAndRender(page, {
        waitlist: [
          { id: 40, name: 'Row A', email: 'a@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' },
          { id: 41, name: 'Row B', email: 'b@example.com', note: null, status: 'pending', created_at: '2026-01-02T00:00:00Z' },
          { id: 42, name: 'Row C', email: 'c@example.com', note: null, status: 'accepted', created_at: '2026-01-03T00:00:00Z' },
        ],
        onAccept: (requestId) => Promise.resolve({ code: `CODE-${requestId}` }),
      });

      const rows = page.locator('#waitlist-table-wrap tbody tr');

      // Accept the middle row only.
      await rows.nth(1).locator('button[data-accept-id="41"]').click();
      await expect(rows.nth(1).locator('td').nth(4)).toHaveText('Accepted');
      await expect(rows.nth(1).locator('td').nth(5)).toContainText('Card issued: CODE-41');

      // Row A (still pending, untouched) must still have live, enabled
      // buttons — proof it wasn't swept into whatever DOM update row B got.
      await expect(rows.nth(0).locator('td').nth(4)).toHaveText('Pending');
      await expect(rows.nth(0).locator('button[data-accept-id="40"]')).toBeEnabled();
      await expect(rows.nth(0).locator('button[data-decline-id="40"]')).toBeEnabled();

      // Row C was already accepted before either click in this test — a
      // full re-render pulling from the original fetched list would still
      // show this as "Accepted" with no buttons, so on its own this
      // wouldn't distinguish in-place update from re-render. It's checked
      // together with row A (which WOULD reset visibly) as a sanity check
      // that row C simply never changed.
      await expect(rows.nth(2).locator('td').nth(4)).toHaveText('Accepted');
      await expect(rows.nth(2).locator('button')).toHaveCount(0);

      await expect(rows).toHaveCount(3);

      // Now decline row A — must only touch row A, leaving the already-
      // updated row B and row C exactly as they were.
      await rows.nth(0).locator('button[data-decline-id="40"]').click();
      await expect(rows.nth(0).locator('td').nth(4)).toHaveText('Declined');
      await expect(rows.nth(1).locator('td').nth(4)).toHaveText('Accepted');
      await expect(rows.nth(1).locator('td').nth(5)).toContainText('Card issued: CODE-41');
      await expect(rows.nth(2).locator('td').nth(4)).toHaveText('Accepted');
    });

    // The click handler sets btn.disabled = true synchronously, before its
    // first await — a real browser click on a disabled <button> never
    // dispatches a click event at all, so a second real user click during
    // the in-flight window is physically impossible. This proves that
    // property empirically rather than trusting it stays true as the
    // handler evolves: it force-dispatches a second click past Playwright's
    // disabled-element actionability guard (bypassing the same protection
    // a real click would hit) and confirms the RPC still only fired once.
    test('a forced second click on a disabled Accept button does not double-mint a card', async ({ page }) => {
      let acceptCalls = 0;
      await page.exposeFunction('__countAccept', () => { acceptCalls++; });
      await mockAdminAndRender(page, {
        waitlist: [{ id: 50, name: 'Click Happy', email: 'click@example.com', note: null, status: 'pending', created_at: '2026-01-01T00:00:00Z' }],
        onAccept: 'DEFERRED',
      });
      await page.evaluate(() => {
        const real = window.honAdminAcceptWaitlistRequest;
        window.honAdminAcceptWaitlistRequest = (id) => { window.__countAccept(); return real(id); };
      });

      const acceptBtn = page.locator('button[data-accept-id="50"]');
      await acceptBtn.click();
      await expect(acceptBtn).toBeDisabled();

      // force:true skips the actionability check Playwright would otherwise
      // enforce (which already refuses to click a disabled element) — this
      // is deliberately testing what happens if a click reaches the button
      // anyway, not just that Playwright itself won't click it.
      await acceptBtn.click({ force: true });

      await page.evaluate(() => window.__acceptDeferred.resolve({ code: 'CODE-50' }));
      await expect(page.locator('button[data-accept-id="50"]')).toHaveCount(0);
      expect(acceptCalls).toBe(1);
    });
  });
});
