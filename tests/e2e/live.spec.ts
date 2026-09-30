import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { drag, field, launch, openFile, pointIn, readFixture, saveViaDownload, select, setField } from './helpers';

// A page whose script draws its boxes and arrows (see tests/fixtures/drawn.html).
const ORIGINAL = readFixture('drawn.html');
const BLOCK = /<style id="tweakerr-edits">\n\/\* Changes made with Tweakerr\. Delete this block to undo them all\. \*\/\n([\s\S]*?)\n<\/style>\n/;

const inPage = <T>(page: Page, fn: (doc: Document) => T) =>
  page.evaluate(`(${fn.toString()})(window.tweakerr.editor.doc)`) as Promise<T>;

/** The saved file must be the original plus one style block; returns the block's rules. */
function rulesOf(saved: string, original = ORIGINAL): string[] {
  const m = BLOCK.exec(saved);
  expect(m, 'saved file has the edits block').not.toBeNull();
  expect(saved.replace(BLOCK, '')).toBe(original);
  return m![1].split('\n');
}

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'drawn.html');
});

test('a page drawn by its code opens live, a plain page does not', async ({ page }) => {
  await expect(page.locator('#live-badge')).toBeVisible();
  expect(await inPage(page, (d) => d.querySelectorAll('.step').length)).toBe(4);
  expect(await inPage(page, (d) => d.querySelectorAll('#wires line').length)).toBe(3);

  // board.html's script only changes its title: it keeps full editing with scripts off.
  await openFile(page, 'board.html');
  await expect(page.locator('#live-badge')).toBeHidden();
  expect(await inPage(page, (d) => d.body.getAttribute('data-ran'))).toBeNull();
});

test('style changes are saved as rules, and the code is kept as it was', async ({ page }, info) => {
  await select(page, '#step-order');
  await setField(page, 'Fill', '#fff3c4', 'Fill & border');
  await setField(page, 'Border', '4', 'Fill & border');
  expect(await inPage(page, (d) => getComputedStyle(d.getElementById('step-order')!).backgroundColor)).toBe('rgb(255, 243, 196)');

  const saved = await saveViaDownload(page);
  expect(rulesOf(saved)).toEqual(['#step-order { background-color: rgb(255, 243, 196) !important; border-width: 4px !important; }']);

  // Open the saved file: the code draws it, the rule styles it, and new edits join the same block.
  const path = info.outputPath('drawn-saved.html');
  writeFileSync(path, saved);
  await openFile(page, 'drawn-saved.html', path);
  await expect(page.locator('#live-badge')).toBeVisible();
  expect(await inPage(page, (d) => getComputedStyle(d.getElementById('step-order')!).backgroundColor)).toBe('rgb(255, 243, 196)');
  await select(page, '#step-quote');
  await setField(page, 'Radius', '0', 'Fill & border');
  const again = await saveViaDownload(page);
  expect(rulesOf(again)).toEqual([
    '#step-order { background-color: rgb(255, 243, 196) !important; border-width: 4px !important; }',
    '#step-quote { border-radius: 0px !important; }',
  ]);
});

test('moving a box saves its new place, and the code redraws its arrows', async ({ page }) => {
  const x2 = () => inPage(page, (d) => Number(d.getElementById('wire-quote-order')!.getAttribute('x2')));
  const before = await x2();
  const zoom = await page.evaluate(() => (window as any).tweakerr.editor.zoom);
  await select(page, '#step-order');
  await page.keyboard.down('Alt'); // no snapping, so the move is exact
  await drag(page, await pointIn(page, '#step-order', 0.5, 0.2), 40 * zoom, 60 * zoom);
  await page.keyboard.up('Alt');

  await expect.poll(x2).toBeCloseTo(before + 40, 0);
  const saved = await saveViaDownload(page);
  // left/top rather than translate: code that measures with offsetLeft sees it too.
  expect(rulesOf(saved)).toEqual(['#step-order { inset: 100px auto auto 300px !important; }']);
});

test('editing words changes them where the code writes them', async ({ page }) => {
  const p = await pointIn(page, '#step-invoice h2', 0.5, 0.5);
  await page.mouse.dblclick(p.x, p.y);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Billing');
  await page.keyboard.press('Escape');

  const saved = await saveViaDownload(page);
  expect(saved).toBe(ORIGINAL.replace("title: 'Invoice'", "title: 'Billing'"));

  // A redraw (after a move) keeps showing the new words.
  await select(page, '#step-invoice');
  await page.keyboard.press('Shift+ArrowDown');
  await page.evaluate(() => (window as any).tweakerr.editor.doc.defaultView.dispatchEvent(new Event('resize')));
  expect(await inPage(page, (d) => d.querySelector('#step-invoice h2')!.textContent)).toBe('Billing');

  // Words built from pieces by the code can't be matched to one place: refused, with a reason.
  const q = await pointIn(page, '.legend span', 0.5, 0.5);
  await page.mouse.dblclick(q.x, q.y);
  await expect(page.locator('.toast', { hasText: 'put together by the page' })).toBeVisible();
  expect(await inPage(page, (d) => d.querySelector('.legend span')!.hasAttribute('contenteditable'))).toBe(false);
});

