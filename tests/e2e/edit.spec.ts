import { expect, test } from '@playwright/test';
import { domDiff, field, launch, openFile, pointIn, readFixture, saveViaDownload, select, selectedId, setField } from './helpers';

const ORIGINAL = readFixture('board.html');
const inPage = <T>(page: import('@playwright/test').Page, fn: (doc: Document) => T) =>
  page.evaluate(`(${fn.toString()})(window.tweakerr.editor.doc)`) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('change a border, save: only that element changes', async ({ page }) => {
  await select(page, '#box-b');
  await setField(page, 'Border', '4', 'Fill & border');
  await setField(page, 'Colour', '#e11d48', 'Fill & border');
  await setField(page, 'Radius', '0', 'Fill & border');

  const cs = await inPage(page, (d) => {
    const s = getComputedStyle(d.getElementById('box-b')!);
    return [s.borderTopWidth, s.borderTopColor, s.borderTopLeftRadius];
  });
  expect(cs).toEqual(['4px', 'rgb(225, 29, 72)', '0px']);
  await expect(page).toHaveTitle('• board.html — Tweakerr');

  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toMatch(/div#box-b\[\d+\] @style: ∅ -> "border-width: 4px; border-color: rgb\(225, 29, 72\); border-radius: 0px;"/);
  await expect(page).toHaveTitle('board.html — Tweakerr');
});

test('beats a stylesheet !important rule when it has to', async ({ page }) => {
  await select(page, '#pill');
  await setField(page, 'Colour', '#16a34a', 'Fill & border');
  const [colour, inline] = await inPage(page, (d) => {
    const el = d.getElementById('pill')!;
    return [getComputedStyle(el).borderTopColor, el.getAttribute('style')];
  });
  expect(colour).toBe('rgb(22, 163, 74)');
  expect(inline).toContain('!important');
});

test('opacity slider and shadow preset', async ({ page }) => {
  await select(page, '#badge');
  const out = field(page, 'Opacity', 'Effects').locator('.ctl-slider-out');
  await out.fill('40');
  await out.press('Enter');
  const shadowSelect = field(page, 'Shadow', 'Effects').locator('select');
  await expect(shadowSelect.locator('option', { hasText: 'Custom' })).toHaveCount(0);
  await shadowSelect.selectOption({ label: 'Medium' });
  const [opacity, shadow] = await inPage(page, (d) => {
    const s = getComputedStyle(d.getElementById('badge')!);
    return [s.opacity, s.boxShadow];
  });
  expect(opacity).toBe('0.4');
  expect(shadow).not.toBe('none');
});

test('edit text in place; one undo reverts the whole edit', async ({ page }) => {
  // Double-click the heading (to the right of its words), go to the end, type.
  const p = await pointIn(page, '#title', 0.9, 0.5);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator('#overlay')).toHaveClass(/passthrough/);
  await page.keyboard.press('End');
  await page.keyboard.type(' board');
  await page.keyboard.press('Escape');
  await expect(page.locator('#overlay')).not.toHaveClass(/passthrough/);

  expect(await inPage(page, (d) => d.getElementById('title')!.textContent)).toBe('Order to cash board');
  const saved = await saveViaDownload(page);
  expect(saved).not.toContain('contenteditable');
  expect(await domDiff(page, ORIGINAL, saved)).toEqual(['html>body[1]>div[0]>h1#title[0]>#0 text: "Order to cash" -> "Order to cash board"']);

  await page.keyboard.press('Control+z');
  expect(await inPage(page, (d) => d.getElementById('title')!.textContent)).toBe('Order to cash');
  await page.keyboard.press('Control+Shift+z');
  expect(await inPage(page, (d) => d.getElementById('title')!.textContent)).toBe('Order to cash board');
});

test('delete, duplicate, hide — and undo brings back the same element', async ({ page }) => {
  await inPage(page, (d) => ((d.getElementById('box-c') as any).__tag = 'original'));
  await select(page, '#box-c');
  await page.keyboard.press('Delete');
  expect(await inPage(page, (d) => !!d.getElementById('box-c'))).toBe(false);
  await page.keyboard.press('Control+z');
  expect(await inPage(page, (d) => (d.getElementById('box-c') as any)?.__tag)).toBe('original');

  await select(page, '#box-a');
  await page.keyboard.press('Control+d');
  expect(await selectedId(page)).toBe('box-a-copy');
  await page.locator('.sel-actions button[aria-label="Hide"]').click();
  expect(await inPage(page, (d) => getComputedStyle(d.getElementById('box-a-copy')!).display)).toBe('none');

  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  // The row gained one child (the hidden copy); nothing else moved.
  expect(diff).toEqual(['html>body[1]>div[0]>div[2] children: 7 -> 8']);
  expect(saved).toContain('<div class="box" id="box-a-copy" style="display: none;"><h2>Quote</h2>');
  expect(saved).toContain('id="pill-copy"');

  // Undo twice: unhide, then remove the copy; the document is back to the original.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  const html = await page.evaluate(() => (window as any).tweakerr.serialize());
  expect(await domDiff(page, ORIGINAL, html)).toEqual([]);
  await expect(page).toHaveTitle('• board.html — Tweakerr');
});
