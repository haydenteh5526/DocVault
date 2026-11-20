import { test, expect, type Page } from '@playwright/test';
import { submitSignIn } from './signInSubmit';

// These scenarios need two verified synthetic accounts (E2E_EMAIL and E2E_EMAIL_2) and a running stack.
// The scenario uses the second account, so "Check now" cannot propose for a bill that a scenario in
// app.spec.ts has confirmed on the first account at the same moment. It also asserts only on its own bill,
// found by a title no other run uses, so other bills in the account cannot change its result.

const DUE_IN_DAYS = 10;
const LEAD_DAYS = 2;

/** Today's date in Ireland, as year, month (1 to 12) and day, which is the date Pip's check uses. */
function dublinToday(): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(new Date()).split('-').map(Number);
  return { y, m, d };
}

/** A date a number of days after today in Ireland, written the way the bill and the panels write it. */
function dublinDatePlus(days: number): string {
  const { y, m, d } = dublinToday();
  return new Date(Date.UTC(y, m - 1, d + days)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByRole('button', { name: /Continue with Email/i }).click();
  await page.getByPlaceholder('Password').fill(password);
  await submitSignIn(page);
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible({ timeout: 10000 });
}

/** Navigate inside the single-page app without reloading it. */
async function goInApp(page: Page, path: string) {
  await page.evaluate(url => {
    history.pushState({}, '', url);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

// A deterministic, high-contrast PNG drawn in a separate page, so the page under test keeps its state.
async function billImage(page: Page, dueDate: string): Promise<Buffer> {
  const fixture = await page.context().newPage();
  try {
    await fixture.setViewportSize({ width: 1200, height: 500 });
    await fixture.setContent(`
      <main id="ocr-fixture" style="width:1100px;height:360px;padding:45px;background:#fff;color:#000;font:40px/1.5 Arial,sans-serif">
        Electricity bill<br>
        Total amount due: EUR 123.47<br>
        Billing period: 1 October 2026 to 31 October 2026<br>
        Payment due date: ${dueDate}
      </main>
    `);
    return await fixture.locator('#ocr-fixture').screenshot({ animations: 'disabled' });
  } finally {
    await fixture.close();
  }
}

/** Upload the bill fixture and leave its document detail open. Returns the document id. */
async function uploadBillImage(page: Page, image: Buffer, fileName: string): Promise<string> {
  await goInApp(page, '/app/upload');
  await expect(page.getByRole('heading', { name: 'Upload Documents' })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: fileName, mimeType: 'image/png', buffer: image });
  await expect(page.getByText(fileName)).toBeVisible();

  const uploadResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/v1/documents') && response.request().method() === 'POST'
  );
  await page.getByRole('main').getByRole('button', { name: 'Upload', exact: true }).click();
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  const id = (await response.json()).id as string;

  await expect(page.getByRole('heading', { name: 'Upload Complete!' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: fileName }).click();
  return id;
}

async function deleteDocument(page: Page, id: string) {
  await page.evaluate(async documentId => {
    await fetch(`/api/v1/documents/${documentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
  }, id);
}

/** The seeded account persists between runs, so put its household preferences back to the defaults. */
async function resetPreferences(page: Page) {
  await page.evaluate(async () => {
    await fetch('/api/v1/household/preferences', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminder_days_before_due: 3, default_split_rule: 'equal', routines_enabled: true }),
    });
  });
}

/** How many reminder proposals one document has, read through the API. */
async function proposalCount(page: Page, id: string): Promise<number> {
  return page.evaluate(async documentId => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const doc = await (await fetch(`/api/v1/documents/${documentId}`, { headers })).json();
    return (doc.reminder_proposals ?? []).length as number;
  }, id);
}

test.describe("Pip's daily check", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('docvault-onboarding-done', '1');
      localStorage.setItem('docvault-first-upload', '1');
    });
  });

  test("Pip's daily check proposes a reminder", async ({ page }) => {
    test.setTimeout(120_000);
    const email = process.env.E2E_EMAIL_2;
    const password = process.env.E2E_PASSWORD_2;
    test.skip(!email || !password, 'Seed a second verified account for the daily check scenario');

    // The bill falls due ten days from today, inside Pip's 14-day window whatever day this runs.
    const due = dublinDatePlus(DUE_IN_DAYS);
    const remindOn = dublinDatePlus(DUE_IN_DAYS - LEAD_DAYS);
    const image = await billImage(page, due);
    await signIn(page, email!, password!);

    // A name no other run or scenario uses, so a bill left behind by a crashed run cannot match the title too.
    const fileName = `playwright-pip-${Date.now()}.png`;
    let documentId: string | undefined;
    try {
      // 1. Confirm the synthetic bill, due within 14 days.
      documentId = await uploadBillImage(page, image, fileName);
      const review = page.getByRole('region', { name: 'Bill review' });
      await review.getByRole('button', { name: 'Review and confirm' }).click({ timeout: 30_000 });
      await expect(review.getByLabel('Amount due (€)')).toHaveValue('123.47', { timeout: 30_000 });
      await review.getByRole('button', { name: 'Check values' }).click();
      await review.getByRole('button', { name: 'Confirm and save' }).click();
      await expect(review).toContainText('Confirmed · revision 1');
      await expect(review.getByText(due, { exact: true })).toBeVisible();
      const title = ((await page.getByRole('heading', { name: fileName }).first().textContent()) ?? '').trim();
      expect(title).not.toBe('');

      // 2. Save a preference of 2 days.
      await goInApp(page, '/app/settings?tab=household');
      await expect(page.getByRole('heading', { level: 2, name: 'Household' })).toBeVisible();
      await page.getByLabel('Remind me before a bill is due').fill(String(LEAD_DAYS));
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

      // 3. Press "Check now". Pip says it checked; this bill's own row, below, shows what it proposed.
      await goInApp(page, '/app/documents');
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Check now' }).click();
      await expect(page.getByText(/Pip checked your bills: /).first()).toBeVisible({ timeout: 30_000 });

      // 4. The bill is under Needs attention with "Reminder awaiting approval".
      const attention = page.getByRole('region', { name: 'Needs attention' });
      const row = attention.getByRole('listitem').filter({ hasText: title });
      await expect(row).toContainText('Reminder awaiting approval', { timeout: 30_000 });

      // 5. In the bill panel, the history says "Proposed by Pip's daily check". Nothing was saved yet.
      await row.getByRole('link', { name: 'Open bill' }).click();
      const reminder = page.getByRole('region', { name: 'Reminder' });
      await expect(reminder.getByText('Approve this reminder', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(reminder.getByText(`(${LEAD_DAYS} days before the due date)`, { exact: true })).toBeVisible();
      await expect(reminder.getByRole('group', { name: 'History' })).toContainText("Proposed by Pip's daily check");

      // 6. "Approve and save" saves it once.
      await reminder.getByRole('button', { name: 'Approve and save' }).click();
      await expect(reminder.getByText(`Saved · reminder for ${remindOn}`, { exact: true })).toBeVisible();
      await page.reload();
      await expect(reminder.getByText(`Saved · reminder for ${remindOn}`, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(reminder.getByRole('group', { name: 'History' }).getByText(/^Saved ·/)).toHaveCount(1);

      // 7. A second "Check now" proposes nothing more for this bill: it still has its one proposal.
      await goInApp(page, '/app/documents');
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Check now' }).click();
      await expect(page.getByText(/Pip checked your bills: /).first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => proposalCount(page, documentId!)).toBe(1);
      await expect(attention.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
    } finally {
      // The seeded account persists: leave no bill behind and no changed preference for the next scenario.
      try {
        await resetPreferences(page);
        if (documentId) await deleteDocument(page, documentId);
      } catch (error) {
        console.error("Clean-up after Pip's daily check scenario failed:", error);
      }
    }
  });
});