test('words written several times change only for the item clicked', async ({ page }) => {
  // "Finance" is the team of two cards, next to a dot. Change it on the Cash card only.
  const p = await pointIn(page, '#step-cash .team', 0.8, 0.5);
  await page.mouse.dblclick(p.x, p.y);
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type('Treasury');
  await page.keyboard.press('Escape');

  const saved = await saveViaDownload(page);
  expect(saved).toBe(ORIGINAL.replace("note: 'Finance sends it', team: 'Finance', x: 520, y: 240", "note: 'Finance sends it', team: 'Treasury', x: 520, y: 240"));

  // After a redraw only the Cash card shows the new words.
  await page.evaluate(() => (window as any).tweakerr.editor.doc.defaultView.dispatchEvent(new Event('resize')));
  expect(await inPage(page, (d) => [d.querySelector('#step-invoice .team')!.textContent, d.querySelector('#step-cash .team')!.textContent])).toEqual(['Finance', 'Treasury']);
});

test('undo and redo a live change', async ({ page }) => {
  const bg = () => inPage(page, (d) => getComputedStyle(d.getElementById('step-cash')!).backgroundColor);
  await select(page, '#step-cash');
  await setField(page, 'Fill', '#dcfce7', 'Fill & border');
  expect(await bg()).toBe('rgb(220, 252, 231)');
  await page.locator('#canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await bg()).toBe('rgb(255, 255, 255)');
  await page.keyboard.press('Control+Shift+z');
  expect(await bg()).toBe('rgb(220, 252, 231)');
});

test('delete hides, and duplicate is off', async ({ page }) => {
  await select(page, '#step-cash');
  await expect(page.locator('.sel-actions button[aria-label^="Can\'t duplicate"]')).toBeDisabled();
  await page.locator('#canvas').focus();
  await page.keyboard.press('Delete');
  expect(await inPage(page, (d) => getComputedStyle(d.getElementById('step-cash')!).display)).toBe('none');
  const saved = await saveViaDownload(page);
  expect(rulesOf(saved)).toEqual(['#step-cash { display: none !important; }']);
});

test('arrows drawn by code: colour saved by id, no line-end handles', async ({ page }) => {
  await select(page, '#wire-order-invoice');
  await expect(page.locator('.ov-handle-point')).toHaveCount(0);
  await setField(page, 'Stroke', '#16a34a', 'Shape');
  await setField(page, 'End head', '#16a34a', 'Arrowheads');
  await expect(page.locator('#props', { hasText: 'applies to every arrow that shares it' })).toBeVisible();

  // The code redraws the arrows: the rules still find them.
  await page.evaluate(() => (window as any).tweakerr.editor.doc.defaultView.dispatchEvent(new Event('resize')));
  expect(await inPage(page, (d) => getComputedStyle(d.getElementById('wire-order-invoice')!).stroke)).toBe('rgb(22, 163, 74)');
  const saved = await saveViaDownload(page);
  expect(rulesOf(saved)).toEqual([
    '#wire-order-invoice { stroke: rgb(22, 163, 74) !important; }',
    '#tip > path:nth-child(1) { fill: rgb(22, 163, 74) !important; }',
  ]);
});

test('an item without an id is found by position, with a warning', async ({ page }) => {
  await select(page, '.legend span');
  await expect(page.locator('.live-note')).toContainText('finds it by its position');
  await setField(page, 'Colour', '#d9304f', 'Text');
  const saved = await saveViaDownload(page);
  expect(rulesOf(saved)).toEqual(['body > div:nth-child(3) > span:nth-child(1) { color: rgb(217, 48, 79) !important; }']);
  await expect(field(page, 'Style rule for this element', 'Custom CSS').locator('textarea')).toHaveValue('color: rgb(217, 48, 79);');
});

test('a page that redraws on resize settles, and the panel stays clickable', async ({ page }) => {
  // It used to loop: redraw → re-measure → resize → redraw…, rebuilding the
  // panel so often that a click's press and release landed on different buttons.
  const events = await page.evaluate(async () => {
    const { editor } = (window as any).tweakerr;
    let n = 0;
    for (const ev of ['change', 'redraw', 'layout']) editor.on(ev, () => n++);
    await new Promise((r) => setTimeout(r, 1000));
    return n;
  });
  expect(events).toBe(0);

  // A slow click, as a person makes one, opens the colour picker.
  const swatch = await page.locator('#props .swatch').first().boundingBox();
  await page.mouse.move(swatch!.x + swatch!.width / 2, swatch!.y + swatch!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(page.locator('.popover')).toBeVisible();
});

test('stepping an arrow the code redraws: it stays selected, and stops when released', async ({ page }) => {
  await select(page, '#wire-order-invoice');
  const up = field(page, 'X', 'Position').getByRole('button', { name: /^Increase/ });
  const shift = () => inPage(page, (d) => getComputedStyle(d.getElementById('wire-order-invoice')!).translate);
  // Each next click lands right after the page redrew its arrows, before Tweakerr caught up.
  for (let i = 0; i < 4; i++) {
    const before = await page.evaluateHandle(() => (window as any).tweakerr.editor.doc.getElementById('wire-order-invoice'));
    await up.click();
    await page.waitForFunction((el) => !(el as Element).isConnected, before);
  }
  await expect.poll(shift).toBe('4px');
  expect(await page.evaluate(() => (window as any).tweakerr.editor.selected?.id)).toBe('wire-order-invoice');
  await expect(page.locator('.sel-tag')).not.toHaveText('Page');
  await page.waitForTimeout(1000);
  expect(await shift()).toBe('4px'); // nothing kept stepping
});
