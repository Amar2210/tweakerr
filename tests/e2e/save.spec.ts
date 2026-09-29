import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { domDiff, drag, launch, openFile, pointIn, readFixture, saveViaDownload, select, setField } from './helpers';

const ORIGINAL = readFixture('board.html');

test('Ctrl+S writes straight back to the opened file (File System Access)', async ({ page }) => {
  // A fake file handle standing in for the real picker: records what gets written.
  await page.addInitScript((text) => {
    const w = window as any;
    w.__writes = [] as string[];
    const handle = {
      kind: 'file',
      name: 'board.html',
      getFile: async () => new File([w.__writes.at(-1) ?? text], 'board.html', { type: 'text/html' }),
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => {
        let buf = '';
        return { write: async (s: string) => void (buf += s), close: async () => void w.__writes.push(buf) };
      },
    };
    w.showOpenFilePicker = async () => [handle];
    w.showSaveFilePicker = async () => handle;
  }, ORIGINAL);
  await launch(page, { pickers: true });

  await page.locator('.toolbar [data-cmd="open"]').click();
  await expect(page.locator('#file-name')).toHaveText('board.html');
  await expect(page.locator('#file-name')).toHaveAttribute('title', /straight back/);

  await select(page, '#box-a');
  await setField(page, 'Fill', '#fef3c7', 'Fill & border');
  await expect(page).toHaveTitle(/^• board\.html/);
  await page.locator('#canvas').focus();
  await page.keyboard.press('Control+s');
  await expect(page.locator('.toast', { hasText: 'Saved board.html' })).toBeVisible();
  await expect(page).toHaveTitle('board.html — Tweakerr');

  const writes = await page.evaluate(() => (window as any).__writes as string[]);
  expect(writes).toHaveLength(1);
  expect(await domDiff(page, ORIGINAL, writes[0])).toEqual([
    expect.stringMatching(/div#box-a\[\d+\] @style: ∅ -> "background-color: rgb\(254, 243, 199\);"/),
  ]);
});

test('the done-check: border + move + arrow colour, save, reopen, only those changed', async ({ page }, info) => {
  await launch(page);
  await openFile(page, 'board.html');

  await select(page, '#box-c');
  await setField(page, 'Border', '3', 'Fill & border');
  await page.keyboard.down('Alt');
  await drag(page, await pointIn(page, '#badge', 0.5, 0.5), -40, 20);
  await page.keyboard.up('Alt');
  await select(page, '#arrow-2');
  await setField(page, 'Stroke', '#dc2626', 'Shape');
  await setField(page, 'End head', '#dc2626', 'Arrowheads');

  const saved = await saveViaDownload(page);
  const file = info.outputPath('board.html');
  writeFileSync(file, saved);

  // Open the saved file fresh and check what it contains.
  await page.reload();
  await openFile(page, 'board.html', file);
  const reopened = await page.evaluate(() => {
    const doc = (window as any).tweakerr.editor.doc as Document;
    const cs = (id: string) => getComputedStyle(doc.getElementById(id)!);
    return {
      border: cs('box-c').borderTopWidth,
      badgeMoved: cs('badge').translate,
      stroke: cs('arrow-2').stroke,
      head: getComputedStyle(doc.querySelector(`${cs('arrow-2').getPropertyValue('marker-end').match(/#[\w-]+/)![0]} path`)!).fill,
      otherHead: getComputedStyle(doc.querySelector('#head path')!).fill,
      title: doc.getElementById('title')!.textContent,
    };
  });
  expect(reopened.border).toBe('3px');
  expect(reopened.badgeMoved).not.toBe('none');
  expect(reopened.stroke).toBe('rgb(220, 38, 38)');
  expect(reopened.head).toBe('rgb(220, 38, 38)');
  expect(reopened.otherHead).toBe('rgb(51, 51, 51)');
  expect(reopened.title).toBe('Order to cash');

  const diff = await domDiff(page, ORIGINAL, saved);
  expect(diff).toEqual([
    expect.stringMatching(/div#badge\[\d+\] @style: ∅ -> "translate: -?[\d.]+px [\d.]+px;"/),
    expect.stringMatching(/div#box-c\[\d+\] @style: ∅ -> "border-width: 3px;"/),
    expect.stringMatching(/defs\[0\] children: 5 -> 6/),
    expect.stringMatching(/line#arrow-2\[\d+\] @style: ∅ -> "stroke: rgb\(220, 38, 38\); marker-end: url\(\\"#head-end\\"\);"/),
  ]);

  // Saving the reopened file again without edits changes nothing at all.
  const again = await saveViaDownload(page);
  expect(again).toBe(saved);
});
