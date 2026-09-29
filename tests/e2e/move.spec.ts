import { expect, test, type Page } from '@playwright/test';
import { domDiff, drag, launch, openFile, pointIn, readFixture, saveViaDownload, select } from './helpers';

const ORIGINAL = readFixture('board.html');
const zoom = (page: Page) => page.evaluate(() => (window as any).tweakerr.editor.zoom as number);
const translateOf = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const el = (window as any).tweakerr.editor.doc.querySelector(s) as HTMLElement;
    const [x = '0', y = '0'] = (el.style.translate || '0 0').split(/\s+/);
    return [parseFloat(x), parseFloat(y)];
  }, sel);
const attr = (page: Page, sel: string, name: string) =>
  page.evaluate(([s, n]) => (window as any).tweakerr.editor.doc.querySelector(s).getAttribute(n) as string | null, [sel, name] as const);

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('drag a box (Alt = no snapping); save changes only its position', async ({ page }) => {
  const z = await zoom(page);
  await page.keyboard.down('Alt');
  await drag(page, await pointIn(page, '#box-b', 0.5, 0.06), 90, 0);
  await page.keyboard.up('Alt');
  const [x, y] = await translateOf(page, '#box-b');
  expect(x).toBeCloseTo(90 / z, 0);
  expect(y).toBe(0);

  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toMatch(/div#box-b\[\d+\] @style: ∅ -> "translate: [\d.]+px;"/);

  // A drag is one undo step.
  await page.keyboard.press('Control+z');
  expect(await attr(page, '#box-b', 'style')).toBeNull();
});

test('snaps into line with its neighbours and shows a guide', async ({ page }) => {
  const z = await zoom(page);
  let guides = 0;
  // 4 screen px down is inside the snap distance: it should stay level with its siblings.
  await drag(page, await pointIn(page, '#box-b', 0.5, 0.06), 90, 4, {
    hold: async () => {
      guides = await page.locator('#overlay .ov-guide-h').count();
    },
  });
  const [x, y] = await translateOf(page, '#box-b');
  expect(y).toBe(0);
  expect(x).toBeCloseTo(90 / z, 0);
  expect(guides).toBeGreaterThan(0);
  await expect(page.locator('#overlay .ov-guide')).toHaveCount(0);
});

test('Shift locks the drag to one axis', async ({ page }) => {
  await page.keyboard.down('Shift');
  await drag(page, await pointIn(page, '#box-b', 0.5, 0.06), 80, 30);
  await page.keyboard.up('Shift');
  const [, y] = await translateOf(page, '#box-b');
  expect(y).toBe(0);
});

test('arrow keys nudge; a burst of nudges is one undo step', async ({ page }) => {
  await select(page, '#badge');
  await page.locator('#canvas').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await translateOf(page, '#badge')).toEqual([3, 10]);
  await page.keyboard.press('Control+z');
  expect(await attr(page, '#badge', 'style')).toBeNull();
});

test('resize from the right-hand handle', async ({ page }) => {
  const z = await zoom(page);
  await select(page, '#box-a');
  const handle = await page.locator('#overlay .ov-h-e').boundingBox();
  await drag(page, { x: handle!.x + handle!.width / 2, y: handle!.y + handle!.height / 2 }, 60, 0);
  const width = await page.evaluate(() => parseFloat(getComputedStyle((window as any).tweakerr.editor.doc.getElementById('box-a')).width));
  expect(width).toBeCloseTo(220 + 60 / z, 0);
});

test('drag an SVG shape: it moves by a transform, in SVG units', async ({ page }) => {
  const z = await zoom(page);
  await page.keyboard.down('Alt');
  await drag(page, await pointIn(page, '#node-2', 0.5, 0.2), 60, 30);
  await page.keyboard.up('Alt');
  const t = await attr(page, '#node-2', 'transform');
  const [, tx, ty] = /^translate\(([-\d.]+)[ ,]+([-\d.]+)\)$/.exec(t ?? '') ?? [];
  expect(parseFloat(tx)).toBeCloseTo(60 / z, 0);
  expect(parseFloat(ty)).toBeCloseTo(30 / z, 0);
  // Geometry attributes are untouched: undo/redo and other tools stay simple.
  expect(await attr(page, '#node-2', 'x')).toBe('300');
});

test('drag an arrow end point', async ({ page }) => {
  const z = await zoom(page);
  await select(page, '#arrow-1');
  const p2 = await page.locator('#overlay .ov-handle-point[data-handle="p2"]').boundingBox();
  await drag(page, { x: p2!.x + p2!.width / 2, y: p2!.y + p2!.height / 2 }, 0, 30);
  expect(parseFloat((await attr(page, '#arrow-1', 'y2'))!)).toBeCloseTo(70 + 30 / z, 0);
  expect(await attr(page, '#arrow-1', 'y1')).toBe('70');
});
