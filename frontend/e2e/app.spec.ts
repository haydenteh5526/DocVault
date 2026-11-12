import { test, expect, type Page } from '@playwright/test';

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
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByRole('button', { name: /Continue with Email/i }).click();
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Ask anything about your documents' })).toBeVisible({ timeout: 10000 });
}

/** Navigate inside the single-page app without reloading it. */
async function goInApp(page: Page, path: string) {
  await page.evaluate(url => {
    history.pushState({}, '', url);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

// A deterministic, high-contrast PNG drawn in a separate page, so the page under test keeps its state.
async function billImage(page: Page): Promise<Buffer> {
  const fixture = await page.context().newPage();
  try {
    await fixture.setViewportSize({ width: 1200, height: 500 });
    await fixture.setContent(`
      <main id="ocr-fixture" style="width:1100px;height:360px;padding:45px;background:#fff;color:#000;font:40px/1.5 Arial,sans-serif">
        Electricity bill<br>
        Total amount due: EUR 123.47<br>
        Billing period: 1 October 2026 to 31 October 2026<br>
        Payment due date: 23 November 2026
      </main>
    `);
    return await fixture.locator('#ocr-fixture').screenshot({ animations: 'disabled' });
  } finally {
    await fixture.close();
  }
}

/** Upload the bill fixture and leave its document detail open. Returns the document id. */
async function uploadBillImage(page: Page, image: Buffer): Promise<string> {
  await goInApp(page, '/app/upload');
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
  const id = (await response.json()).id as string;

  await expect(page.getByRole('heading', { name: 'Upload Complete!' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /playwright-bill\.png/i }).click();
  return id;
}

async function deleteDocument(page: Page, id: string) {
  await page.evaluate(async (documentId) => {
    await fetch(`/api/v1/documents/${documentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
  }, id);
}

/** The seeded accounts persist between runs, so remove their saved housemates. */
async function clearHousemates(page: Page) {
  await page.evaluate(async () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const list = await (await fetch('/api/v1/housemates', { headers })).json();
    for (const housemate of list) {
      await fetch(`/api/v1/housemates/${housemate.id}`, { method: 'DELETE', headers });
    }
  });
}

test.describe('Bill review and split', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('docvault-onboarding-done', '1');
      localStorage.setItem('docvault-first-upload', '1');
    });
  });

  test('verified user can review a bill image against its OCR evidence', async ({ page }) => {
    test.setTimeout(120_000);
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, 'CI seed credentials are required for this integration test');

    const image = await billImage(page);
    await signIn(page, email!, password!);
    await clearHousemates(page);

    let documentId: string | undefined;
    try {
      documentId = await uploadBillImage(page, image);
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

      const split = page.getByRole('region', { name: 'Bill split' });
      await split.getByRole('button', { name: 'Split this bill' }).click();
      for (const name of ['Aoife', 'Ben', 'Chidi', 'Dara']) {
        await split.getByLabel('Add a housemate').fill(name);
        await split.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(split.getByRole('checkbox', { name })).toBeChecked();
      }
      await split.getByRole('button', { name: 'Calculate shares' }).click();
      await expect(split).toContainText('Equal split of €125.00 from revision 1');
      await expect(split).toContainText('The total divides exactly.');
      await split.getByRole('button', { name: 'Save split' }).click();
      await expect(split).toContainText('Saved · split 1');

      // Confirm the amount the bill states as revision 2: the saved split becomes stale.
      await review.getByRole('button', { name: 'Edit confirmed values' }).click();
      await review.getByLabel('Amount due (€)').fill('123.47');
      await review.getByRole('button', { name: 'Check values' }).click();
      await review.getByRole('button', { name: 'Confirm and save' }).click();
      await expect(review).toContainText('Confirmed · revision 2');
      await expect(split).toContainText('The confirmed bill is now revision 2 (€123.47). This split uses revision 1 and was not recalculated.');
      await expect(split).toContainText('Contributions total €125.00.');

      // The December acceptance case.
      await split.getByRole('button', { name: 'Split again' }).click();
      await split.getByRole('button', { name: 'Calculate shares' }).click();
      await expect(split.getByRole('listitem')).toHaveText([/Aoife.*€30\.87/, /Ben.*€30\.87/, /Chidi.*€30\.87/, /Dara.*€30\.86/]);
      await expect(split).toContainText('3 leftover cents went one each to the first 3 people in this order.');
      await expect(split).toContainText('Contributions total €123.47, the confirmed amount.');
      await split.getByRole('button', { name: 'Save split' }).click();
      await expect(split).toContainText('Saved · split 2');
      await page.reload();
      await expect(split).toContainText('Saved · split 2', { timeout: 30_000 });
      await expect(split.getByRole('listitem')).toHaveCount(4);
      await expect(split).toContainText('Contributions total €123.47.');
    } finally {
      if (documentId) await deleteDocument(page, documentId);
      await clearHousemates(page);
    }
  });

  test("a second account in the same browser never sees the first account's housemates", async ({ page }) => {
    test.setTimeout(120_000);
    const emailA = process.env.E2E_EMAIL;
    const passwordA = process.env.E2E_PASSWORD;
    const emailB = process.env.E2E_EMAIL_2;
    const passwordB = process.env.E2E_PASSWORD_2;
    test.skip(!emailA || !passwordA || !emailB || !passwordB, 'Two seeded accounts are required for this scenario');

    const image = await billImage(page);
    const confirmUnchanged = async () => {
      const review = page.getByRole('region', { name: 'Bill review' });
      await review.getByRole('button', { name: 'Review and confirm' }).click({ timeout: 30_000 });
      await review.getByRole('button', { name: 'Check values' }).click();
      await review.getByRole('button', { name: 'Confirm and save' }).click();
      await expect(review).toContainText('Confirmed · revision 1');
    };

    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let routeInstalled = false;
    let documentA: string | undefined;
    let documentB: string | undefined;
    try {
      // 1. Account A saves two housemates.
      await signIn(page, emailA!, passwordA!);
      await clearHousemates(page);
      documentA = await uploadBillImage(page, image);
      await confirmUnchanged();
      const aUrl = new URL(page.url()).pathname;
      const splitA = page.getByRole('region', { name: 'Bill split' });
      await splitA.getByRole('button', { name: 'Split this bill' }).click();
      for (const name of ['Aoife', 'Ben']) {
        await splitA.getByLabel('Add a housemate').fill(name);
        await splitA.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(splitA.getByRole('checkbox', { name })).toBeChecked();
      }

      // 2. Mark this page so a reload would be noticed.
      await page.evaluate(() => { (window as unknown as { __sameSession: boolean }).__sameSession = true; });

      // 3. Log out through the user menu, not by navigation.
      await page.getByRole('button', { name: new RegExp(emailA!) }).click();
      await page.getByRole('button', { name: 'Log out' }).click();

      // 4. Hold B's housemate list.
      await page.route('**/api/v1/housemates', route =>
        route.request().method() === 'GET' ? held.then(() => route.continue()) : route.continue());
      routeInstalled = true;

      // 5. Sign in as B through the login form, in the same page.
      await goInApp(page, '/login');
      await page.getByPlaceholder('name@example.com').fill(emailB!);
      await page.getByRole('button', { name: /Continue with Email/i }).click();
      await page.getByPlaceholder('Password').fill(passwordB!);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('heading', { name: 'Ask anything about your documents' })).toBeVisible({ timeout: 10000 });
      expect(await page.evaluate(() => (window as unknown as { __sameSession?: boolean }).__sameSession)).toBe(true);

      // 6. B uploads and opens a bill; while B's list is held nothing of A's is shown.
      documentB = await uploadBillImage(page, image);
      await confirmUnchanged();
      const splitB = page.getByRole('region', { name: 'Bill split' });
      await splitB.getByRole('button', { name: 'Split this bill' }).click();
      await expect(splitB).toContainText('Loading your housemates…');
      await expect(page.getByText('Aoife')).toHaveCount(0);
      await expect(page.getByText('Ben', { exact: true })).toHaveCount(0);

      // 7. Release B's list: it is empty, and still nothing of A's.
      release();
      await expect(splitB).toContainText('Add the people who share this bill.');
      await expect(page.getByText('Aoife')).toHaveCount(0);
      await expect(page.getByText('Ben', { exact: true })).toHaveCount(0);

      // 8. Back to A's document URL without reloading: B cannot see A's document or housemates.
      const documentRequest = page.waitForResponse(response => response.url().includes(`/api/v1/documents/${documentA}`));
      await goInApp(page, aUrl);
      await expect(page.getByRole('region', { name: 'Bill split' })).toHaveCount(0);
      await expect(page.getByText('Aoife')).toHaveCount(0);
      await documentRequest;
      await expect(page.getByRole('region', { name: 'Bill split' })).toHaveCount(0);
      await expect(page.getByText('Aoife')).toHaveCount(0);

      // 9. The service worker stores no API responses.
      const stored = await page.evaluate(async () => {
        const urls: string[] = [];
        for (const name of await caches.keys()) {
          for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
        }
        return urls;
      });
      expect(stored.filter(url => url.includes('/api/'))).toEqual([]);
    } finally {
      release();
      if (routeInstalled) await page.unroute('**/api/v1/housemates');
      // Clean up as best effort, so a cleanup problem never hides the failure that ended the test.
      try {
        if (documentB) await deleteDocument(page, documentB);
        // The login page redirects a signed-in user, so sign out of whichever account is open first.
        await page.evaluate(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
        });
        await signIn(page, emailA!, passwordA!);
        await clearHousemates(page);
        if (documentA) await deleteDocument(page, documentA);
      } catch (error) {
        console.error('Clean-up after the two-account scenario failed:', error);
      }
    }
  });
});
