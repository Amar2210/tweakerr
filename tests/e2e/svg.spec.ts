import { expect, test, type Page } from '@playwright/test';
import { domDiff, launch, openFile, pointIn, readFixture, saveViaDownload, select, selectedId, setField } from './helpers';

const ORIGINAL = readFixture('board.html');
const markers = (page: Page) =>
  page.evaluate(() => {
    const doc = (window as any).tweakerr.editor.doc as Document;
    const colourOf = (id: string) => getComputedStyle(doc.querySelector(`#${id} path`)!).fill;
    const use = (id: string) => getComputedStyle(doc.getElementById(id)!).getPropertyValue('marker-end');
    return {
      ids: Array.from(doc.querySelectorAll('marker')).map((m) => m.id),
      arrow1: use('arrow-1'),
      arrow2: use('arrow-2'),
      arrow3: use('arrow-3'),
      colour: Object.fromEntries(Array.from(doc.querySelectorAll('marker')).map((m) => [m.id, colourOf(m.id)])),
    };
  });

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('a 2px arrow is easy to click', async ({ page }) => {
  const p = await pointIn(page, '#arrow-1', 0.5, 0.5);
  await page.mouse.click(p.x, p.y + 3); // a few pixels off the line
  expect(await selectedId(page)).toBe('arrow-1');
  await expect(page.locator('#props summary', { hasText: 'Arrowheads' })).toBeVisible();
});

test('recolour one arrow and its head without touching the arrow sharing it', async ({ page }) => {
  await select(page, '#arrow-1');
  await setField(page, 'Stroke', '#16a34a', 'Shape');
  await setField(page, 'Width', '3', 'Shape');
  await setField(page, 'End head', '#16a34a', 'Arrowheads');

  let m = await markers(page);
  expect(m.ids).toEqual(['head', 'head-end', 'solo-head']);
  expect(m.arrow1).toBe('url("#head-end")');
  expect(m.arrow2).toBe('url("#head")');
  expect(m.colour).toEqual({ head: 'rgb(51, 51, 51)', 'head-end': 'rgb(22, 163, 74)', 'solo-head': 'rgb(192, 57, 43)' });

  // A second change to the same arrow reuses its own copy.
  await setField(page, 'End head', '#0ea5e9', 'Arrowheads');
  m = await markers(page);
  expect(m.ids).toEqual(['head', 'head-end', 'solo-head']);
  expect(m.colour['head-end']).toBe('rgb(14, 165, 233)');

  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toEqual([
    // the <defs> gained the copied marker
    expect.stringMatching(/svg#diagram\[\d+\]>defs\[0\] children: 5 -> 6/),
    expect.stringMatching(/line#arrow-1\[\d+\] @style: ∅ -> "stroke: rgb\(22, 163, 74\); stroke-width: 3px; marker-end: url\(\\"#head-end\\"\);"/),
  ]);
});

test('an arrowhead only one arrow uses is recoloured in place', async ({ page }) => {
  await select(page, '#arrow-3');
  await setField(page, 'End head', '#7c3aed', 'Arrowheads');
  const m = await markers(page);
  expect(m.ids).toEqual(['head', 'solo-head']);
  expect(m.colour['solo-head']).toBe('rgb(124, 58, 237)');
  expect(m.arrow3).toBe('url("#solo-head")');
});

test('dash presets and undo of an arrowhead change', async ({ page }) => {
  await select(page, '#arrow-2');
  await page.locator('#props details.section', { hasText: 'Shape' }).locator('.ctl-row', { hasText: 'Line' }).locator('select').selectOption({ label: 'Dashed' });
  expect(await page.evaluate(() => getComputedStyle((window as any).tweakerr.editor.doc.getElementById('arrow-2')).strokeDasharray)).toBe('6px, 4px');

  await setField(page, 'End head', '#16a34a', 'Arrowheads');
  expect((await markers(page)).ids).toEqual(['head', 'head-end', 'solo-head']);
  await page.locator('#canvas').focus();
  await page.keyboard.press('Control+z');
  const m = await markers(page);
  expect(m.ids).toEqual(['head', 'solo-head']);
  expect(m.arrow2).toBe('url("#head")');
});

test('the colour swatch follows a typed value', async ({ page }) => {
  await select(page, '#arrow-1');
  await setField(page, 'Stroke', '#16a34a', 'Shape');
  const chip = page.locator('#props details.section', { hasText: 'Shape' }).locator('.ctl-row', { hasText: 'Stroke' }).locator('.swatch-chip');
  await expect(chip).toHaveCSS('background-color', 'rgb(22, 163, 74)');
});
