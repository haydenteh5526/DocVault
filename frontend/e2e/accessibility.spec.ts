import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Ask anything about your documents' })).toBeVisible({
      timeout: 10_000,
    });
    const tour = page.getByRole('dialog', { name: 'Welcome to DocVault!' });
    await expect(tour).toBeVisible();
    await expectNoWcagViolations(page, '[role="dialog"]');
    await tour.getByRole('button', { name: 'Skip tour' }).last().click();
    await expect(tour).toBeHidden();
    await expectNoWcagViolations(page);

    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
    await expectNoWcagViolations(page);
  });
});
