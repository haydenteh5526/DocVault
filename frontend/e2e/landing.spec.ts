import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

// Needs no account, so it runs with the normal browser suite.
const bottom = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  return box!.y + box!.height;
};

test.describe('the landing page', () => {
  test('at 1366 x 768 the headline, the button and the top of the picture are on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const headline = page.getByRole('heading', { level: 1, name: 'Your documents, answered and kept on track.' });
    expect(await bottom(headline)).toBeLessThanOrEqual(768);
    const button = page.getByRole('region', { name: 'Your documents, answered and kept on track.' }).getByRole('link', { name: 'Create an account' });
    expect(await bottom(button)).toBeLessThanOrEqual(768);
    const picture = page.getByRole('img', { name: /^DocBot's home:/ });
    await expect(picture).toBeVisible();
    const box = await picture.boundingBox();
    expect(box!.y).toBeLessThan(768);
  });

  test('at 390 x 844 nothing scrolls sideways and the floating tiles are gone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.floating-tiles')).toBeHidden();
  });

  test('has a dark page and no automated WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(10, 10, 11)');
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.flatMap(n => n.target) }))).toEqual([]);
  });

  test('lists the eight questions once, and nothing moves with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.sr-only li')).toHaveCount(8);
    await expect(page.locator('.marquee-track')).toHaveCount(0);
    await expect(page.locator('.docbot-drift')).toHaveCount(0);
  });
});
