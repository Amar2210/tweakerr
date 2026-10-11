import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readChangeLog } from '../../src/doc/changelog';
import { domDiff, launch, pointIn, saveViaDownload, select, setField } from './helpers';

const fixture = '<!DOCTYPE html><html><head><title>Links</title></head><body><p id="text">Edit this text</p><a id="link" href="https://example.test/documentation"><span>Data and documentation</span></a><a id="popup" target="_blank" href="https://example.test/other">Other</a><a id="fragment" href="#text">Jump</a><a id="relative" href="another.html">Relative</a><a id="download" href="https://example.test/file.pdf" download>Download</a><svg width="240" height="40"><a id="svg-link" href="https://example.test/svg"><text x="0" y="25">SVG link</text></a></svg></body></html>';
const realFile = process.env.TWEAKERR_LINK_FILE;

for (const [name, source] of [['fixture', fixture], ...(realFile ? [['provided HTML file', readFileSync(realFile, 'utf8')]] : [])]) {
  test(`link clicks stay in the editor and saved links still work: ${name}`, async ({ page, context }) => {
    await launch(page);
    // Block external requests if the regression returns, without following the URL.
    const navigations: string[] = [];
    await context.route('https://**', async (route) => {
      if (route.request().isNavigationRequest()) navigations.push(route.request().url());
      await route.abort();
    });
    await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'links.html', null), source);
    test.setTimeout(90_000);
    const links = await page.evaluate(() => {
      const doc = (window as any).tweakerr.editor.doc as Document;
      return [...doc.querySelectorAll('a[href]')].map((el) => {
        const parts: string[] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          parts.unshift(`${node.localName}:nth-child(${node.parentElement ? [...node.parentElement.children].indexOf(node) + 1 : 1})`);
        }
        return { selector: parts.join(' > '), href: el.getAttribute('href'), label: el.textContent };
      });
    });
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const { selector, href, label } of links) {
      await test.step(`Block ${label} (${href})`, async () => {
        // Real pointer input during text editing, when clicks can reach the iframe.
        await page.frameLocator('#frame').locator(selector).scrollIntoViewIfNeeded();
        await select(page, 'p');
        await page.locator('#canvas').focus();
        await page.keyboard.press('Enter');
        await expect(page.frameLocator('#frame').locator('p').first()).toHaveAttribute('contenteditable', 'plaintext-only');
        const point = await pointIn(page, selector);
        await page.mouse.click(point.x, point.y);
        await page.frameLocator('#frame').locator(selector).press('Enter');
        // Verify cancellation even if the editing overlay handles the pointer click.
        const cancelled = await page.evaluate((selector) => {
          const doc = (window as any).tweakerr.editor.doc;
          const link = doc.querySelector(selector);
          return ['click', 'auxclick'].map((type) => !link.dispatchEvent(new doc.defaultView.MouseEvent(type, { bubbles: true, cancelable: true })));
        }, selector);
        expect(cancelled, label ?? href ?? selector).toEqual([true, true]);
        expect(navigations).toEqual([]);
        expect(context.pages()).toHaveLength(1);
        expect(await page.evaluate(() => (window as any).tweakerr.editor.doc.URL)).toBe('about:srcdoc');
        // Clicking the canvas still selects the link for editing.
        await page.mouse.click(point.x, point.y);
        expect(await page.evaluate((selector) => {
          const { editor } = (window as any).tweakerr;
          return editor.doc.querySelector(selector).contains(editor.selected);
        }, selector)).toBe(true);
        await expect(page.frameLocator('#frame').locator(selector)).toHaveAttribute('href', href!);
      });
    }
    expect(await domDiff(page, source, await saveViaDownload(page))).toEqual([]);
    // Editing a link's appearance leaves all destinations intact in the saved HTML.
    await select(page, links[0].selector);
    await setField(page, 'Border', '3', 'Fill & border');
    const saved = await saveViaDownload(page);
    expect(readChangeLog(saved).records.at(-1)?.label).toBe('Change border-width');
    const diff = await domDiff(page, source, saved);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toContain('border-width: 3px');
    for (const { href } of links) expect(saved).toContain(`href="${href}"`);

  });
}

test('live link handlers are blocked while other page code can still draw content', async ({ page }) => {
  await launch(page);
  const html = '<!DOCTYPE html><html><head></head><body><div id="root"></div><script>document.getElementById("root").innerHTML = `<a id="link" href="#moved" onclick="document.body.dataset.followed=1">Link</a><p>One</p><p>Two</p><p>Three</p><p>Four</p>`;</script></body></html>';
  await page.evaluate(async (html) => (window as any).tweakerr.stage.mount(html, 'live-link.html', null), html);
  await page.frameLocator('#frame').locator('#link').press('Enter');
  expect(await page.evaluate(() => ({
    live: !!(window as any).tweakerr.editor.live,
    followed: (window as any).tweakerr.editor.doc.body.dataset.followed,
    url: (window as any).tweakerr.editor.doc.URL,
  }))).toEqual({ live: true, followed: undefined, url: 'about:srcdoc' });
});
