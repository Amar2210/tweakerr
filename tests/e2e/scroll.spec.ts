import { expect, test, type Page } from '@playwright/test';
import { launch, openFile, pointIn } from './helpers';

// Real scrollbars (headless Chromium hides them by default).
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const scrollLeft = (page: Page) => page.evaluate(() => (window as any).tweakerr.editor.doc.getElementById('scroller').scrollLeft as number);

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'drawn.html');
});

test('a box inside the page scrolls sideways with the wheel', async ({ page }) => {
  const p = await pointIn(page, '#scroller', 0.5, 0.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(120, 0); // a sideways swipe
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(50);
  const after = await scrollLeft(page);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120); // Shift+wheel scrolls sideways too
  await page.keyboard.up('Shift');
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(after);
});

test("dragging the box's scrollbar scrolls it instead of selecting", async ({ page }) => {
  const bar = await page.evaluate(() => {
    const { editor, stage } = (window as any).tweakerr;
    const el = editor.doc.getElementById('scroller') as HTMLElement;
    const r = el.getBoundingClientRect();
    const s = stage.stage.getBoundingClientRect();
    const z = editor.zoom;
    const barH = el.offsetHeight - el.clientHeight;
    return { x: s.left + (r.left + 30) * z, y: s.top + (r.bottom - barH / 2) * z, barH };
  });
  expect(bar.barH).toBeGreaterThan(0);
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(bar.x + 150, bar.y, { steps: 8 });
  await page.mouse.up();
  expect(await scrollLeft(page)).toBeGreaterThan(100);
  expect(await page.evaluate(() => (window as any).tweakerr.editor.selected)).toBeNull();
});
