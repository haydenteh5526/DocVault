import { test, expect } from '@playwright/test';

// These tests run against the real frontend dev server (which proxies /api to
// the backend). Tests 1–2 are pure UI; tests 3–4 exercise the real backend
// (register + login) so they require the API to be running.

test.describe('DocVault auth flow', () => {
  test('login page renders the email step', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });

  test('advances from email to the password step', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill('someone@example.com');
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('registration shows the "check your email" screen', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('name@example.com').fill(`e2e-${Date.now()}@example.com`);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Full name').fill('E2E Tester');
    await page.getByPlaceholder('Password').fill('TestPass123!');
    await page.getByRole('button', { name: 'Create account' }).click();
    // The current flow requires email verification before sign-in.
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 10000 });
  });

  test('invalid login surfaces an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(`nobody-${Date.now()}@example.com`);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill('wrongpassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 10000 });
  });

  test('verified user can sign in and open the protected document dashboard', async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');

    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(email!);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Ask anything about your documents' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('verified user can review a bill image against its OCR evidence', async ({ page }) => {
    test.setTimeout(60_000);
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');

    // Generate a deterministic, high-contrast PNG in Chromium. Keeping the
    // fixture in the browser avoids checking in opaque binary test data.
    await page.setViewportSize({ width: 1200, height: 500 });
    await page.setContent(`
      <main id="ocr-fixture" style="width:1100px;height:360px;padding:45px;background:#fff;color:#000;font:40px/1.5 Arial,sans-serif">
        Electricity bill<br>
        Total amount due: EUR 123.47<br>
        Billing period: 1 October 2026 to 31 October 2026<br>
        Payment due date: 23 November 2026
      </main>
    `);
    const image = await page.locator('#ocr-fixture').screenshot({ animations: 'disabled' });

    await page.addInitScript(() => {
      localStorage.setItem('docvault-onboarding-done', '1');
      localStorage.setItem('docvault-first-upload', '1');
    });
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(email!);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Ask anything about your documents' })).toBeVisible({ timeout: 10000 });

    let documentId: string | undefined;
    try {
      await page.goto('/app/upload');
      await expect(page.getByRole('heading', { name: 'Upload Documents' })).toBeVisible();
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'playwright-bill.png',
        mimeType: 'image/png',
        buffer: image,
      });
      await expect(page.getByText('playwright-bill.png')).toBeVisible();

      const uploadResponse = page.waitForResponse(response =>
        response.url().endsWith('/api/v1/documents') && response.request().method() === 'POST'
      );
      await page.getByRole('main').getByRole('button', { name: 'Upload', exact: true }).click();
      const response = await uploadResponse;
      expect(response.status()).toBe(201);
      documentId = (await response.json()).id;

      await expect(page.getByRole('heading', { name: 'Upload Complete!' })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /playwright-bill\.png/i }).click();
      const review = page.getByRole('region', { name: 'Bill review' });
      await expect(review).toContainText('€123.47', { timeout: 30_000 });
      await expect(review).toContainText('1 October 2026 – 31 October 2026');
      await expect(review.getByText('23 November 2026', { exact: true })).toBeVisible();
      await page.getByText('Extracted Text').click();
      const transcript = (await page.locator('pre').innerText()).split(/\r?\n/);
      const quotes = review.locator('blockquote');
      await expect(quotes).toHaveCount(3);
      for (const quote of await quotes.all()) {
        const line = Number((await quote.locator('span').innerText()).replace('OCR line ', ''));
        expect(await quote.locator('p').innerText()).toBe(transcript[line - 1]);
      }

      await review.getByRole('button', { name: 'Review and confirm' }).click();
      await review.getByLabel('Amount due (€)').fill('125.00');
      await review.getByRole('button', { name: 'View original bill' }).click();
      await page.getByRole('button', { name: 'Summary', exact: true }).click();
      await expect(review.getByLabel('Amount due (€)')).toHaveValue('125.00');
      await review.getByRole('button', { name: 'Check values' }).click();
      await expect(review).toContainText('OCR read: €123.47');
      await review.getByRole('button', { name: 'Confirm and save' }).click();
      await expect(review).toContainText('Confirmed · revision 1');
      await page.reload();
      await expect(review).toContainText('Confirmed · revision 1', { timeout: 30_000 });
      await expect(review).toContainText('€125.00');
      await expect(review).toContainText('Corrected from €123.47');
      await expect(review.locator('blockquote')).toHaveCount(3);
    } finally {
      if (documentId) {
        await page.evaluate(async (id) => {
          await fetch(`/api/v1/documents/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          });
        }, documentId);
      }
    }
  });
});
