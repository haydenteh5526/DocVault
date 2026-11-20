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
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible({
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

  test('the public pages are light and the signed-in app is dark', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');
    await page.addInitScript(() => localStorage.setItem('docvault-onboarding-done', '1'));
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await isDark()).toBe(false);
    expect(await page.locator('.poster').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    await expectNoWcagViolations(page);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await isDark()).toBe(false);
    await expectNoWcagViolations(page);

    await page.getByPlaceholder('name@example.com').fill(email!);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill(password!);
    await submitSignIn(page);
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/app$/);
    expect(await isDark()).toBe(true);
    await page.goto('/app/documents');
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    expect(await isDark()).toBe(true);
  });
});
