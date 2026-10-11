import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { domDiff, launch, openFile, saveViaDownload, select } from './helpers';

const sample = '<!doctype html><html><head></head><body><button data-case="airtel">Airtel partnership</button><button data-case="hdfc"><strong>HDFC</strong> earnings</button><button data-case="kaynes">Kaynes expansion</button></body></html>';
const suppliedFile = process.env.TWEAKERR_BUTTON_FILE;

for (const file of [undefined, ...(suppliedFile ? [suppliedFile] : [])]) {
  test(`spaces in button labels survive typing, undo, redo and save (${file ? 'supplied page' : 'generic HTML'})`, async ({ page }) => {
    await launch(page);
    const source = file ? readFileSync(file, 'utf8') : sample;
    if (file) await openFile(page, file, file);
    else await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'buttons.html', null), source);
    await page.evaluate(() => {
      const doc = (window as any).tweakerr.editor.doc;
      doc.defaultView.buttonActivations = 0;
      doc.addEventListener('click', (event: MouseEvent) => {
        if ((event.target as Element).closest('button')) doc.defaultView.buttonActivations++;
      });
    });

    const expectedLabels: Record<string, string> = {};
    for (const [key, extra] of [
      ['airtel', 'India'],
      ['hdfc', 'Bank'],
      ['kaynes', 'Technology'],
    ]) {
      const selector = `button[data-case="${key}"]`;
      const button = page.frameLocator('#frame').locator(selector);
      // The optional user file may already contain edits from local testing.
      const original = (await button.textContent())!;
      const name = original.split(' ')[0];
      const expected = `${name} ${extra}${original.slice(name.length)}`;
      expectedLabels[key] = expected;
      await button.scrollIntoViewIfNeeded();
      await select(page, selector);
      await page.locator('#canvas').focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('contenteditable', 'plaintext-only');
      await page.keyboard.press('Home');
      for (const _ of name) await page.keyboard.press('ArrowRight');
      // Use actual key events: insertText/fill would bypass the Space-key bug.
      await page.keyboard.press('Space');
      await page.keyboard.type(extra);
      await page.keyboard.press('Escape');
      await expect(button).toHaveText(expected);
      await page.keyboard.press('Control+z');
      await expect(button).toHaveText(original);
      await page.keyboard.press('Control+Shift+z');
      await expect(button).toHaveText(expected);
    }

    expect(await page.evaluate(() => (window as any).tweakerr.editor.doc.defaultView.buttonActivations)).toBe(0);
    if (file) await page.screenshot({ path: test.info().outputPath('button-labels-with-spaces.png') });
    const saved = await saveViaDownload(page);
    expect(saved).not.toContain('contenteditable');
    const diff = await domDiff(page, source, saved);
    expect(diff).toHaveLength(3);
    for (const change of diff) expect(change).toMatch(/ text: /);
    await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'saved-buttons.html', null), saved);
    await expect(page.frameLocator('#frame').locator('button[data-case="hdfc"]')).toHaveText(expectedLabels.hdfc);
  });
}
