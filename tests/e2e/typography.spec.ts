import { expect, test, type Page } from '@playwright/test';
import { domDiff, field, launch, openFile, readFixture, saveViaDownload, select, setField, trackErrors } from './helpers';

const ORIGINAL = readFixture('board.html');
const computed = (page: Page, selector: string, property: string) => page.evaluate(
  ([selector, property]) => {
    const doc = (window as any).tweakerr.editor.doc as Document;
    return doc.defaultView!.getComputedStyle(doc.querySelector(selector)!).getPropertyValue(property);
  }, [selector, property],
);

test('numeric text controls preserve imported sizes and default line spacing', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#title');
  const size = field(page, 'Size', 'Text');
  await expect(size.locator('input')).toHaveValue('28');
  await expect(size.locator('select')).toHaveCount(0);
  const minus = await size.getByRole('button', { name: 'Decrease Font size' }).boundingBox();
  const input = await size.locator('input').boundingBox();
  const plus = await size.getByRole('button', { name: 'Increase Font size' }).boundingBox();
  expect(minus!.x + minus!.width).toBeLessThanOrEqual(input!.x);
  expect(input!.x + input!.width).toBeLessThanOrEqual(plus!.x);
  await expect(field(page, 'Line spacing', 'Text').locator('input')).toHaveValue('');
  await expect(field(page, 'Line spacing', 'Text').locator('input')).toHaveAttribute('placeholder', 'Auto');
  const fields = ['Font', 'Size', 'Line spacing', 'Colour', 'Align', 'Style', 'Gradient'];
  const positions = await Promise.all(fields.map(async (label) => {
    const section = label === 'Gradient' ? 'Fill & border' : 'Text';
    return (await field(page, label, section).locator('.ctl-body').boundingBox())!.x;
  }));
  expect(new Set(positions).size).toBe(1);
  expect(await computed(page, '#title', 'font-size')).toBe('28px');
  expect(await domDiff(page, ORIGINAL, await saveViaDownload(page))).toEqual([]);
});

test('typing a font size overrides important CSS, supports undo, and saves only the selected text', async ({ page }) => {
  await launch(page);
  const original = ORIGINAL.replace('font-size: 28px;', 'font-size: 28px !important;');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'important.html', null), original);
  await select(page, '#title');
  await setField(page, 'Size', '20', 'Text');
  expect(await computed(page, '#title', 'font-size')).toBe('20px');
  await page.locator('[data-cmd="undo"]').click();
  expect(await computed(page, '#title', 'font-size')).toBe('28px');
  await expect(field(page, 'Size', 'Text').locator('input')).toHaveValue('28');
  await page.locator('[data-cmd="redo"]').click();
  const saved = await saveViaDownload(page);
  expect(await domDiff(page, original, saved)).toEqual(['html>body[1]>div[0]>h1#title[0] @style: ∅ -> "font-size: 20px !important;"']);
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), saved);
  await select(page, '#title');
  await expect(field(page, 'Size', 'Text').locator('input')).toHaveValue('20');
});

test('numeric line spacing scales with text size and survives save and reopen', async ({ page }) => {
  await launch(page);
  const original = ORIGINAL.replace('font-size: 28px;', 'font-size: 28px; line-height: 35px;');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'spacing.html', null), original);
  await select(page, '#title');
  const spacing = field(page, 'Line spacing', 'Text').locator('input');
  expect(await field(page, 'Line spacing', 'Text').locator('.ctl-label').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(spacing).toHaveValue('1.25');
  expect(await domDiff(page, original, await saveViaDownload(page))).toEqual([]);

  await setField(page, 'Line spacing', '1.5', 'Text');
  await setField(page, 'Size', '24', 'Text');
  expect(await computed(page, '#title', 'line-height')).toBe('36px');
  const saved = await saveViaDownload(page);
  expect(await domDiff(page, original, saved)).toEqual(['html>body[1]>div[0]>h1#title[0] @style: ∅ -> "line-height: 1.5; font-size: 24px;"']);
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), saved);
  await select(page, '#title');
  await expect(field(page, 'Line spacing', 'Text').locator('input')).toHaveValue('1.5');
  await setField(page, 'Size', '14', 'Text');
  expect(await computed(page, '#title', 'line-height')).toBe('21px');
  await field(page, 'Line spacing', 'Text').getByRole('button', { name: 'Increase Line spacing' }).click();
  await expect(field(page, 'Line spacing', 'Text').locator('input')).toHaveValue('1.6');
  expect(await computed(page, '#title', 'line-height')).toBe('22.4px');
});

test('font size buttons apply to every selected item and leave other text unchanged', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.setSelection([editor.doc.querySelector('#box-a h2'), editor.doc.querySelector('#box-b h2')]);
  });
  await field(page, 'Size', 'Text').getByRole('button', { name: 'Increase Font size' }).click();
  expect(await computed(page, '#box-a h2', 'font-size')).toBe('19px');
  expect(await computed(page, '#box-b h2', 'font-size')).toBe('19px');
  expect(await computed(page, '#box-c h2', 'font-size')).toBe('18px');
  const diff = await domDiff(page, ORIGINAL, await saveViaDownload(page));
  expect(diff).toHaveLength(2);
  expect(diff.every((line) => line.endsWith('@style: ∅ -> "font-size: 19px;"'))).toBe(true);
});

