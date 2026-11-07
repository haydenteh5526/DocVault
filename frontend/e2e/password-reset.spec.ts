import { test, expect, type APIRequestContext } from '@playwright/test';

test('password recovery works after a rejected login without authentication', async ({ page }) => {
  const email = `recovery-missing-${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByRole('button', { name: /Continue with Email/i }).click();
  await page.getByPlaceholder('Password').fill('WrongPassword123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();

  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByPlaceholder('name@example.com').fill(email);
  const recovery = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/forgot-password'));
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const response = await recovery;
  expect(response.status()).toBe(200);
  expect(response.request().headers()['authorization']).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('verification and password reset arrive in the local inbox and allow sign-in', async ({ page, request }) => {
  const inbox = process.env.E2E_MAILPIT_URL;
  test.skip(!inbox, 'Set E2E_MAILPIT_URL to run against the local email inbox');
  const email = `recovery-${Date.now()}@example.com`;
  const originalPassword = 'OriginalPassword123!';
  const newPassword = 'ChangedPassword456!';
  const messageIds: string[] = [];
  let accessToken: string | undefined;

  async function emailLink(subject: string, path: string) {
    let messageId = '';
    await expect.poll(async () => {
      const response = await request.get(`${inbox}/api/v1/messages`);
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      const message = data.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) =>
        item.Subject === subject && item.To.some(recipient => recipient.Address === email)
      );
      messageId = message?.ID || '';
      return messageId;
    }).not.toBe('');
    messageIds.push(messageId);
    const response = await request.get(`${inbox}/api/v1/message/${messageId}`);
    expect(response.ok()).toBeTruthy();
    const message = await response.json();
    const link = (message.Text as string).split(/\s+/).find(value => value.startsWith('http') && value.includes(path));
    expect(link).toBeTruthy();
    expect(new URL(link!).origin).toBe('http://localhost:3000');
    return link!;
  }

  try {
    const registration = await request.post('/api/v1/auth/register', {
      data: { email, password: originalPassword },
    });
    expect(registration.status()).toBe(201);
    const verificationLink = await emailLink('Verify your DocVault account', '/verify?token=');
    // Verify through the API so React development StrictMode cannot redeem the
    // single-use verification link twice during this recovery-focused test.
    const verification = await request.get(`/api/v1/auth/verify${new URL(verificationLink).search}`);
    expect(verification.status()).toBe(200);

    await page.goto('/forgot-password');
    await page.getByPlaceholder('name@example.com').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.goto(await emailLink('Reset your DocVault password', '/reset-password?token='));
    await page.getByPlaceholder('New password').fill(newPassword);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Password reset', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder('name@example.com').fill(email);
    await page.getByRole('button', { name: /Continue with Email/i }).click();
    await page.getByPlaceholder('Password').fill(newPassword);
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login'));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const login = await loginResponse;
    expect(login.status()).toBe(200);
    accessToken = (await login.json()).access_token;
    await expect(page.getByRole('heading', { name: 'Ask anything about your documents' })).toBeVisible();

    const oldLogin = await signIn(request, email, originalPassword);
    expect(oldLogin.status()).toBe(401);
  } finally {
    // Only remove the account and emails created by this test.
    if (!accessToken) {
      for (const password of [newPassword, originalPassword]) {
        const login = await signIn(request, email, password);
        if (login.ok()) {
          accessToken = (await login.json()).access_token;
          break;
        }
      }
    }
    if (accessToken) {
      const deletion = await request.delete('/api/v1/auth/account', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(deletion.status()).toBe(204);
    }
    for (const id of messageIds) {
      const deletion = await request.delete(`${inbox}/api/v1/messages`, { data: { IDs: [id] } });
      expect(deletion.ok()).toBeTruthy();
    }
  }
});

function signIn(request: APIRequestContext, email: string, password: string) {
  return request.post('/api/v1/auth/login', { data: { email, password } });
}
