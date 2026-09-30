import { expect, test, type Page } from '@playwright/test';
import { clickIn, domDiff, drag, launch, openFile, pointIn, readFixture, saveViaDownload, select, setField } from './helpers';

const ORIGINAL = readFixture('board.html');
const selectedIds = (page: Page) => page.evaluate(() => ((window as any).tweakerr.editor.selection as Element[]).map((e) => e.id).sort());
const styleOf = (page: Page, id: string, prop: string) =>
  page.evaluate(([i, p]) => getComputedStyle((window as any).tweakerr.editor.doc.getElementById(i)).getPropertyValue(p), [id, prop] as const);

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('Shift+click builds a selection; one change applies to all, one undo reverts all', async ({ page }) => {
  await clickIn(page, '#box-a', 0.5, 0.06);
  await page.keyboard.down('Shift');
  // Clicking the text inside the next card adds the card itself (same level as the first).
  await clickIn(page, '#box-c h2', 0.2, 0.5);
  await page.keyboard.up('Shift');
  expect(await selectedIds(page)).toEqual(['box-a', 'box-c']);
  await expect(page.locator('.sel-tag')).toHaveText('2 selected');
  await expect(page.locator('#overlay .ov-select-extra')).toHaveCount(1);
  await expect(page.locator('#overlay .ov-handle')).toHaveCount(0);
  await expect(page.locator('#crumbs .crumb-more')).toHaveText('+ 1 more selected');

  await setField(page, 'Border', '5', 'Fill & border');
  expect(await styleOf(page, 'box-a', 'border-top-width')).toBe('5px');
  expect(await styleOf(page, 'box-c', 'border-top-width')).toBe('5px');
  expect(await styleOf(page, 'box-b', 'border-top-width')).toBe('2px');

  const saved = await saveViaDownload(page);
  expect(await domDiff(page, ORIGINAL, saved)).toEqual([
    expect.stringMatching(/div#box-a\[\d+\] @style: ∅ -> "border-width: 5px;"/),
    expect.stringMatching(/div#box-c\[\d+\] @style: ∅ -> "border-width: 5px;"/),
  ]);

  await page.locator('#canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await styleOf(page, 'box-a', 'border-top-width')).toBe('2px');
  expect(await styleOf(page, 'box-c', 'border-top-width')).toBe('2px');
});

test('Shift+click on a selected element takes it out; a plain click picks just one', async ({ page }) => {
  await select(page, '#box-a');
  await page.keyboard.down('Shift');
  await clickIn(page, '#box-b', 0.5, 0.06);
  await clickIn(page, '#box-c', 0.5, 0.06);
  expect(await selectedIds(page)).toEqual(['box-a', 'box-b', 'box-c']);
  await clickIn(page, '#box-b', 0.5, 0.06);
  await page.keyboard.up('Shift');
  expect(await selectedIds(page)).toEqual(['box-a', 'box-c']);

  await clickIn(page, '#box-c', 0.5, 0.06);
  expect(await selectedIds(page)).toEqual(['box-c']);
});

test('dragging one of them moves the whole group as one undo step', async ({ page }) => {
  await select(page, '#box-a');
  await page.keyboard.down('Shift');
  await clickIn(page, '#box-b', 0.5, 0.06);
  await page.keyboard.up('Shift');
  await page.keyboard.down('Alt');
  await drag(page, await pointIn(page, '#box-a', 0.5, 0.06), 45, 30);
  await page.keyboard.up('Alt');
  const a = await styleOf(page, 'box-a', 'translate');
  expect(a).not.toBe('none');
  expect(await styleOf(page, 'box-b', 'translate')).toBe(a);
  expect(await styleOf(page, 'box-c', 'translate')).toBe('none');
  expect(await selectedIds(page)).toEqual(['box-a', 'box-b']);

  await page.keyboard.press('Control+z');
  expect(await styleOf(page, 'box-a', 'translate')).toBe('none');
  expect(await styleOf(page, 'box-b', 'translate')).toBe('none');
});

test('"Same type" selects every card; recolour them all at once', async ({ page }) => {
  await select(page, '#box-b');
  const btn = page.locator('.similar-btn', { hasText: 'Same type' });
  await expect(btn).toHaveText('Same type · 3');
  await btn.click();
  expect(await selectedIds(page)).toEqual(['box-a', 'box-b', 'box-c']);
  await expect(page.locator('#layers .layer-row.selected')).toHaveCount(3);
  await expect(btn).toHaveClass(/on/);

  await setField(page, 'Fill', '#fef3c7', 'Fill & border');
  for (const id of ['box-a', 'box-b', 'box-c']) expect(await styleOf(page, id, 'background-color')).toBe('rgb(254, 243, 199)');
});

test('"Same stroke" finds the arrows of that colour; their shared head is recoloured in place', async ({ page }) => {
  await select(page, '#arrow-1');
  const btn = page.locator('.similar-btn', { hasText: 'Same stroke' });
  await expect(btn).toHaveText('Same stroke · 2');
  await btn.click();
  expect(await selectedIds(page)).toEqual(['arrow-1', 'arrow-2']);

  await setField(page, 'Stroke', '#2563eb', 'Shape');
  await setField(page, 'End head', '#2563eb', 'Arrowheads');
  const heads = await page.evaluate(() => {
    const doc = (window as any).tweakerr.editor.doc as Document;
    return {
      ids: Array.from(doc.querySelectorAll('marker')).map((m) => m.id),
      head: getComputedStyle(doc.querySelector('#head path')!).fill,
      solo: getComputedStyle(doc.querySelector('#solo-head path')!).fill,
    };
  });
  // Every arrow using #head is selected, so no copy is needed.
  expect(heads).toEqual({ ids: ['head', 'solo-head'], head: 'rgb(37, 99, 235)', solo: 'rgb(192, 57, 43)' });
  expect(await styleOf(page, 'arrow-1', 'stroke')).toBe('rgb(37, 99, 235)');
  expect(await styleOf(page, 'arrow-2', 'stroke')).toBe('rgb(37, 99, 235)');
  expect(await styleOf(page, 'arrow-3', 'stroke')).toBe('rgb(192, 57, 43)');
});

test('a shared head is copied once for the group when others still use it', async ({ page }) => {
  // arrow-1 alone is selected, but arrow-2 also uses #head; select arrow-1 + arrow-3.
  await select(page, '#arrow-1');
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.setSelection([editor.doc.getElementById('arrow-3'), editor.doc.getElementById('arrow-1')]);
  });
  await setField(page, 'End head', '#16a34a', 'Arrowheads');
  const m = await page.evaluate(() => {
    const doc = (window as any).tweakerr.editor.doc as Document;
    const use = (id: string) => getComputedStyle(doc.getElementById(id)!).getPropertyValue('marker-end');
    return { ids: Array.from(doc.querySelectorAll('marker')).map((x) => x.id), a1: use('arrow-1'), a2: use('arrow-2'), a3: use('arrow-3') };
  });
  expect(m).toEqual({ ids: ['head', 'head-end', 'solo-head'], a1: 'url("#head-end")', a2: 'url("#head")', a3: 'url("#solo-head")' });
});

test('arrow keys, delete and undo work on the whole selection', async ({ page }) => {
  await select(page, '#box-a');
  await page.keyboard.down('Shift');
  await clickIn(page, '#badge', 0.5, 0.5);
  await page.keyboard.up('Shift');
  await page.locator('#canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await styleOf(page, 'box-a', 'translate')).toBe('2px');
  expect(await styleOf(page, 'badge', 'translate')).toBe('2px');

  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => !!(window as any).tweakerr.editor.doc.getElementById('badge'))).toBe(false);
  expect(await page.evaluate(() => !!(window as any).tweakerr.editor.doc.getElementById('box-a'))).toBe(false);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => !!(window as any).tweakerr.editor.doc.getElementById('box-a'))).toBe(true);
  expect(await page.evaluate(() => !!(window as any).tweakerr.editor.doc.getElementById('badge'))).toBe(true);
});

