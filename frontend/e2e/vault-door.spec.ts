import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { submitSignIn } from './signInSubmit';

// The vault door on the account pages (redesign PR 2).
//
// Accessibility and behaviour checks run in the normal suite. The screenshots are recorded only with
//
//   E2E_SCREENSHOTS=1 npx playwright test vault-door
//
// into evaluation/docbot-redesign/vault/. A recording run stretches the 400 ms and 600 ms waits so the
// error and open states stay on screen long enough to photograph; nothing else about the page changes.

const OUT_DIR = path.resolve(process.cwd(), '..', 'evaluation', 'docbot-redesign', 'vault');
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1366, height: 850 };

async function expectNoWcagViolations(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition: none !important; }' });
  await page.waitForTimeout(50);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.flatMap(n => n.target) }))).toEqual([]);
}

async function toPasswordStep(page: Page, email: string) {
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByRole('button', { name: /Continue with Email/i }).click();
  await expect(page.getByPlaceholder('Password')).toBeVisible();
}

test.describe('the vault door at 390 px', () => {
  test.use({ viewport: MOBILE });

  test('sign-in, register and forgot password have no automated WCAG A/AA violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await page.locator('.vault-door').count()).toBe(1);
    await expect(page.locator('.vault-door')).toHaveAttribute('aria-hidden', 'true');
    await expectNoWcagViolations(page);
    await toPasswordStep(page, 'someone@example.com');
    await page.getByPlaceholder('Password').fill('abcdefgh');
    await expect(page.locator('.vault-door')).toHaveClass(/vault-entering/);
    await expectNoWcagViolations(page);

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expectNoWcagViolations(page);

    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
    await expect(page.locator('.vault-door [data-part="badge-key"]')).toHaveCount(1);
    await expectNoWcagViolations(page);
  });

  test('every door page fits the screen without a sideways scroll', async ({ page }) => {
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const route of ['/login', '/register', '/forgot-password']) {
      await page.goto(route);
      await expect(page.locator('.safe-stage')).toBeVisible();
      expect(await overflow(), route).toBeLessThanOrEqual(0);
    }
    await page.goto('/register');
    await toPasswordStep(page, 'someone@example.com');
    await page.getByPlaceholder('Password').fill('Password123!');
    expect(await overflow(), 'register, password step').toBeLessThanOrEqual(0);
    await expect(page.locator('aside')).toHaveCount(0);
  });

  test('the whole console can be reached and used from the keyboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').focus();
    await page.keyboard.type('someone@example.com');
    await page.keyboard.press('Enter');
    await expect(page.getByPlaceholder('Password')).toBeFocused();
    await page.keyboard.type('abcdefgh');
    await expect(page.locator('.vault-door')).toHaveClass(/vault-entering/);
    const reached: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      reached.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || ''));
    }
    expect(reached.join('|')).toContain('Sign in');
    expect(reached.join('|')).toContain('Forgot password?');
  });
});

test.describe('signing in with the vault door', () => {
  test('a wrong password shakes the door, shows the message and lets you try again', async ({ page }) => {
    await page.goto('/login');
    await toPasswordStep(page, 'nobody-here@example.com');
    await page.getByPlaceholder('Password').fill('WrongPassword1!');
    const response = await submitSignIn(page);
    expect(response.status()).not.toBe(200);
    await expect(page.locator('.vault-door')).toHaveClass(/vault-(error|closed)/);
    await expect(page.locator('.text-destructive')).toBeVisible();
    await expect(page.locator('.vault-door')).toHaveClass(/vault-closed/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  });

  test('a correct password opens the door and lands on DocBot', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');
    await page.addInitScript(() => localStorage.setItem('docvault-onboarding-done', '1'));
    await page.goto('/login');
    await toPasswordStep(page, email!);
    await page.getByPlaceholder('Password').fill(password!);
    const started = Date.now();
    const response = await submitSignIn(page);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'DocBot', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/app$/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

test.describe('recording the vault door', () => {
  test.skip(process.env.E2E_SCREENSHOTS !== '1', 'set E2E_SCREENSHOTS=1 to record screenshots');
  test.describe.configure({ mode: 'serial' });

  for (const size of [{ name: '1366', ...DESKTOP }, { name: '390', ...MOBILE }]) {
    test(`states at ${size.name} px`, async ({ page }) => {
      const email = process.env.E2E_EMAIL;
      const password = process.env.E2E_PASSWORD;
      mkdirSync(OUT_DIR, { recursive: true });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.addInitScript(() => {
        const original = window.setTimeout.bind(window);
        window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
          original(fn, ms === 600 || ms === 400 ? 30_000 : ms, ...args)) as typeof window.setTimeout;
      });
      const shot = (state: string) => page.screenshot({ path: path.join(OUT_DIR, `vault-${state}-${size.name}.png`), animations: 'disabled' });

      await page.goto('/login');
      await toPasswordStep(page, 'nobody-here@example.com');
      await shot('closed');

      await page.getByPlaceholder('Password').fill('abcdefghij');
      await expect(page.locator('.vault-door')).toHaveClass(/vault-entering/);
      await page.waitForTimeout(200);
      await shot('entering');

      await page.getByPlaceholder('Password').fill('WrongPassword1!');
      await submitSignIn(page);
      await expect(page.locator('.vault-door')).toHaveClass(/vault-error/);
      await shot('error');

      test.skip(!email || !password, 'a seeded account is needed for the open state');
      await page.goto('/login');
      await toPasswordStep(page, email!);
      await page.getByPlaceholder('Password').fill(password!);
      await submitSignIn(page);
      await expect(page.locator('.vault-door')).toHaveClass(/vault-open/);
      // About 300 ms in: the bolts are in and the door is part-way round its left hinge.
      await page.waitForTimeout(280);
      await page.screenshot({ path: path.join(OUT_DIR, `vault-swing-${size.name}.png`), animations: 'allow' });
      await page.waitForTimeout(500);
      await shot('open');

      await page.goto('/register');
      await toPasswordStep(page, 'someone@example.com');
      await page.getByPlaceholder('Password').fill('Password123!');
      await shot('register');
      await page.goto('/forgot-password');
      await expect(page.locator('.safe-stage')).toBeVisible();
      await shot('forgot');
    });
  }
});
