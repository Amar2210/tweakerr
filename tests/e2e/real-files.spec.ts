/**
 * The "done check" against any HTML files you have lying around:
 *
 *   TWEAKERR_FILES="/path/a.html:/path/b.html" npx playwright test real-files --output /tmp/tw
 *
 * For each file it changes a border, moves a box and (if the page has an
 * SVG arrow) recolours the arrow and its head, then saves, reopens, and
 * checks that only those elements changed. Skipped when TWEAKERR_FILES is
 * unset. Point --output outside the repo: it holds copies of your files.
 */
import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { domDiff, drag, launch, openFile, saveViaDownload, setField, trackErrors } from './helpers';

const files = (process.env.TWEAKERR_FILES ?? '').split(':').filter(Boolean);

test.skip(files.length === 0, 'Set TWEAKERR_FILES to run against your own HTML files');

for (const path of files) {
  test(`done-check: ${basename(path)}`, async ({ page }, info) => {
    const errors = trackErrors(page);
    const original = readFileSync(path, 'utf8');
    await launch(page);
    await openFile(page, basename(path), path);

    // Pick targets. Each is kept on `window` for the test and described by
    // its structural path, which is how domDiff names elements too.
    const picks = await page.evaluate(() => {
      const { editor } = (window as any).tweakerr;
      const doc = editor.doc as Document;
      const win = doc.defaultView!;
      const pathOf = (el: Element): string => {
        const parts: string[] = [];
        for (let e: Element | null = el; e && e !== doc.documentElement; e = e.parentElement) {
          const idx = Array.from(e.parentElement!.children).indexOf(e);
          parts.unshift(`${e.localName}${e.id ? '#' + e.id : ''}[${idx}]`);
        }
        return ['html', ...parts].join('>');
      };
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const cs = win.getComputedStyle(el);
        return r.width >= 60 && r.height >= 24 && r.width < 1000 && r.top < 2500 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.display !== 'inline';
      };
      const html = Array.from(doc.body.querySelectorAll('*')).filter((e) => e.namespaceURI === 'http://www.w3.org/1999/xhtml' && visible(e));
      const bordered = html.filter((e) => {
        const cs = win.getComputedStyle(e);
        return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
      });
      const filled = html.filter((e) => {
        const bg = win.getComputedStyle(e).backgroundColor;
        return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      });
      const borderEl = bordered[0] ?? filled[0] ?? html[0];
      const moveEl = [...bordered, ...filled, ...html].find((e) => e !== borderEl && !e.contains(borderEl) && !borderEl.contains(e));
      const svgLines = Array.from(doc.querySelectorAll('svg line, svg path, svg polyline')).filter((e) => {
        const cs = win.getComputedStyle(e);
        return cs.stroke !== 'none' && e.getBoundingClientRect().width + e.getBoundingClientRect().height > 20;
      });
      const arrowEl = svgLines.find((e) => win.getComputedStyle(e).getPropertyValue('marker-end') !== 'none') ?? svgLines[0];
      const tag = (el: Element | undefined, k: string) => {
        if (el) (window as any)[`__pick_${k}`] = el;
        return el ? { path: pathOf(el), label: `${el.localName}${el.id ? '#' + el.id : el.classList[0] ? '.' + el.classList[0] : ''}` } : null;
      };
      return { border: tag(borderEl, 'border'), move: tag(moveEl, 'move'), arrow: tag(arrowEl, 'arrow') };
    });
    info.annotations.push({ type: 'targets', description: JSON.stringify(picks) });
    expect(picks.border, 'page has no element to put a border on').not.toBeNull();
    const selectPick = (k: string) => page.evaluate((key) => (window as any).tweakerr.editor.select((window as any)[`__pick_${key}`]), k);

    // 1. Border
    await selectPick('border');
    const before = await page.evaluate(() => parseFloat(getComputedStyle((window as any).__pick_border).borderTopWidth) || 0);
    const newWidth = Math.round(before) + 3;
    await setField(page, 'Border', String(newWidth), 'Fill & border');

    // 2. Move (select it first so pressing anywhere inside drags the whole box)
    if (picks.move) {
      await selectPick('move');
      // Scroll the canvas so the box is on screen.
      await page.evaluate(() => {
        const { stage, editor } = (window as any).tweakerr;
        const r = (window as any).__pick_move.getBoundingClientRect();
        stage.canvas.scrollTop = Math.max(0, r.top * editor.zoom - 150);
      });
      const p = await page.evaluate(() => {
        const { stage, editor } = (window as any).tweakerr;
        const r = (window as any).__pick_move.getBoundingClientRect();
        const s = stage.stage.getBoundingClientRect();
        return { x: s.left + (r.left + Math.min(12, r.width / 2)) * editor.zoom, y: s.top + (r.top + Math.min(8, r.height / 2)) * editor.zoom };
      });
      await page.keyboard.down('Alt');
      await drag(page, p, 30, 20);
      await page.keyboard.up('Alt');
    }

    // 3. Arrow colour + its head
    let headColoured = false;
    if (picks.arrow) {
      await selectPick('arrow');
      await setField(page, 'Stroke', '#e11d48', 'Shape');
      const head = page.locator('#props details.section', { has: page.locator('summary', { hasText: /^Arrowheads$/ }) });
      if (await head.locator('.ctl-row', { hasText: 'End head' }).count()) {
        await setField(page, 'End head', '#e11d48', 'Arrowheads');
        headColoured = true;
      }
    }

    // Save, reopen, check.
    const saved = await saveViaDownload(page);
    const out = info.outputPath(basename(path));
    writeFileSync(out, saved);
    await page.screenshot({ path: info.outputPath('after-edit.png') });

    const diff = await domDiff(page, original, saved);
    info.annotations.push({ type: 'diff', description: diff.join('\n') });
    const allowed = [picks.border!.path, picks.move?.path, picks.arrow?.path].filter(Boolean) as string[];
    const unexpected = diff.filter((line) => {
      if (allowed.some((p) => line.startsWith(`${p} @`))) return false;
      // Recolouring a shared arrowhead adds a marker copy to <defs>; an unshared one changes the marker's shape.
      if (headColoured && (/>defs\[\d+\] children:/.test(line) || /marker[^>]*\[\d+\]>[a-z]+[^ ]*\[\d+\] @style/.test(line))) return false;
      return true;
    });
    expect(unexpected, 'changes outside the edited elements').toEqual([]);
    expect(diff.length).toBeGreaterThan(0);

    await page.reload();
    await openFile(page, basename(path), out);
    const reopened = await page.evaluate(
      ([bp, mp, ap]) => {
        const doc = (window as any).tweakerr.editor.doc as Document;
        const at = (p: string | undefined) => {
          if (!p) return null;
          let el: Element = doc.documentElement;
          for (const part of p.split('>').slice(1)) el = el.children[Number(/\[(\d+)\]$/.exec(part)![1])];
          return el;
        };
        const b = at(bp)!;
        const m = at(mp);
        const a = at(ap);
        return {
          border: getComputedStyle(b).borderTopWidth,
          moved: m ? (m as HTMLElement).style.translate : null,
          stroke: a ? getComputedStyle(a).stroke : null,
        };
      },
      [picks.border!.path, picks.move?.path, picks.arrow?.path] as const,
    );
    info.annotations.push({ type: 'reopened', description: JSON.stringify(reopened) });
    expect(reopened.border).toBe(`${newWidth}px`);
    if (picks.move) expect(reopened.moved).toMatch(/px/);
    if (picks.arrow) expect(reopened.stroke).toBe('rgb(225, 29, 72)');

    // Saving again without edits is byte-for-byte stable.
    expect(await saveViaDownload(page)).toBe(saved);
    expect(errors).toEqual([]);
  });
}