test('Ctrl+A picks everything next to the selected element; Esc clears', async ({ page }) => {
  await select(page, '#box-b');
  await page.locator('#canvas').focus();
  await page.keyboard.press('Control+a');
  expect(await selectedIds(page)).toEqual(['box-a', 'box-b', 'box-c']);
  await page.keyboard.press('Escape');
  expect(await selectedIds(page)).toEqual([]);
});

test('Shift+click in the layers list adds rows', async ({ page }) => {
  await select(page, '#badge'); // opens its folder in the tree
  await page.locator('#layers .layer-row', { hasText: 'h1#title' }).click({ modifiers: ['Shift'] });
  expect(await selectedIds(page)).toEqual(['badge', 'title']);
  await expect(page.locator('#layers .layer-row.selected')).toHaveCount(2);
});

test('boxes and shapes together: only shared settings are offered', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.setSelection([editor.doc.getElementById('node-1'), editor.doc.getElementById('box-a')]);
  });
  await expect(page.locator('#props .ctl-note')).toContainText('only the settings they share');
  await expect(page.locator('#props summary')).toHaveText(['Effects']);
  const out = page.locator('#props .ctl-slider-out');
  await out.fill('50');
  await out.press('Enter');
  expect(await styleOf(page, 'box-a', 'opacity')).toBe('0.5');
  expect(await styleOf(page, 'node-1', 'opacity')).toBe('0.5');
});

test('"Same type" matches on the main class, so modifier classes still count', async ({ page }) => {
  await page.reload();
  await page.locator('.empty [data-cmd="demo"]').click();
  await expect(page.locator('#file-name')).toHaveText('tweakerr-demo.html');
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.select(editor.doc.querySelector('.card.risk'));
  });
  await expect(page.locator('.similar-btn', { hasText: 'Same type' })).toHaveText('Same type · 3');
});
