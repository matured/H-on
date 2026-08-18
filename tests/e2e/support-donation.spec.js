const { test, expect } = require('@playwright/test');

test.describe('Support page — donation flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/support.html');
  });

  test('tiers render as an accessible radiogroup with nothing selected', async ({ page }) => {
    const group = page.getByRole('radiogroup', { name: 'Choose a contribution amount' });
    await expect(group).toBeVisible();

    const tiers = group.getByRole('radio');
    await expect(tiers).toHaveCount(4);
    for (const tier of await tiers.all()) {
      await expect(tier).toHaveAttribute('aria-checked', 'false');
    }

    await expect(page.getByRole('button', { name: 'Select an amount' })).toBeDisabled();
  });

  test('selecting a fixed tier enables donate and shows the amount', async ({ page }) => {
    await page.getByRole('radio', { name: '$15 Supporter' }).click();

    await expect(page.getByRole('radio', { name: '$15 Supporter' })).toHaveAttribute('aria-checked', 'true');
    const donateBtn = page.getByRole('button', { name: 'Donate $15 →' });
    await expect(donateBtn).toBeEnabled();
    await expect(page.locator('#donate-hint')).toHaveText('You’re about to contribute $15.');
  });

  test('arrow keys move selection through the radiogroup', async ({ page }) => {
    const reader = page.getByRole('radio', { name: '$5 Reader' });
    await reader.focus();
    await page.keyboard.press(' ');
    await expect(reader).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('ArrowRight');
    const supporter = page.getByRole('radio', { name: '$15 Supporter' });
    await expect(supporter).toHaveAttribute('aria-checked', 'true');
    await expect(reader).toHaveAttribute('aria-checked', 'false');
    await expect(supporter).toBeFocused();
  });

  test('custom tier reveals a labeled amount input and validates it', async ({ page }) => {
    await page.getByRole('radio', { name: 'ANY Custom' }).click();

    const input = page.getByLabel('Custom amount (USD)');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('autocomplete', 'off');

    const donateBtn = page.getByRole('button', { name: /Enter a custom amount|Donate \$/ });
    await expect(donateBtn).toBeDisabled();

    await input.fill('0');
    await expect(donateBtn).toBeDisabled();

    await input.fill('75');
    await expect(donateBtn).toBeEnabled();
    await expect(donateBtn).toHaveText('Donate $75 →');
  });

  test('submitting posts to the checkout session function and redirects on success', async ({ page }) => {
    let requestBody = null;
    await page.route('**/functions/v1/create-checkout-session', async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/support.html?donation=success&amount=40' }),
      });
    });

    await page.getByRole('radio', { name: '$40 Patron' }).click();
    await page.getByRole('button', { name: 'Donate $40 →' }).click();

    await page.waitForURL(/donation=success/);
    expect(requestBody.amount).toBe(40);
    expect(requestBody.successUrl).toContain('donation=success');
    expect(requestBody.cancelUrl).toContain('donation=cancelled');

    const confirm = page.locator('#donate-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Contribution recorded');
    await expect(confirm).toContainText('Thank you for the $40');
    await expect(confirm).toHaveAttribute('aria-live', 'polite');

    for (const tier of await page.getByRole('radio').all()) {
      await expect(tier).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: 'Donate $40 →' })).toBeHidden();
  });

  test('shows an error and re-enables the form if checkout session creation fails', async ({ page }) => {
    await page.route('**/functions/v1/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Stripe is not configured' }),
      });
    });

    await page.getByRole('radio', { name: '$15 Supporter' }).click();
    await page.getByRole('button', { name: 'Donate $15 →' }).click();

    await expect(page.locator('#donate-hint')).toContainText('Couldn’t start checkout');
    await expect(page.getByRole('button', { name: 'Donate $15 →' })).toBeEnabled();
  });

  test('donate button shows a visible focus ring on keyboard focus', async ({ page }) => {
    await page.getByRole('radio', { name: '$5 Reader' }).click();
    // Tab (real keyboard nav), not .focus() — Chromium only sets
    // :focus-visible from actual keyboard/programmatic-after-keyboard input,
    // not an unprompted .focus() call.
    await page.keyboard.press('Tab');
    const donateBtn = page.getByRole('button', { name: 'Donate $5 →' });
    await expect(donateBtn).toBeFocused();

    const outline = await donateBtn.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
  });
});
