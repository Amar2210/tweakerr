import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_URL = pathToFileURL(resolve('dist/tweakerr.html')).href;
export const fixturePath = (name: string) => resolve('tests/fixtures', name);
export const readFixture = (name: string) => readFileSync(fixturePath(name), 'utf8');

/**
 * Open the built editor. By default the File System Access pickers are
 * removed so the test drives the portable paths (file input + download).
 */
export async function launch(page: Page, opts: { pickers?: boolean } = {}): Promise<void> {
  if (!opts.pickers) {
    await page.addInitScript(() => {
      for (const k of ['showOpenFilePicker', 'showSaveFilePicker']) {
        Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true });
      }
    });
  }
  await page.goto(APP_URL);
}

/** Open a fixture through the toolbar's Open button. `path` overrides the fixture folder. */
export async function openFile(page: Page, name: string, path = fixturePath(name)): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.toolbar [data-cmd="open"]').click();
  await (await chooser).setFiles(path);
  await expect(page.locator('#file-name')).toHaveText(name.split('/').pop()!);
  await page.waitForFunction(() => (window as any).tweakerr.editor.doc?.readyState === 'complete');
}

/** Screen coordinates of a point inside a page element (fractions of its box). */
export async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([sel, fx, fy]) => {
      const { editor, stage } = (window as any).tweakerr;
      const el = editor.doc.querySelector(sel);
      if (!el) throw new Error(`No element ${sel}`);
      const s = stage.stage.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const z = editor.zoom;
      return { x: s.left + (b.left + b.width * fx) * z, y: s.top + (b.top + b.height * fy) * z };
    },
    [selector, fx, fy] as const,
  );
}

export async function clickIn(page: Page, selector: string, fx = 0.5, fy = 0.5): Promise<void> {
  const p = await pointIn(page, selector, fx, fy);
  await page.mouse.click(p.x, p.y);
}

/** Select an element directly (for tests whose subject isn't click-selection itself). */
export async function select(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const { editor } = (window as any).tweakerr;
    editor.select(editor.doc.querySelector(sel));
  }, selector);
  await expect(page.locator('.sel-header')).toBeVisible();
}

export async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as any).tweakerr.editor.selected?.id ?? null);
}

/** Drag with real mouse events, in small steps like a person would. */
export async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, opts: { steps?: number; hold?: () => Promise<void> } = {}): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: opts.steps ?? 12 });
  await opts.hold?.();
  await page.mouse.up();
}

/** A labelled field in the properties panel, optionally inside a named section. */
export function field(page: Page, label: string, section?: string) {
  const scope = section ? page.locator('#props details.section', { has: page.locator('summary', { hasText: new RegExp(`^${section}$`) }) }) : page.locator('#props');
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return scope
    .locator('.ctl-row, .ctl-inline, .ctl-block')
    .filter({ has: page.locator(':scope > .ctl-label', { hasText: exact }) })
    .first();
}

/** Type a value into a panel field and commit it with Enter. */
export async function setField(page: Page, label: string, value: string, section?: string): Promise<void> {
  const input = field(page, label, section).locator('input, textarea, select').first();
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

/** Save via Ctrl+S (download fallback) and return the file text. */
export async function saveViaDownload(page: Page): Promise<string> {
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const download = await dl;
  return readFileSync((await download.path())!, 'utf8');
}

/**
 * Structural difference between two HTML files: every attribute, text and
 * child-list change, keyed by a readable element path. An empty list means
 * the two files parse to the same document.
 */
export async function domDiff(page: Page, before: string, after: string): Promise<string[]> {
  return page.evaluate(
    ([a, b]) => {
      const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');
      const out: string[] = [];
      const name = (el: Element, i: number) => `${el.localName}${el.id ? '#' + el.id : ''}[${i}]`;
      const walk = (x: Node, y: Node, path: string) => {
        if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) {
          out.push(`${path}: ${x.nodeName} -> ${y.nodeName}`);
          return;
        }
        if (x.nodeType === Node.TEXT_NODE || x.nodeType === Node.COMMENT_NODE) {
          if ((x as CharacterData).data !== (y as CharacterData).data) out.push(`${path} text: ${JSON.stringify((x as CharacterData).data)} -> ${JSON.stringify((y as CharacterData).data)}`);
          return;
        }
        if (x.nodeType === Node.ELEMENT_NODE) {
          const ex = x as Element;
          const ey = y as Element;
          const names = new Set([...ex.getAttributeNames(), ...ey.getAttributeNames()]);
          for (const n of [...names].sort()) {
            const va = ex.getAttribute(n);
            const vb = ey.getAttribute(n);
            if (va !== vb) out.push(`${path} @${n}: ${va === null ? '∅' : JSON.stringify(va)} -> ${vb === null ? '∅' : JSON.stringify(vb)}`);
          }
        }
        const kx = Array.from((x as ParentNode & Node).childNodes ?? []);
        const ky = Array.from((y as ParentNode & Node).childNodes ?? []);
        if (kx.length !== ky.length) {
          out.push(`${path} children: ${kx.length} -> ${ky.length}`);
          return;
        }
        let ei = 0;
        kx.forEach((c, i) => {
          const p = c.nodeType === Node.ELEMENT_NODE ? `${path}>${name(c as Element, ei++)}` : `${path}>#${i}`;
          walk(c, ky[i], p);
        });
      };
      const da = parse(a);
      const db = parse(b);
      if ((da.doctype?.name ?? '') !== (db.doctype?.name ?? '')) out.push(`doctype: ${da.doctype?.name} -> ${db.doctype?.name}`);
      walk(da.documentElement, db.documentElement, 'html');
      return out;
    },
    [before, after] as const,
  );
}

/** Collect console errors, ignoring the expected "script blocked" message from the sandbox. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Blocked script execution/.test(m.text())) return;
    errors.push(m.text());
  });
  return errors;
}
