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

  test('verified user can upload an image and view Tesseract text', async ({ page }) => {
    test.setTimeout(60_000);
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');

    // Generate a deterministic, high-contrast PNG in Chromium. Keeping the
    // fixture in the browser avoids checking in opaque binary test data.
    await page.setViewportSize({ width: 1200, height: 500 });
    await page.setContent(`
      <main id="ocr-fixture" style="width:1100px;height:360px;padding:45px;background:#fff;color:#000;font:700 64px/1.35 Arial,sans-serif">
        DOCVAULT OCR TEST<br>
        RECEIPT NUMBER 48291<br>
        WARRANTY EXPIRES 2030
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
        name: 'playwright-manual.png',
        mimeType: 'image/png',
        buffer: image,
      });
      await expect(page.getByText('playwright-manual.png')).toBeVisible();

      const uploadResponse = page.waitForResponse(response =>
        response.url().endsWith('/api/v1/documents') && response.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Upload', exact: true }).click();
      const response = await uploadResponse;
      expect(response.status()).toBe(201);
      documentId = (await response.json()).id;

      await expect(page.getByRole('heading', { name: 'Upload Complete!' })).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /playwright-manual\.png/i }).click();
      await expect(page.getByRole('heading', { name: 'playwright-manual.png' })).toBeVisible();
      await page.getByText('Extracted Text').click();
      await expect(page.getByText(/DOCVAULT OCR TEST/i)).toBeVisible();
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
