import { expect, test } from '@playwright/test';
import { APP_URL, launch } from './helpers';

test('refresh keeps the layout styled while editor JavaScript is loading', async ({ page }) => {
  test.skip(!APP_URL.startsWith('http'), 'Run against the dev server with TWEAKERR_URL to delay module loading.');
  await launch(page);
  await page.waitForFunction(() => !!(window as any).tweakerr);

  // Hold the entry module so the normally brief unstyled refresh is observable.
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/src/main.ts*', async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('#app')).toBeAttached();
    await expect(page.locator('#app')).toHaveCSS('display', 'grid', { timeout: 2000 });
    await expect(page.locator('.toolbar')).toHaveCSS('display', 'flex');
    await expect(page.locator('.side.right')).toHaveCSS('grid-column-start', 'right');
    expect(await page.evaluate(() => !!(window as any).tweakerr)).toBe(false);
  } finally {
    await page.screenshot({ path: test.info().outputPath('refresh-before-javascript.png') });
    release();
  }
  await page.waitForFunction(() => !!(window as any).tweakerr);
  await expect(page.locator('#empty')).toBeVisible();
});