test('SVG text uses numeric size and style buttons that survive a live redraw and save', async ({ page }) => {
  const errors = trackErrors(page);
  await launch(page);
  await openFile(page, 'drawn.html');
  await select(page, '#wires text.lbl');
  await expect(field(page, 'Size', 'Text').locator('input')).toHaveValue('11');
  await expect(field(page, 'Weight', 'Text')).toHaveCount(0);
  await field(page, 'Size', 'Text').getByRole('button', { name: 'Increase Font size' }).click();
  expect(await computed(page, '#wires text.lbl', 'font-size')).toBe('12px');
  await setField(page, 'Size', '14', 'Text');
  await field(page, 'Style', 'Text').getByTitle('Bold', { exact: true }).click();
  await field(page, 'Style', 'Text').getByTitle('Italic', { exact: true }).click();
  await field(page, 'Style', 'Text').getByTitle('Underline', { exact: true }).click();
  await page.evaluate(() => (window as any).tweakerr.editor.win.dispatchEvent(new Event('resize')));
  await expect.poll(() => computed(page, '#wires text.lbl', 'font-size')).toBe('14px');
  expect(await computed(page, '#wires text.lbl', 'font-weight')).toBe('700');
  expect(await computed(page, '#wires text.lbl', 'font-style')).toBe('italic');
  expect(await computed(page, '#wires text.lbl', 'text-decoration-line')).toBe('underline');
  const saved = await saveViaDownload(page);
  const block = /<style id="tweakerr-edits">[\s\S]*?<\/style>\n/;
  expect(saved.replace(block, '')).toBe(readFixture('drawn.html'));
  expect(saved).toContain('font-size: 14px !important;');
  expect(saved).toContain('font-weight: 700 !important;');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), saved);
  await select(page, '#wires text.lbl');
  await expect(field(page, 'Size', 'Text').locator('input')).toHaveValue('14');
  await expect(field(page, 'Style', 'Text').getByTitle('Bold', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('page font size uses the same numeric controls', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await setField(page, 'Font size', '12', 'Page');
  expect(await computed(page, 'body', 'font-size')).toBe('12px');
  expect(await domDiff(page, ORIGINAL, await saveViaDownload(page))).toEqual(['html>body[1] @style: ∅ -> "font-size: 12px;"']);
});

test('plus and minus support keyboard activation, hold repeat, release and undo', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#title');
  const size = field(page, 'Size', 'Text');
  const plus = size.getByRole('button', { name: 'Increase Font size' });
  const minus = size.getByRole('button', { name: 'Decrease Font size' });
  await plus.focus();
  await page.keyboard.press('Enter');
  await expect(size.locator('input')).toHaveValue('29');
  await minus.focus();
  await page.keyboard.press('Space');
  await expect(size.locator('input')).toHaveValue('28');
  const box = (await plus.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => parseFloat(await size.locator('input').inputValue())).toBeGreaterThan(30);
  await page.mouse.up();
  const stopped = await size.locator('input').inputValue();
  await page.waitForTimeout(180);
  await expect(size.locator('input')).toHaveValue(stopped);
  await page.locator('[data-cmd="undo"]').click();
  await expect(size.locator('input')).toHaveValue('28');
  expect(await domDiff(page, ORIGINAL, await saveViaDownload(page))).toEqual([]);
});

test('default line spacing changes only when adjusted and can be reset', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#title');
  const spacing = field(page, 'Line spacing', 'Text');
  await spacing.getByRole('button', { name: 'Increase Line spacing' }).click();
  await expect(spacing.locator('input')).toHaveValue('1.3');
  expect(await computed(page, '#title', 'line-height')).toBe('36.4px');
  await setField(page, 'Line spacing', '', 'Text');
  await page.locator('#canvas').focus();
  await expect(spacing.locator('input')).toHaveValue('');
  expect(await computed(page, '#title', 'line-height')).toBe('normal');
  expect(await domDiff(page, ORIGINAL, await saveViaDownload(page))).toEqual([]);
});

test('size buttons step from the rendered size after a relative CSS value', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#title');
  await setField(page, 'Size', '2em', 'Text');
  expect(await computed(page, '#title', 'font-size')).toBe('32px');
  await field(page, 'Size', 'Text').getByRole('button', { name: 'Increase Font size' }).click();
  expect(await computed(page, '#title', 'font-size')).toBe('33px');
  expect(await domDiff(page, ORIGINAL, await saveViaDownload(page))).toEqual(['html>body[1]>div[0]>h1#title[0] @style: ∅ -> "font-size: 33px;"']);
});
