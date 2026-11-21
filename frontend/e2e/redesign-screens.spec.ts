import { test, expect, type Page } from '@playwright/test';
import { submitSignIn } from './signInSubmit';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { OCTOBER_BILL, SEED_DOCUMENTS, type SeedDocument } from './fixtures/redesign/documents';

// Records the screens of the web app for the website redesign.
//
//   E2E_SCREENSHOTS=1 E2E_SCREENSHOT_SET=before npx playwright test redesign-screens
//
// It is skipped unless E2E_SCREENSHOTS=1, so the normal browser suite never runs it.
// It needs a disposable stack and a verified synthetic account (E2E_EMAIL, E2E_PASSWORD).
// Screenshots go to evaluation/redesign/<set>/<screen>-<width>-<theme>.png, where <set>
// is "before" or "after". Use the same routes and sizes for both sets so each pair compares.

const SET = process.env.E2E_SCREENSHOT_SET === 'after' ? 'after' : 'before';
const OUT_DIR = path.resolve(process.cwd(), '..', 'evaluation', 'redesign', SET);
const WIDTHS = [
  { name: '1366', width: 1366, height: 850 },
  { name: '390', width: 390, height: 844 },
];
const THEMES = ['light', 'dark'] as const;

test.describe.configure({ mode: 'serial' });

async function drawDocument(page: Page, doc: SeedDocument): Promise<Buffer> {
  const sheet = await page.context().newPage();
  try {
    await sheet.setViewportSize({ width: 1200, height: 600 });
    const body = doc.lines.map(line => `${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}<br>`).join('');
    await sheet.setContent(`
      <main id="sheet" style="width:1100px;padding:45px;background:#fff;color:#000;font:36px/1.5 Arial,sans-serif">
        ${body}
      </main>
    `);
    return await sheet.locator('#sheet').screenshot({ animations: 'disabled' });
  } finally {
    await sheet.close();
  }
}

async function signIn(page: Page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(email!);
  await page.getByRole('button', { name: /Continue with Email/i }).click();
  await page.getByPlaceholder('Password').fill(password!);
  await submitSignIn(page);
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}

/** The screens need a known account, so remove the documents and housemates earlier runs left. */
async function clearAccount(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const headers = { Authorization: `Bearer ${token}` };
  const listed = await (await page.request.get('/api/v1/documents', { headers })).json();
  for (const doc of listed.documents ?? []) await page.request.delete(`/api/v1/documents/${doc.id}`, { headers });
  const housemates = await (await page.request.get('/api/v1/housemates', { headers })).json();
  for (const housemate of housemates) await page.request.delete(`/api/v1/housemates/${housemate.id}`, { headers });
}

/** Take one screenshot for every width and theme, reloading so each theme starts clean. */
async function shoot(page: Page, name: string, url: string, ready?: () => Promise<void>) {
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(url);
      await page.evaluate(value => localStorage.setItem('theme', value), theme);
      await page.reload();
      if (ready) await ready();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, `${name}-${size.name}-${theme}.png`), fullPage: false });
    }
  }
}

