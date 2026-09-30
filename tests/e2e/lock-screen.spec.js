const { test, expect } = require('@playwright/test');

// The site-wide "coming soon" gate (T20). js/main.js's own DOMContentLoaded
// listener calls honRunMainInit({ skipLockCheck: navigator.webdriver }) as
// soon as every page loads — under Playwright that's always true, so the
// real first pass renders normal chrome and never touches the lock check at
// all (same reasoning as honTrackPageView/honLogPageView's webdriver gate).
// We let that harmless first pass happen, clear what it injected, then
// mock honFetchMyProfile and re-invoke honRunMainInit({ skipLockCheck: false })
// ourselves to force the real check path — same technique
// tests/e2e/admin-waitlist.spec.js and tests/e2e/board.spec.js use.
async function mockMainInitAndRun(page, { isAdmin = false, path = '/home.html' } = {}) {
  await page.goto(path);

  await page.evaluate(({ isAdmin }) => {
    window.honFetchMyProfile = async () => (isAdmin ? { user_id: 'admin-1', is_admin: true, banned: false } : null);
    // The automatic first pass already injected real nav/corner-mark/skip-
    // link elements (skipLockCheck was true for it) — clear those so this
    // forced re-invocation doesn't leave duplicates behind.
    document.querySelectorAll('.menu-btn, .menu-overlay, #hon-corner-mark, .skip-link, #hon-lock-screen')
      .forEach((el) => el.remove());
  }, { isAdmin });

  await page.evaluate(() => window.honRunMainInit({ skipLockCheck: false }));
}

test.describe('Coming-soon lock screen (inner pages)', () => {
  test('a non-admin visitor sees the lock screen with the launch date', async ({ page }) => {
    await mockMainInitAndRun(page, { isAdmin: false });

    const lock = page.locator('#hon-lock-screen');
    await expect(lock).toBeVisible();
    await expect(lock).toContainText('November 30, 2026');
  });

  test('the rest of the page is inert while locked', async ({ page }) => {
    await mockMainInitAndRun(page, { isAdmin: false });

    const othersAllInert = await page.evaluate(() => {
      const lock = document.getElementById('hon-lock-screen');
      return [...document.body.children].filter((el) => el !== lock).every((el) => el.hasAttribute('inert'));
    });
    expect(othersAllInert).toBe(true);

    // No real nav chrome should have been injected at all once locked —
    // honRunMainInit returns before reaching honInjectNav/honInjectCornerMark.
    await expect(page.locator('.menu-btn')).toHaveCount(0);
  });

  test('an admin bypasses the lock screen and sees the real page', async ({ page }) => {
    await mockMainInitAndRun(page, { isAdmin: true });

    await expect(page.locator('#hon-lock-screen')).toHaveCount(0);
    await expect(page.locator('.menu-btn')).toBeVisible();
  });

  test('the waitlist form inside the lock screen submits to waitlist_requests', async ({ page }) => {
    await mockMainInitAndRun(page, { isAdmin: false });

    await page.evaluate(() => {
      // honSupabase is a top-level `const` (supabase-config.js), not a
      // function declaration, so it can't be swapped out via
      // window.honSupabase = ... the way honFetchMyProfile can — mutate the
      // real client's .from method instead, which every caller still sees
      // since they all hold the same object reference.
      honSupabase.from = (table) => {
        window.__lastInsertTable = table;
        return {
          insert: async (payload) => {
            window.__lastInsertPayload = payload;
            return { error: null };
          },
        };
      };
    });

    await page.fill('#hon-lock-name', 'Ada Lovelace');
    await page.fill('#hon-lock-email', 'ada@example.com');
    await page.click('#hon-lock-submit');

    await expect(page.locator('#hon-lock-status')).toContainText("You’re on the list");

    const { table, payload } = await page.evaluate(() => ({
      table: window.__lastInsertTable,
      payload: window.__lastInsertPayload,
    }));
    expect(table).toBe('waitlist_requests');
    expect(payload).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', note: null });
  });

  test('a failed waitlist submission shows the error and re-enables the form', async ({ page }) => {
    await mockMainInitAndRun(page, { isAdmin: false });

    await page.evaluate(() => {
      honSupabase.from = () => ({
        insert: async () => { throw new Error('network unreachable'); },
      });
    });

    await page.fill('#hon-lock-name', 'Ada Lovelace');
    await page.fill('#hon-lock-email', 'ada@example.com');
    await page.click('#hon-lock-submit');

    await expect(page.locator('#hon-lock-status')).toContainText('network unreachable');
    await expect(page.locator('#hon-lock-submit')).toBeEnabled();
  });

  test('"Site team? Sign in" reveals a compact sign-in form and calls honSignInWithEmail', async ({ page }) => {
    await mockMainInitAndRun(page, { isAdmin: false });

    await page.evaluate(() => {
      window.honSignInWithEmail = async (email) => { window.__signInEmail = email; };
    });

    await expect(page.locator('#hon-lock-signin-form')).toBeHidden();
    await page.click('#hon-lock-team-toggle');
    await expect(page.locator('#hon-lock-signin-form')).toBeVisible();

    await page.fill('#hon-lock-signin-email', 'admin@example.com');
    await page.click('#hon-lock-signin-submit');

    await expect(page.locator('#hon-lock-signin-status')).toContainText('Check admin@example.com');
    expect(await page.evaluate(() => window.__signInEmail)).toBe('admin@example.com');
  });
});

test.describe('Coming-soon lock screen (index.html splash)', () => {
  async function mockIndexInitAndRun(page, { isAdmin = false } = {}) {
    await page.goto('/index.html');
    await page.evaluate(({ isAdmin }) => {
      window.honFetchMyProfile = async () => (isAdmin ? { user_id: 'admin-1', is_admin: true, banned: false } : null);
      document.getElementById('splash-grid').innerHTML = '';
    }, { isAdmin });
    await page.evaluate(() => window.honRunIndexInit({ skipLockCheck: false }));
  }

  test('a non-admin visitor sees the lock screen instead of the splash grid', async ({ page }) => {
    await mockIndexInitAndRun(page, { isAdmin: false });

    await expect(page.locator('#hon-lock-screen')).toBeVisible();
    await expect(page.locator('.tile')).toHaveCount(0);
  });

  test('an admin sees the real splash grid, not the lock screen', async ({ page }) => {
    await mockIndexInitAndRun(page, { isAdmin: true });

    await expect(page.locator('#hon-lock-screen')).toHaveCount(0);
    await expect(page.locator('.tile').first()).toBeVisible();
  });
});
