import { expect, test, type Page } from '@playwright/test';
import { readRevisionComments } from '../../src/doc/comments';
import { readChangeLog } from '../../src/doc/changelog';
import { launch, openFile, select } from './helpers';

const request = (page: Page) => page.getByRole('textbox', { name: 'Revision request', exact: true });
const commentsOf = (html: string) => readRevisionComments(readChangeLog(html).source).comments;

async function setup(page: Page, inPlace: boolean) {
  await page.addInitScript(() => {
    const state = (window as any).pendingSave = {
      writes: [] as string[], disk: null as string | null, defer: true, closing: false,
      releaseWrite: () => {}, releaseClose: () => {}, handle: null as any,
    };
    state.handle = {
      kind: 'file', name: 'saved-board.html',
      queryPermission: async () => 'granted',
      getFile: async () => new File([state.disk ?? ''], 'saved-board.html', { type: 'text/html' }),
      async createWritable() {
        let snapshot = '';
        return {
          async write(html: string) {
            snapshot = html;
            state.writes.push(html);
            if (state.defer) await new Promise<void>((resolve) => { state.releaseWrite = resolve; });
          },
          async close() {
            state.closing = true;
            if (state.defer) await new Promise<void>((resolve) => { state.releaseClose = resolve; });
            state.disk = snapshot;
          },
        };
      },
    };
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
    Object.defineProperty(window, 'showSaveFilePicker', { value: async () => state.handle, configurable: true });
  });
  await launch(page, { pickers: true });
  await openFile(page, 'board.html');
  if (inPlace) await page.evaluate(() => { (window as any).tweakerr.editor.file.handle = (window as any).pendingSave.handle; });
  await select(page, '#box-a');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await request(page).fill('Snapshot request.');
  await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    Object.assign((window as any).pendingSave, {
      entry: editor.history.peekUndo(), redo: editor.history.peekUndo().stateChange.redo,
      journalLength: editor.history.changes.length,
    });
  });
}

async function finishWrite(page: Page) {
  await page.evaluate(() => (window as any).pendingSave.releaseWrite());
  await expect.poll(() => page.evaluate(() => (window as any).pendingSave.closing)).toBe(true);
}
async function finishClose(page: Page) {
  await page.evaluate(() => (window as any).pendingSave.releaseClose());
  await expect(page.getByRole('status').filter({ hasText: /^Saved (board|saved-board)\.html$/ })).toBeVisible();
}

