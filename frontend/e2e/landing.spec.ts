import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

// Needs no account, so it runs with the normal browser suite.
const bottom = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  return box!.y + box!.height;
};

test.describe('the landing page', () => {
  test('at 1366 x 768 the eyebrow, the headline, the button and the top of the picture are on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const eyebrow = page.getByText('DocVault · personal AI document assistant');
    expect(await bottom(eyebrow)).toBeLessThanOrEqual(768);
    const headline = page.getByRole('heading', { level: 1, name: 'Ask your documents anything.' });
    expect(await bottom(headline)).toBeLessThanOrEqual(768);
    const button = page.getByRole('region', { name: 'Ask your documents anything.' }).getByRole('link', { name: 'Get started' });
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

  test('has no automated WCAG A/AA violations at 390 x 844, and the setup card is keyboard-reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.flatMap(n => n.target) }))).toEqual([]);
    await page.getByRole('region', { name: 'Setup commands' }).focus();
    await expect(page.getByRole('region', { name: 'Setup commands' })).toBeFocused();
  });

  test('keeps the tinted header at the top and shows its border once the page scrolls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const header = page.getByRole('banner');
    const style = () => header.evaluate(el => {
      const s = getComputedStyle(el);
      return { blur: s.backdropFilter, border: s.borderBottomColor };
    });
    await expect(header).toHaveAttribute('data-scrolled', 'false');
    expect(await style()).toEqual({ blur: 'none', border: 'rgba(0, 0, 0, 0)' });
    await page.mouse.wheel(0, 1200);
    await expect(header).toHaveAttribute('data-scrolled', 'true');
    expect(await style()).toEqual({ blur: 'none', border: 'rgb(34, 34, 38)' });
    expect((await header.boundingBox())!.y).toBe(0);
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('the hero tiles follow the cursor and the header links brighten on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    const tile = page.locator('.float-mark-file');
    await expect(tile).toBeVisible();
    const hero = (await page.locator('.landing-hero').boundingBox())!;
    await page.mouse.move(hero.x + hero.width - 2, hero.y + 2);
    // Near the top-right corner the file tile (depth 0.9) settles at about 16 px right and 12 px up.
    await expect
      .poll(async () => (await tile.evaluate(el => getComputedStyle(el).translate)).split(' ').map(parseFloat))
      .toEqual([expect.closeTo(16.2, 0), expect.closeTo(-12.6, 0)]);
    const signIn = page.getByRole('banner').getByRole('link', { name: 'Sign in' });
    const colour = () => signIn.evaluate(el => getComputedStyle(el).color);
    expect(await colour()).toBe('rgb(196, 196, 202)');
    await signIn.hover();
    await expect.poll(colour).toBe('rgb(242, 242, 243)');
    expect(await signIn.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  });

  test('thins the tiles out up to 1100 px and hides them below 900 px', async ({ page }) => {
    for (const [width, visible] of [[1000, ['receipt', 'manual']], [850, []]] as const) {
      await page.setViewportSize({ width, height: 768 });
      await page.goto('/');
      for (const name of ['docbot', 'shopping', 'receipt', 'manual', 'file', 'warranty'])
        if ((visible as readonly string[]).includes(name)) await expect(page.locator(`.float-mark-${name}`)).toBeVisible();
        else await expect(page.locator(`.float-mark-${name}`)).toBeHidden();
    }
  });

  test('lists the eight questions once, and nothing moves with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.sr-only li')).toHaveCount(8);
    await expect(page.locator('.marquee-track')).toHaveCount(0);
    await expect(page.locator('.float-tile').first()).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.h1-line').first()).toHaveCSS('opacity', '1');
    await expect(page.locator('.float-mark').first()).toHaveCSS('translate', 'none');
  });
});
