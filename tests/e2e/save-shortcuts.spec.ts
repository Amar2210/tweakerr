import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { launch, openFile, saveViaDownload, select } from './helpers';

const contents = '<button id="label">HDFC earnings</button><input id="input" value="Search"><p>One</p><p>Two</p><p>Three</p><p>Four</p>';

for (const live of [false, true]) {
  test(`Ctrl+S uses editor save when focus is inside the ${live ? 'live' : 'static'} page`, async ({ page }) => {
    await launch(page);
    const html = `<!doctype html><html><head></head><body>${live ? `<div id="root"></div><script>document.getElementById('root').innerHTML = ${JSON.stringify(contents)};</script>` : contents}</body></html>`;
    const mount = () => page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'company.html', null), html);
    await mount();
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    const saveWith = async (action: () => Promise<unknown>) => {
      const pending = page.waitForEvent('download', { timeout: 5000 });
      await action();
      const download = await pending;
      expect(download.suggestedFilename()).toBe('company.html');
      return readFileSync((await download.path())!, 'utf8');
    };
    const toolbarSave = await saveWith(() => page.locator('.toolbar [data-cmd="save"]').click());
    const frame = page.frameLocator('#frame');
    // Keyboard focus can remain in the iframe even without an active text edit.
    for (const selector of ['#label', '#input']) {
      await frame.locator(selector).focus();
      expect(await saveWith(() => page.keyboard.press('Control+s'))).toBe(toolbarSave);
    }
    // A fresh document must get the same shortcut handling.
    await mount();
    await frame.locator('#label').focus();
    expect(await saveWith(() => page.keyboard.press('Control+Shift+s'))).toBe(toolbarSave);
    await select(page, '#label');
    await page.locator('#canvas').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('HDFC Bank earnings');
    const edited = await saveWith(() => page.keyboard.press('Control+s'));
    expect(edited).toContain('HDFC Bank earnings');
    expect(edited).not.toContain('contenteditable');
    expect(edited).toBe(await saveWith(() => page.locator('.toolbar [data-cmd="save"]').click()));
    expect(downloads).toEqual(Array(6).fill('company.html'));
  });
}

const suppliedFile = process.env.TWEAKERR_BUTTON_FILE;
if (suppliedFile) {
  test('Ctrl+S matches toolbar Save from each company button in the supplied file', async ({ page }) => {
    await launch(page);
    await openFile(page, suppliedFile, suppliedFile);
    const download = page.waitForEvent('download');
    await page.locator('.toolbar [data-cmd="save"]').click();
    const baseline = readFileSync((await (await download).path())!, 'utf8');
    for (const key of ['airtel', 'hdfc', 'kaynes']) {
      await page.frameLocator('#frame').locator(`button[data-case="${key}"]`).focus();
      expect(await saveViaDownload(page)).toBe(baseline);
    }
  });
}