for (const inPlace of [true, false]) {
  const mode = inPlace ? 'Save' : 'Save As';
  const shortcut = inPlace ? 'Control+s' : 'Control+Shift+s';

  test(`${mode} keeps coalesced comment typing during native write/close dirty`, async ({ page }) => {
    await setup(page, inPlace);
    await page.keyboard.press(shortcut);
    await expect.poll(() => page.evaluate(() => (window as any).pendingSave.writes.length)).toBe(1);
    await request(page).fill('Snapshot request. Typed while writing.');
    await finishWrite(page);
    await request(page).fill('Snapshot request. Typed while writing and closing.');
    // The regression must cover the SAME undo object, not merely a later entry.
    expect(await page.evaluate(() => {
      const { editor } = (window as any).tweakerr;
      const state = (window as any).pendingSave;
      return editor.history.peekUndo() === state.entry
        && editor.history.peekUndo().stateChange.redo !== state.redo
        && editor.history.changes.length === state.journalLength;
    })).toBe(true);
    await finishClose(page);
    const disk = await page.evaluate(() => (window as any).pendingSave.disk);
    expect(commentsOf(disk)[0].text).toBe('Snapshot request.');
    await expect(request(page)).toHaveValue('Snapshot request. Typed while writing and closing.');
    await expect(page.locator('#file-name')).toHaveClass(/dirty/);
    expect(await page.evaluate(() => (window as any).tweakerr.editor.dirty)).toBe(true);

    await page.evaluate(() => { (window as any).pendingSave.defer = false; });
    await page.keyboard.press('Control+s');
    await expect.poll(async () => commentsOf(await page.evaluate(() => (window as any).pendingSave.disk))[0].text).toBe('Snapshot request. Typed while writing and closing.');
    await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
    await request(page).fill('A later unsaved request.');
    await page.locator('[data-cmd="undo"]').click();
    expect(await page.evaluate(() => (window as any).tweakerr.editor.comments.all[0].text)).toBe('Snapshot request. Typed while writing and closing.');
    await expect(page.locator('#file-name')).not.toHaveClass(/dirty/);
    await page.locator('[data-cmd="redo"]').click();
    await expect(page.locator('#file-name')).toHaveClass(/dirty/);
    expect(await page.evaluate(() => (window as any).tweakerr.editor.history.changes)).toEqual([]);
  });

  test(`${mode} completion cannot mark a newly loaded file clean or rename it`, async ({ page }) => {
    await setup(page, inPlace);
    await page.keyboard.press(shortcut);
    await expect.poll(() => page.evaluate(() => (window as any).pendingSave.writes.length)).toBe(1);
    await page.evaluate(async () => {
      const { stage } = (window as any).tweakerr;
      await stage.mount('<!DOCTYPE html><html><body><h1 id="new-target">New file</h1></body></html>', 'new-file.html', null);
    });
    await select(page, '#new-target');
    await page.getByRole('button', { name: 'Add comment', exact: true }).click();
    await request(page).fill('Only in the newly loaded file.');
    await finishWrite(page);
    await finishClose(page);
    await expect(page.locator('#file-name')).toHaveText('• new-file.html');
    await expect(page.locator('#file-name')).toHaveClass(/dirty/);
    expect(await page.evaluate(() => (window as any).tweakerr.editor.file.handle)).toBeNull();
    expect(await page.evaluate(() => (window as any).tweakerr.editor.comments.all[0].text)).toBe('Only in the newly loaded file.');
    expect(commentsOf(await page.evaluate(() => (window as any).pendingSave.disk))[0].text).toBe('Snapshot request.');
  });
}

test('an older in-place write cannot clean the newer Save As destination', async ({ page }) => {
  await setup(page, true); // A is the current in-place handle.
  await request(page).fill('first');
  await page.evaluate(() => {
    const state = (window as any).pendingSaveAs = { written: null as string | null, disk: null as string | null, release: () => {}, handle: null as any };
    state.handle = {
      kind: 'file', name: 'destination-b.html',
      getFile: async () => new File([state.disk ?? ''], 'destination-b.html', { type: 'text/html' }),
      async createWritable() {
        return {
          async write(html: string) {
            state.written = html;
            await new Promise<void>((resolve) => { state.release = resolve; });
          },
          async close() { state.disk = state.written; },
        };
      },
    };
    Object.defineProperty(window, 'showSaveFilePicker', { value: async () => state.handle, configurable: true });
  });
  await page.keyboard.press('Control+Shift+s');
  await expect.poll(() => page.evaluate(() => (window as any).pendingSaveAs.written !== null)).toBe(true);
  await request(page).fill('second');
  await page.keyboard.press('Control+s'); // Still writes A while B is pending.
  await expect.poll(() => page.evaluate(() => (window as any).pendingSave.writes.length)).toBe(1);

  await page.evaluate(() => (window as any).pendingSaveAs.release()); // Finish B first.
  await expect(page.getByRole('status').filter({ hasText: /^Saved destination-b\.html$/ })).toBeVisible();
  await expect(page.locator('#file-name')).toHaveText('• destination-b.html');
  expect(commentsOf(await page.evaluate(() => (window as any).pendingSaveAs.disk))[0].text).toBe('first');
  await finishWrite(page);
  await page.evaluate(() => (window as any).pendingSave.releaseClose()); // Then finish A.
  await expect.poll(() => page.evaluate(() => (window as any).pendingSave.disk !== null)).toBe(true);
  expect(commentsOf(await page.evaluate(() => (window as any).pendingSave.disk))[0].text).toBe('second');
  expect(await page.evaluate(() => {
    const { editor } = (window as any).tweakerr;
    return editor.file.handle === (window as any).pendingSaveAs.handle && editor.file.name === 'destination-b.html';
  })).toBe(true);
  await expect(request(page)).toHaveValue('second');
  await expect(page.locator('#file-name')).toHaveClass(/dirty/);
  await expect(page.locator('#file-name')).toHaveText('• destination-b.html');
});
