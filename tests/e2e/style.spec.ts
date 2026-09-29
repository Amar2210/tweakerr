import { expect, test, type Page } from '@playwright/test';
import { domDiff, field, launch, openFile, readFixture, saveViaDownload, select, setField } from './helpers';

const ORIGINAL = readFixture('board.html');
const cs = (page: Page, id: string, prop: string) =>
  page.evaluate(([i, p]) => getComputedStyle((window as any).tweakerr.editor.doc.getElementById(i)).getPropertyValue(p), [id, prop] as const);
const fill = (page: Page) => page.locator('#props details.section', { has: page.locator('summary', { hasText: /^Fill & border$/ }) });

test.beforeEach(async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
});

test('a gradient shows one colour per stop, and each can be changed', async ({ page }) => {
  await select(page, '#badge');
  await expect(fill(page).locator('.ctl-note')).toContainText('gradient is drawn over the fill');
  await expect(field(page, 'Gradient', 'Fill & border').locator('select')).toHaveValue('linear');
  await expect(field(page, 'Angle', 'Fill & border').locator('input')).toHaveValue('90');
  await expect(field(page, 'Colour 1', 'Fill & border').locator('input.ctl-input')).toHaveValue('#ffe7a3');
  await expect(field(page, 'Colour 2', 'Fill & border').locator('input.ctl-input')).toHaveValue('#ffc46b');

  await setField(page, 'Colour 2', '#16a34a', 'Fill & border');
  await setField(page, 'Angle', '45', 'Fill & border');
  expect(await cs(page, 'badge', 'background-image')).toBe('linear-gradient(45deg, rgb(255, 231, 163), rgb(22, 163, 74))');

  const saved = await saveViaDownload(page);
  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toHaveLength(1);
  expect(diff[0]).toMatch(/div#badge\[\d+\] @style: ∅ -> "background-image: linear-gradient\(45deg, rgb\(255, 231, 163\), rgb\(22, 163, 74\)\);"/);
});

test('add and remove gradient colours, remove the gradient, make a new one', async ({ page }) => {
  await select(page, '#badge');
  await fill(page).getByRole('button', { name: 'Add colour' }).click();
  await expect(field(page, 'Colour 3', 'Fill & border')).toBeVisible();
  await fill(page).getByRole('button', { name: 'Remove last' }).click();
  await expect(field(page, 'Colour 3', 'Fill & border')).toHaveCount(0);
  await expect(fill(page).getByRole('button', { name: 'Remove last' })).toBeDisabled();

  await fill(page).getByRole('button', { name: 'Remove gradient' }).click();
  expect(await cs(page, 'badge', 'background-image')).toBe('none');
  await fill(page).getByRole('button', { name: 'Make it a gradient' }).click();
  expect(await cs(page, 'badge', 'background-image')).toMatch(/^linear-gradient\(rgb\(/);
  await expect(field(page, 'Colour 2', 'Fill & border')).toBeVisible();
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
