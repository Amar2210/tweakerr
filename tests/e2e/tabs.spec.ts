import { expect, test } from '@playwright/test';
import { domDiff, field, launch, openFile, readFixture, saveViaDownload, select, setField } from './helpers';

test('tabs group controls, keep selection across edits, and support keyboard navigation without moving elements', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#box-a');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await expect(tab('Style')).toHaveAttribute('aria-selected', 'true');
  await expect(field(page, 'Fill', 'Fill & border')).toBeVisible();
  await expect(field(page, 'Size', 'Text')).toBeHidden();
  await expect(field(page, 'Layer', 'Size & position')).toBeHidden();
  await expect(page.locator('details', { has: page.locator('summary', { hasText: /^Custom CSS$/ }) })).not.toHaveAttribute('open');
  await tab('Style').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Text')).toBeFocused();
  await expect(field(page, 'Size', 'Text')).toBeVisible();
  await select(page, '#title');
  await expect(tab('Text')).toHaveAttribute('aria-selected', 'true');
  await tab('Text').focus();
  await page.keyboard.press('End');
  await expect(tab('Arrange')).toBeFocused();
  await expect(field(page, 'Layer', 'Size & position')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(tab('Style')).toBeFocused();
  expect(await domDiff(page, readFixture('board.html'), await saveViaDownload(page))).toEqual([]);
  await setField(page, 'Size', '22', 'Text');
  await page.locator('[data-cmd="undo"]').click();
  await expect(tab('Text')).toHaveAttribute('aria-selected', 'true');
  await expect(field(page, 'Size', 'Text').locator('input')).toHaveValue('28');
  await select(page, '#arrow-1');
  await expect(tab('Text')).toBeDisabled();
  await expect(tab('Style')).toHaveAttribute('aria-selected', 'true');
  await tab('Style').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Arrange')).toBeFocused();
});

test('common controls fit a laptop window in each tab, including a gradient', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await launch(page);
  await openFile(page, 'board.html');
  await select(page, '#box-a');
  await field(page, 'Gradient', 'Fill & border').locator('input').check();
  for (const name of ['Style', 'Text', 'Arrange']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    const fits = await page.locator('.props-content').evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth);
    expect(fits, `${name} fits without scrolling`).toBe(true);
  }
  // Smaller windows retain access to overflow while the tabs stay fixed.
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  const before = await page.getByRole('tablist').boundingBox();
  await page.locator('.props-content').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await page.getByRole('tablist').boundingBox()).toEqual(before);
  await expect(page.locator('summary', { hasText: /^Custom CSS$/ })).toBeInViewport();
});

test('page and SVG text use Text; mixed selections disable unsupported tabs', async ({ page }) => {
  await launch(page);
  const html = readFixture('board.html').replace('</svg>', '<text x="10" y="20">Label</text></svg>');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'labels.html', null), html);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await expect(field(page, 'Font size', 'Text')).toBeVisible();
  await select(page, 'svg text');
  await expect(field(page, 'Fill', 'Text colour')).toBeVisible();
  await expect(field(page, 'Size', 'Text')).toBeVisible();
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    editor.setSelection([editor.doc.querySelector('#box-a'), editor.doc.querySelector('svg text')]);
  });
  await expect(page.getByRole('tab', { name: 'Text', exact: true })).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'Arrange', exact: true })).toBeDisabled();
  await expect(field(page, 'Opacity', 'Effects')).toBeVisible();
});
