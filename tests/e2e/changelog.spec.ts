import { expect, test } from '@playwright/test';
import { readChangeLog } from '../../src/doc/changelog';
import { domDiff, launch, openFile, readFixture, saveViaDownload, select, setField } from './helpers';

test('save comments retain changes across saves, undo/redo, reopen, and further editing', async ({ page }) => {
  await launch(page);
  await openFile(page, 'board.html');
  expect(readChangeLog(await saveViaDownload(page)).records).toEqual([]);
  await select(page, '#title');
  await setField(page, 'Size', '24', 'Text');
  const first = await saveViaDownload(page);
  const log = readChangeLog(first).records;
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({ action: 'edit', label: 'Change font-size', changes: [{ target: 'h1[id="title"]', property: '@style', before: null, after: 'font-size: 24px;' }] });
  expect(await saveViaDownload(page)).toBe(first);
  await page.locator('[data-cmd="undo"]').click();
  const undone = await saveViaDownload(page);
  expect(readChangeLog(undone).records.map((r) => r.action)).toEqual(['edit', 'undo']);
  expect(await domDiff(page, readFixture('board.html'), undone)).toEqual([]);
  await page.locator('[data-cmd="redo"]').click();
  const redone = await saveViaDownload(page);
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), redone);
  expect(await saveViaDownload(page)).toBe(redone);
  await select(page, '#title');
  await setField(page, 'Size', '20', 'Text');
  const next = readChangeLog(await saveViaDownload(page)).records;
  expect(next).toHaveLength(4);
  expect(next.slice(0, 3)).toEqual(readChangeLog(redone).records);
  expect(next[3].changes[0]).toMatchObject({ before: 'font-size: 24px;', after: 'font-size: 20px;' });
  // Metadata stays out of the editable document, selection and undo history.
  expect(await page.evaluate(() => (window as any).tweakerr.editor.doc.documentElement.outerHTML)).not.toContain('Tweakerr change log');
});

test('live text can be edited again after reopening a logged file', async ({ page }) => {
  await launch(page);
  await openFile(page, 'drawn.html');
  await select(page, '#step-invoice h2');
  await page.locator('#canvas').focus();
  await page.keyboard.press('Enter');
  await expect(page.frameLocator('#frame').locator('#step-invoice h2')).toHaveAttribute('contenteditable', 'plaintext-only');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Billing');
  await page.keyboard.press('Escape');
  const first = await saveViaDownload(page);
  expect(readChangeLog(first).records.length).toBeGreaterThan(0);
  expect(readChangeLog(first).source).toContain('Billing');
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved.html', null), first);
  await select(page, '#step-invoice h2');
  await page.locator('#canvas').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Accounts');
  await page.keyboard.press('Escape');
  const next = readChangeLog(await saveViaDownload(page));
  expect(next.source).toContain('Accounts');
  expect(next.records.length).toBeGreaterThan(readChangeLog(first).records.length);
});
