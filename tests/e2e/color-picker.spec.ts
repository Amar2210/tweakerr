import { expect, test, type Page } from '@playwright/test';
import { domDiff, field, launch, openFile, readFixture, saveViaDownload, select } from './helpers';

const ORIGINAL = readFixture('board.html');
const picker = (page: Page) => page.getByRole('dialog', { name: 'Colour picker' });
const color = (page: Page, id: string, property: string) => page.evaluate(
  ([id, property]) => {
    const { editor } = (window as any).tweakerr;
    return editor.win.getComputedStyle(editor.doc.getElementById(id)).getPropertyValue(property);
  }, [id, property],
);

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('HEX is available immediately, colour changes leave Effects opacity alone, and save cleanly', async ({ page }) => {
  await select(page, '#title');
  const opacity = field(page, 'Opacity', 'Effects').locator('.ctl-slider-out');
  await opacity.fill('60');
  await opacity.press('Enter');
  await field(page, 'Colour', 'Text').getByRole('button', { name: 'Colour colour' }).click();
  const pop = picker(page);
  const hex = pop.getByRole('textbox', { name: 'HEX colour' });
  await expect(hex).toBeFocused();
  await expect(hex).toHaveValue('#222222');
  await expect(pop.locator('input[type="range"]')).toHaveCount(0);
  await expect(pop.getByText('Opacity', { exact: true })).toHaveCount(0);
  await hex.fill('#16a34a');
  await hex.press('Enter');
  expect(await color(page, 'title', 'color')).toBe('rgb(22, 163, 74)');
  expect(await color(page, 'title', 'opacity')).toBe('0.6');
  await expect(field(page, 'Colour', 'Text').locator('.ctl-color-text')).toHaveValue('#16a34a');
  await hex.press('Escape');
  const saved = await saveViaDownload(page);
  expect(await domDiff(page, ORIGINAL, saved)).toEqual([
    'html>body[1]>div[0]>h1#title[0] @style: ∅ -> "opacity: 0.6; color: rgb(22, 163, 74);"',
  ]);
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), saved);
  await select(page, '#title');
  await expect(opacity).toHaveValue('60%');
  await expect(field(page, 'Colour', 'Text').locator('.ctl-color-text')).toHaveValue('#16a34a');
});

test('invalid HEX does not change the page; short and unprefixed codes commit with Enter or blur', async ({ page }) => {
  await select(page, '#box-b');
  await field(page, 'Fill', 'Fill & border').getByRole('button', { name: 'Fill colour' }).click();
  const hex = picker(page).getByRole('textbox', { name: 'HEX colour' });
  await hex.fill('#12345');
  await hex.press('Enter');
  await expect(hex).toHaveAttribute('aria-invalid', 'true');
  await expect(picker(page).getByRole('status')).toBeVisible();
  expect(await color(page, 'box-b', 'background-color')).toBe('rgb(255, 255, 255)');
  await hex.fill('ABC');
  await hex.press('Enter');
  await expect(hex).toHaveValue('#aabbcc');
  expect(await color(page, 'box-b', 'background-color')).toBe('rgb(170, 187, 204)');
  await hex.fill('16a34a');
  await hex.press('Tab');
  expect(await color(page, 'box-b', 'background-color')).toBe('rgb(22, 163, 74)');
  await page.locator('[data-cmd="undo"]').click();
  expect(await color(page, 'box-b', 'background-color')).toBe('rgb(255, 255, 255)');
  await page.locator('[data-cmd="redo"]').click();
  expect(await color(page, 'box-b', 'background-color')).toBe('rgb(22, 163, 74)');
});

test('opening a translucent colour preserves it, and picker and palette keep HEX in sync', async ({ page }) => {
  const original = ORIGINAL.replace('id="box-b"', 'id="box-b" style="background-color: rgba(51, 102, 153, 0.35)"');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'alpha.html', null), original);
  await select(page, '#box-b');
  const swatch = field(page, 'Fill', 'Fill & border').getByRole('button', { name: 'Fill colour' });
  await swatch.click();
  const hex = picker(page).getByRole('textbox', { name: 'HEX colour' });
  await expect(hex).toHaveValue('#33669959');
  await hex.press('Escape');
  expect(await domDiff(page, original, await saveViaDownload(page))).toEqual([]);
  await swatch.click();
  await picker(page).getByLabel('Choose colour').evaluate((input: HTMLInputElement) => {
    input.value = '#112233';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(hex).toHaveValue('#11223359');
  expect(await color(page, 'box-b', 'background-color')).toBe('rgba(17, 34, 51, 0.35)');
  await picker(page).locator('.pop-swatch').first().click();
  await expect(hex).toHaveValue(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/);
  const selected = await hex.inputValue();
  await hex.fill('#abcdef80');
  await hex.press('Enter');
  expect(await color(page, 'box-b', 'background-color')).toBe('rgba(171, 205, 239, 0.5)');
  expect(await color(page, 'box-b', 'opacity')).toBe('1');
  expect(selected).not.toBe('#11223359');
});

test('direct HEX edits work for gradient stops and SVG fills', async ({ page }) => {
  await select(page, '#badge');
  await field(page, 'Colour 2', 'Gradient').getByRole('button', { name: 'Colour 2 colour' }).click();
  const hex = picker(page).getByRole('textbox', { name: 'HEX colour' });
  await hex.fill('#16a34a');
  await hex.press('Enter');
  expect(await color(page, 'badge', 'background-image')).toBe('linear-gradient(90deg, rgb(255, 231, 163), rgb(22, 163, 74))');
  await hex.press('Escape');
  await select(page, '#node-1');
  await expect(field(page, 'Opacity', 'Shape')).toHaveCount(0);
  await expect(field(page, 'Opacity', 'Effects').locator('.ctl-slider-out')).toHaveValue('100%');
  await field(page, 'Fill', 'Shape').getByRole('button', { name: 'Fill colour' }).click();
  await hex.fill('#abcdef');
  await hex.press('Enter');
  expect(await color(page, 'node-1', 'fill')).toBe('rgb(171, 205, 239)');
  await hex.press('Escape');
  const opacity = field(page, 'Opacity', 'Effects').locator('.ctl-slider-out');
  await opacity.fill('45');
  await opacity.press('Enter');
  expect(await color(page, 'node-1', 'opacity')).toBe('0.45');
  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toHaveLength(2);
  expect(diff[0]).toContain('div#badge[1] @style');
  expect(diff[1]).toContain('rect#node-1[1] @style');
});
