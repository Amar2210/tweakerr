import { expect, test, type Page } from '@playwright/test';
import { domDiff, field, launch, openFile, readFixture, saveViaDownload, select, setField } from './helpers';

const ORIGINAL = readFixture('board.html');
const cs = (page: Page, id: string, prop: string) =>
  page.evaluate(([i, p]) => getComputedStyle((window as any).tweakerr.editor.doc.getElementById(i)).getPropertyValue(p), [id, prop] as const);
const fill = (page: Page) => page.locator('#props details.section', { has: page.locator('summary', { hasText: /^Fill & border$/ }) });
const gradient = (page: Page) => page.locator('#props details.section', { has: page.locator('summary', { hasText: /^Gradient$/ }) });

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('a gradient shows one colour per stop, and each can be changed', async ({ page }) => {
  await select(page, '#badge');
  await expect(fill(page).getByRole('checkbox', { name: 'Gradient' })).toBeChecked();
  await expect(field(page, 'Type', 'Gradient').locator('select')).toHaveValue('linear');
  await expect(field(page, 'Angle', 'Gradient').locator('input')).toHaveValue('90');
  await expect(field(page, 'Colour 1', 'Gradient').locator('input.ctl-input')).toHaveValue('#ffe7a3');
  await expect(field(page, 'Colour 2', 'Gradient').locator('input.ctl-input')).toHaveValue('#ffc46b');
  expect(await domDiff(page, ORIGINAL, await saveViaDownload(page))).toEqual([]);

  await setField(page, 'Colour 2', '#16a34a', 'Gradient');
  await setField(page, 'Angle', '45', 'Gradient');
  expect(await cs(page, 'badge', 'background-image')).toBe('linear-gradient(45deg, rgb(255, 231, 163), rgb(22, 163, 74))');

  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toMatch(/div#badge\[\d+\] @style: ∅ -> "background-image: linear-gradient\(45deg, rgb\(255, 231, 163\), rgb\(22, 163, 74\)\);"/);
});

test('add and remove gradient colours, remove the gradient, make a new one', async ({ page }) => {
  await select(page, '#badge');
  await gradient(page).getByRole('button', { name: 'Add colour' }).click();
  await expect(field(page, 'Colour 3', 'Gradient')).toBeVisible();
  await gradient(page).getByRole('button', { name: 'Remove last' }).click();
  await expect(field(page, 'Colour 3', 'Gradient')).toHaveCount(0);
  await expect(gradient(page).getByRole('button', { name: 'Remove last' })).toBeDisabled();

  await fill(page).getByRole('checkbox', { name: 'Gradient' }).uncheck();
  expect(await cs(page, 'badge', 'background-image')).toBe('none');
  await expect(gradient(page)).toHaveCount(0);
  await fill(page).getByRole('checkbox', { name: 'Gradient' }).check();
  expect(await cs(page, 'badge', 'background-image')).toMatch(/^linear-gradient\(rgb\(/);
  await expect(field(page, 'Colour 2', 'Gradient')).toBeVisible();
});

test('gradient checkbox reveals controls, supports keyboard and undo, and saves the selected fill', async ({ page }) => {
  await select(page, '#box-b');
  const checkbox = fill(page).getByRole('checkbox', { name: 'Gradient' });
  await expect(checkbox).not.toBeChecked();
  await expect(gradient(page)).toHaveCount(0);
  await checkbox.focus();
  await checkbox.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(gradient(page)).toBeVisible();
  const type = field(page, 'Type', 'Gradient').locator('select');
  await type.selectOption('radial');
  await expect(field(page, 'Angle', 'Gradient')).toBeHidden();
  await type.selectOption('conic');
  expect(await cs(page, 'box-b', 'background-image')).toMatch(/^conic-gradient\(/);
  await type.selectOption('linear');
  await expect(field(page, 'Angle', 'Gradient')).toBeVisible();
  await setField(page, 'Colour 1', '#ff0000', 'Gradient');
  const before = await cs(page, 'box-b', 'background-image');
  await checkbox.uncheck();
  await expect(gradient(page)).toHaveCount(0);
  await page.locator('[data-cmd="undo"]').click();
  await expect(checkbox).toBeChecked();
  expect(await cs(page, 'box-b', 'background-image')).toBe(before);
  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toContain('div#box-b[1] @style');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), saved);
  await select(page, '#box-b');
  await expect(checkbox).toBeChecked();
  await expect(field(page, 'Colour 1', 'Gradient').locator('input.ctl-input')).toHaveValue('#ff0000');
});

test('toggling a gradient preserves other background image layers', async ({ page }) => {
  const original = ORIGINAL.replace('id="box-b"', 'id="box-b" style="background-image: url(data:image/png;base64,iVBORw0KGgo=)"');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'layered.html', null), original);
  await select(page, '#box-b');
  const image = await cs(page, 'box-b', 'background-image');
  const checkbox = fill(page).getByRole('checkbox', { name: 'Gradient' });
  await checkbox.check();
  expect(await cs(page, 'box-b', 'background-image')).toContain(image);
  await checkbox.uncheck();
  expect(await cs(page, 'box-b', 'background-image')).toBe(image);
});

test('fonts: the field shows one name; the list offers page, common and basic fonts', async ({ page }) => {
  await select(page, '#title');
  const input = field(page, 'Font', 'Text').locator('input');
  await expect(input).toHaveValue('Arial');
  await expect(field(page, 'Font', 'Text')).toHaveAttribute('title', 'Arial, sans-serif');

  await field(page, 'Font', 'Text').locator('.ctl-font-open').click();
  const pop = page.locator('.font-pop');
  await expect(pop.locator('.font-group')).toHaveText(['In this page', 'Common fonts', 'Basic']);
  await expect(pop.locator('.font-opt.on')).toHaveText('Arial');
  await pop.locator('.font-opt', { hasText: /^Georgia$/ }).click();
  await expect(pop).toHaveCount(0);
  expect(await cs(page, 'title', 'font-family')).toBe('Georgia, serif');
  await expect(input).toHaveValue('Georgia');

  // Typing a name works too, and gets a fallback of the right kind.
  await setField(page, 'Font', 'Courier New', 'Text');
  expect(await cs(page, 'title', 'font-family')).toBe('"Courier New", monospace');
});

test('the font list scrolls instead of squashing its rows', async ({ page }) => {
  await select(page, '#title');
  await field(page, 'Font', 'Text').locator('.ctl-font-open').click();
  const heights = await page.locator('.font-pop .font-opt').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThan(20);
  expect(await page.locator('.font-pop').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});
