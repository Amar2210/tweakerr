import { expect, test, type Page } from '@playwright/test';
import { domDiff, drag, launch, openFile, readFixture, saveViaDownload, select, setField } from './helpers';

const inPage = <T>(page: Page, fn: (doc: Document) => T) =>
  page.evaluate(`(${fn.toString()})(window.tweakerr.editor.doc)`) as Promise<T>;

/** Screen centre of one of the selected arrow's dots: p1 (tail), p2 (head) or mid. */
async function dot(page: Page, name: 'p1' | 'p2' | 'mid') {
  const b = (await page.locator(`#overlay .ov-handle[data-handle="${name}"]`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** A point of the page, in screen px. */
const toScreen = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const { editor, stage } = (window as any).tweakerr;
    const s = stage.stage.getBoundingClientRect();
    return { x: s.left + px * editor.zoom, y: s.top + py * editor.zoom };
  }, [x, y]);

test.describe('on a normal page', () => {
  test.beforeEach(async ({ page }) => {
    await launch(page);
    await openFile(page, 'board.html');
  });

  test('an arrow shows tail, head and middle dots', async ({ page }) => {
    await select(page, '#arrow-3');
    await expect(page.locator('#overlay .ov-handle')).toHaveCount(3);
    await expect(page.locator('#overlay .ov-handle-mid')).toHaveCount(1);
  });

  test('dragging the head near a shape snaps it onto the shape\'s edge', async ({ page }) => {
    await select(page, '#arrow-1');
    // node-3 is a circle at (660, 70), r 40: its left point is (620, 70).
    const circle = await inPage(page, (d) => {
      const r = d.getElementById('node-3')!.getBoundingClientRect();
      return { x: r.left, y: r.top + r.height / 2 };
    });
    const aim = await toScreen(page, circle.x - 4, circle.y + 3);
    const from = await dot(page, 'p2');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(aim.x, aim.y, { steps: 10 });
    await expect(page.locator('#overlay .ov-snap')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('#overlay .ov-snap')).toBeHidden();
    expect(await inPage(page, (d) => [d.getElementById('arrow-1')!.getAttribute('x2'), d.getElementById('arrow-1')!.getAttribute('y2')])).toEqual(['620', '70']);
  });

  test('Alt turns the magnet off', async ({ page }) => {
    await select(page, '#arrow-1');
    const from = await dot(page, 'p2');
    await page.keyboard.down('Alt');
    await drag(page, from, 0, 30);
    await page.keyboard.up('Alt');
    const y2 = await inPage(page, (d) => parseFloat(d.getElementById('arrow-1')!.getAttribute('y2')!));
    expect(y2).toBeGreaterThan(90);
  });

  test('bending a straight line makes it a curve that keeps its look; undo brings the line back', async ({ page }) => {
    await select(page, '#arrow-1');
    await drag(page, await dot(page, 'mid'), 0, -30);
    const bent = await inPage(page, (d) => {
      const el = d.getElementById('arrow-1')!;
      return { tag: el.localName, d: el.getAttribute('d'), head: el.getAttribute('marker-end'), stroke: el.getAttribute('stroke') };
    });
    expect(bent.tag).toBe('path');
    expect(bent.d).toMatch(/^M 152 70 Q [-\d.]+ [-\d.]+ 296 70$/);
    expect(bent).toMatchObject({ head: 'url(#head)', stroke: '#333' });
    expect(await page.evaluate(() => (window as any).tweakerr.editor.selected?.localName)).toBe('path');

    const saved = await saveViaDownload(page);
    const diff = await domDiff(page, readFixture('board.html'), saved);
    expect(diff.join('\n')).toContain('arrow-1');

    await page.locator('#canvas').focus();
    await page.keyboard.press('Control+z');
    expect(await inPage(page, (d) => d.getElementById('arrow-1')!.localName)).toBe('line');
  });

  test('dragging the middle back near the straight line makes it straight', async ({ page }) => {
    await select(page, '#arrow-3');
    const mid = await dot(page, 'mid');
    const [a, b] = [await dot(page, 'p1'), await dot(page, 'p2')];
    const straight = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    await drag(page, mid, straight.x - mid.x + 1, straight.y - mid.y + 1);
    expect(await inPage(page, (d) => d.getElementById('arrow-3')!.getAttribute('d'))).toMatch(/^M 80 100 L 660 112$/);
  });

  test('moving the tail of a curved arrow keeps its head where it was', async ({ page }) => {
    await select(page, '#arrow-3');
    await page.keyboard.down('Alt');
    await drag(page, await dot(page, 'p1'), -20, 0);
    await page.keyboard.up('Alt');
    const d = await inPage(page, (doc) => doc.getElementById('arrow-3')!.getAttribute('d')!);
    expect(d).toMatch(/^M [\d.]+ 100 C .* 660 112$/);
    expect(parseFloat(d.slice(2))).toBeLessThan(80);
  });
});

test.describe('on a page drawn by code', () => {
  test.beforeEach(async ({ page }) => {
    await launch(page);
    await openFile(page, 'drawn.html');
  });

  test('a reshaped arrow keeps its shape when the code redraws, until Reset shape', async ({ page }) => {
    await select(page, '#wire-loop');
    await expect(page.locator('#overlay .ov-handle')).toHaveCount(3);
    await page.keyboard.down('Alt');
    await drag(page, await dot(page, 'p2'), 40, 0);
    await page.keyboard.up('Alt');
    const shape = () => inPage(page, (d) => getComputedStyle(d.getElementById('wire-loop')!).getPropertyValue('d'));
    const drawn = await shape();
    expect(drawn).toMatch(/^path\("M /);

    // The page redraws its arrows; the new copy still takes the saved shape.
    await page.evaluate(() => (window as any).tweakerr.editor.win.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(400);
    expect(await shape()).toBe(drawn);
    await expect(page.locator('#props .ctl-note', { hasText: "You've reshaped this arrow" })).toBeVisible();

    const saved = await saveViaDownload(page);
    expect(saved).toMatch(/#wire-loop \{ d: path\("M [^"]+"\) !important; \}/);

    await page.locator('#props button', { hasText: 'Reset shape' }).click();
    expect(await inPage(page, (d) => d.getElementById('tweakerr-edits')!.textContent)).not.toContain('wire-loop');
  });

  test('a click-through label can still be picked, and its words changed', async ({ page }) => {
    const at = await inPage(page, (d) => {
      const r = d.querySelector('#wires text.lbl')!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const p = await toScreen(page, at.x, at.y);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => (window as any).tweakerr.editor.selected?.textContent)).toBe('handover');

    await setField(page, 'Text', 'hand-off', 'Text');
    await page.evaluate(() => (window as any).tweakerr.editor.win.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(400);
    expect(await inPage(page, (d) => d.querySelector('#wires text.lbl')!.textContent)).toBe('hand-off');
    const saved = await saveViaDownload(page);
    expect(saved).toContain('>hand-off</text>');
    expect(saved).not.toContain('visiblePainted'); // the editor's click rule stays out of the file
  });

  test('straight lines drawn by code have no dots (their ends can\'t be saved)', async ({ page }) => {
    await select(page, '#wire-order-invoice');
    await expect(page.locator('#overlay .ov-handle')).toHaveCount(0);
  });
});
