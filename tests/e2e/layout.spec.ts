import { expect, test } from '@playwright/test';
import { launch } from './helpers';

// Headless Chromium hides scrollbars by default; this bug needs real ones.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

// At these sizes the fitted page is just tall enough to need a scrollbar,
// and the scrollbar's width used to shrink it just short enough not to.
for (const [width, height] of [
  [1484, 760],
  [1680, 900],
  [1816, 1000],
]) {
  test(`no layout flicker at ${width}×${height}`, async ({ page }) => {
    // Open at another size, then resize: the same thing opening or closing a side panel does.
    await page.setViewportSize({ width: 1440, height: 900 });
    await launch(page);
    await page.locator('.empty [data-cmd="demo"]').click();
    await page.waitForTimeout(500);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const layouts = await page.evaluate(async () => {
      let n = 0;
      (window as any).tweakerr.editor.on('layout', () => n++);
      await new Promise((r) => setTimeout(r, 500));
      return n;
    });
    expect(layouts).toBeLessThanOrEqual(2);
  });
}
