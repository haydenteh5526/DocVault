import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { submitSignIn } from './signInSubmit';

async function expectNoWcagViolations(page: Page, include?: string) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition: none !important;
      }
    `,
  });
  await page.waitForTimeout(50);
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder.include(include);
  const results = await builder.analyze();

  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target),
  }));
  expect(summary).toEqual([]);
}

test.describe('WCAG regression checks', () => {
  test('landing page has no automated WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoWcagViolations(page);
  });

  test('login flow has no automated WCAG A/AA violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expectNoWcagViolations(page);

    await page.getByPlaceholder('name@example.com').fill('someone@example.com');
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expectNoWcagViolations(page);
  });

  test('authenticated app shell has no automated WCAG A/AA violations', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');

    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(email!);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill(password!);
    await submitSignIn(page);
    await expect(page.getByRole('heading', { name: 'DocBot', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expectNoWcagViolations(page);

    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    await expectNoWcagViolations(page);
  });
});

test.describe('with a dark system theme', () => {
  test.use({ colorScheme: 'dark' });

  test('the landing and signed-in pages are dark and account entry is light', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');
    await page.addInitScript(() => localStorage.setItem('docvault-onboarding-done', '1'));
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await isDark()).toBe(false);
    expect(await page.locator('.docbot-site').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(10, 10, 11)');
    await expectNoWcagViolations(page);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await isDark()).toBe(false);
    await expectNoWcagViolations(page);

    await page.getByPlaceholder('name@example.com').fill(email!);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill(password!);
    await submitSignIn(page);
    await expect(page.getByRole('heading', { name: 'DocBot', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/app$/);
    expect(await isDark()).toBe(true);
    await page.goto('/app/documents');
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    expect(await isDark()).toBe(true);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`with a ${scheme} system theme`, () => {
    test.use({ colorScheme: scheme });

    test('the Ask composer shows one soft focus border', async ({ page }) => {
      const email = process.env.E2E_EMAIL;
      const password = process.env.E2E_PASSWORD;
      test.skip(!email || !password, 'CI seed credentials are required for this integration test');
      await page.addInitScript(() => localStorage.setItem('docvault-onboarding-done', '1'));

      await page.goto('/login');
      await page.getByPlaceholder('name@example.com').fill(email!);
      await page.getByRole('button', { name: /Continue with Email/i }).click();
      await page.getByPlaceholder('Password').fill(password!);
      await submitSignIn(page);
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible({ timeout: 10_000 });
      await page.goto('/app/ask');

      const box = page.getByPlaceholder(/Ask a question/);
      const wrapper = box.locator('xpath=..');
      await expect(box).toBeVisible();
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      const unfocusedBorder = await wrapper.evaluate(element => getComputedStyle(element).borderTopColor);

      await box.focus();
      await expect(box).toBeFocused();
      expect(await box.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
      const focused = await wrapper.evaluate(element => {
        const style = getComputedStyle(element);
        return { border: style.borderTopColor, shadow: style.boxShadow };
      });
      expect(focused.border).not.toBe(unfocusedBorder);
      expect(focused.shadow).toBe('none');

      await page.keyboard.type('hello');
      await page.keyboard.press('Tab');
      const send = page.getByRole('button', { name: 'Send message' });
      await expect(send).toBeFocused();
      const outline = await send.evaluate(element => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(outline).toEqual({ style: 'solid', width: '2px' });
    });
  });
}