test('record the redesign screens', async ({ page }) => {
  test.skip(process.env.E2E_SCREENSHOTS !== '1', 'Set E2E_SCREENSHOTS=1 to record the redesign screens');
  test.setTimeout(900_000);
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'A verified synthetic account is required');
  mkdirSync(OUT_DIR, { recursive: true });

  await page.addInitScript(() => {
    localStorage.setItem('docvault-onboarding-done', '1');
    localStorage.setItem('docvault-first-upload', '1');
  });

  // Signed out.
  await shoot(page, 'landing', '/');
  await shoot(page, 'login', '/login');

  // Signed in, with no documents yet.
  await signIn(page);
  await clearAccount(page);
  await shoot(page, 'documents-empty', '/app/documents');

  // Upload the twelve documents through the API, so the screenshots do not wait on the upload page.
  const images = new Map<string, Buffer>();
  for (const doc of SEED_DOCUMENTS) images.set(doc.title, await drawDocument(page, doc));
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const ids = new Map<string, string>();
  for (const doc of SEED_DOCUMENTS) {
    const response = await page.request.post('/api/v1/documents', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: `${doc.title}.png`, mimeType: 'image/png', buffer: images.get(doc.title)! } },
    });
    expect(response.status()).toBe(201);
    ids.set(doc.title, (await response.json()).id as string);
  }
  const billUrl = `/app/documents/${ids.get(OCTOBER_BILL)}`;

  // The October bill is read once its review shows the amount.
  await page.goto(billUrl);
  const review = page.getByRole('region', { name: 'Bill review' });
  await expect(review).toContainText('€123.47', { timeout: 120_000 });

  // The list checks each document's status after it loads, so wait for that before taking the picture.
  const listSettled = async () => {
    await expect(page.getByRole('link', { name: /\.png$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Checking status')).toHaveCount(0, { timeout: 60_000 });
  };
  await shoot(page, 'home', '/app', async () => { await expect(page.getByRole('heading', {name:'DocBot', exact:true})).toBeVisible(); });
  await shoot(page, 'documents', '/app/documents', listSettled);
  await shoot(page, 'documents-search', '/app/documents?q=october', listSettled);
  await shoot(page, 'documents-no-match', '/app/documents?q=octber');
  await shoot(page, 'bill-unconfirmed', billUrl, async () => {
    await expect(review).toContainText('€123.47', { timeout: 30_000 });
  });

  // Confirm the bill, then split it among four people and propose a reminder.
  await page.setViewportSize({ width: 1366, height: 850 });
  await page.goto(billUrl);
  await review.getByRole('button', { name: 'Review and confirm' }).click({ timeout: 30_000 });
  await review.getByRole('button', { name: 'Check values' }).click();
  await review.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(review).toContainText('Confirmed · revision 1');
  await shoot(page, 'bill-confirmed', billUrl, async () => {
    await expect(review).toContainText('Confirmed · revision 1', { timeout: 30_000 });
  });

  await page.setViewportSize({ width: 1366, height: 850 });
  await page.goto(billUrl);
  const split = page.getByRole('region', { name: 'Bill split' });
  await split.getByRole('button', { name: 'Split this bill' }).click({ timeout: 30_000 });
  for (const name of ['Aoife', 'Ben', 'Chidi', 'Dara']) {
    await split.getByLabel('Add a housemate').fill(name);
    await split.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(split.getByRole('checkbox', { name })).toBeChecked();
  }
  await split.getByRole('button', { name: 'Calculate shares' }).click();
  await split.getByRole('button', { name: 'Save split' }).click();
  await expect(split).toContainText('Saved · split 1');

  const reminder = page.getByRole('region', { name: 'Reminder' });
  await reminder.getByLabel('Days before the due date').fill('2');
  await reminder.getByRole('button', { name: 'Propose reminder' }).click();
  await expect(reminder.getByText('Approve this reminder', { exact: true })).toBeVisible({ timeout: 30_000 });
  await shoot(page, 'reminder-proposal', billUrl, async () => {
    await expect(reminder.getByText('Approve this reminder', { exact: true })).toBeVisible({ timeout: 30_000 });
  });

  // The upload page with one file chosen and the upload held in flight.
  // The request is never sent, so the page stays in "uploading" for the screenshot.
  await page.route('**/api/v1/documents', async route => {
    if (route.request().method() === 'POST') await new Promise(() => undefined);
    else await route.continue();
  });
  for (const theme of THEMES) {
    await page.evaluate(value => localStorage.setItem('theme', value), theme);
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/app/upload');
      await page.locator('input[type="file"]').first().setInputFiles({
        name: 'Kettle receipt.png',
        mimeType: 'image/png',
        buffer: images.get('Kettle receipt')!,
      });
      await page.getByRole('main').getByRole('button', { name: /^Upload/ }).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT_DIR, `upload-mid-${size.name}-${theme}.png`) });
    }
  }
});

// Needs the verified synthetic account (E2E_EMAIL, E2E_PASSWORD); it adds one document and removes it again.
test('documents list at 390 px does not scroll sideways, and every title link is at least 44 px tall', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'A verified synthetic account is required');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const headers = { Authorization: `Bearer ${token}` };
  const onePixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const response = await page.request.post('/api/v1/documents', {
    headers,
    multipart: { file: { name: 'Row height check.png', mimeType: 'image/png', buffer: onePixel } },
  });
  expect(response.status()).toBe(201);
  const id = (await response.json()).id as string;
  try {
    await page.goto('/app/documents');
    await expect(page.getByRole('link', { name: 'Row height check.png' })).toBeVisible({ timeout: 15_000 });
    const links = await page.locator('main li a[title]').all();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(true);
  } finally {
    await page.request.delete(`/api/v1/documents/${id}`, { headers });
  }
});
