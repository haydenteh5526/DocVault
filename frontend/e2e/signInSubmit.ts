import { test, type Page, type Response } from '@playwright/test';

/**
 * Click "Sign in" and return the sign-in response.
 *
 * The API allows 10 sign-ins a minute per address, and a whole browser run can stay inside that
 * minute, so a sign-in may come back 429. When it does, wait out the limit and try once more:
 * the test's timeout is extended first, then the wait is the Retry-After header's seconds if it
 * has one, otherwise 61 s. At most two attempts are made; a second 429 fails with a clear error.
 * Any other status is returned for the caller to check.
 */
export async function submitSignIn(page: Page, exact = false): Promise<Response> {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const responded = page.waitForResponse(
      response => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign in', exact }).click();
    const response = await responded;
    if (response.status() !== 429) return response;
    if (attempt === attempts) {
      throw new Error(`Sign-in was rate limited (429) on both of ${attempts} attempts; the API allows 10 sign-ins a minute per address.`);
    }
    test.info().setTimeout(test.info().timeout + 75_000);
    const retryAfter = Number(response.headers()['retry-after']);
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 61;
    await page.waitForTimeout(seconds * 1000);
  }
  throw new Error('Sign-in did not complete.');
}
