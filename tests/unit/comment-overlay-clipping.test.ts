import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentsUI } from '../../src/canvas/comments';
import type { Stage } from '../../src/canvas/stage';
import { Editor } from '../../src/editor';
import type { Box } from '../../src/util/geometry';

const rect = ({ left, top, width, height }: Box): DOMRect => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
});
const contains = (box: Box, x: number, y: number) => x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
function dimensions(el: Element, values: Record<string, number>): void {
  for (const [name, value] of Object.entries(values)) Object.defineProperty(el, name, { configurable: true, value });
}
function measure(el: Element, box: Box | (() => Box)): void {
  vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => rect(typeof box === 'function' ? box() : box));
  vi.spyOn(el, 'getClientRects').mockImplementation(() => [el.getBoundingClientRect()] as unknown as DOMRectList);
}
function placed(el: HTMLElement): Box {
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width) || 46, height: parseFloat(el.style.height) || 25 };
}
let frames: FrameRequestCallback[];
let removeListeners: () => void;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('.comment-add') ? 25 : this.matches('.comment-marker') ? 46 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('.comment-add, .comment-marker') ? 25 : 0; });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.matches('.comment-marker, .comment-add') ? [rect(placed(this))] : []) as unknown as DOMRectList;
  });
  const windowEvents = vi.spyOn(window, 'addEventListener');
  const documentEvents = vi.spyOn(document, 'addEventListener');
  removeListeners = () => {
    for (const [type, listener, options] of windowEvents.mock.calls) window.removeEventListener(type, listener, options);
    for (const [type, listener, options] of documentEvents.mock.calls) document.removeEventListener(type, listener, options);
  };
});
afterEach(() => {
  removeListeners();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function flush(): void {
  while (frames.length) {
    const batch = frames;
    frames = [];
    for (const callback of batch) callback(0);
  }
}
function setup(zoom = 1) {
  document.body.innerHTML = '<aside class="side left"><div id="history"></div></aside><main id="canvas" tabindex="0"><div id="stage"><iframe></iframe></div></main>';
  const canvas = document.querySelector<HTMLElement>('#canvas')!;
  const stageNode = document.querySelector<HTMLElement>('#stage')!;
  const frame = document.querySelector('iframe')!;
  const doc = frame.contentDocument!;
  doc.body.innerHTML = '<div id="viewport" style="overflow-x:auto;overflow-y:auto"><div id="board"><article id="card">Original card</article><aside id="sticky" style="position:sticky;background:rgb(20, 30, 40)"><h3>Sticky label</h3></aside><header id="header" style="position:sticky;background:rgb(40, 50, 60)">Sticky header</header></div></div>';
  const card = doc.querySelector<HTMLElement>('#card')!;
  const viewport = doc.querySelector<HTMLElement>('#viewport')!;
  const sticky = doc.querySelector<HTMLElement>('#sticky')!;
  const header = doc.querySelector<HTMLElement>('#header')!;
  let target: Box = { left: 120, top: 120, width: 260, height: 100 };
  let origin = { left: 100, top: 80 };
  let column: Box = { left: 40, top: 40, width: 60, height: 300 };
  let heading: Box = { left: 40, top: 40, width: 600, height: 40 };
  dimensions(viewport, { clientLeft: 2, clientTop: 2, clientWidth: 600, clientHeight: 300 });
  dimensions(frame, { clientWidth: 1000, clientHeight: 800 });
  dimensions(canvas, { clientLeft: 0, clientTop: 0, clientWidth: 800, clientHeight: 500 });
  measure(canvas, { left: 100, top: 80, width: 800, height: 500 });
  measure(document.querySelector('.side')!, { left: 0, top: 80, width: 100, height: 500 });
  measure(stageNode, () => ({ ...origin, width: 1000 * editor.zoom, height: 800 * editor.zoom }));
  measure(viewport, { left: 40, top: 40, width: 604, height: 304 });
  measure(card, () => target);
  measure(sticky, () => column);
  measure(header, () => heading);
  const hits = vi.fn((x: number, y: number) => [
    ...(contains(heading, x, y) ? [header] : []),
    ...(contains(column, x, y) ? [sticky.querySelector('h3')!, sticky] : []),
    ...(contains(target, x, y) ? [card] : []), viewport, doc.body, doc.documentElement,
  ]);
  Object.defineProperty(doc, 'elementsFromPoint', { configurable: true, value: hits });
  const editor = new Editor(frame);
  editor.zoom = zoom;
  Object.defineProperty(stageNode, 'clientWidth', { configurable: true, get: () => 1000 * editor.zoom });
  Object.defineProperty(stageNode, 'clientHeight', { configurable: true, get: () => 800 * editor.zoom });
  const stage = {
    canvas, stage: stageNode, get zoom() { return editor.zoom; },
    toStage: (box: Box) => ({ left: box.left * editor.zoom, top: box.top * editor.zoom, width: box.width * editor.zoom, height: box.height * editor.zoom }),
  } as Stage;
  const ui = new CommentsUI(editor, stage, document.querySelector('#history')!, () => {});
  editor.attach(doc, { name: 'clipping-unit.html', handle: null, source: doc.documentElement.outerHTML, trailingNewline: false });
  const note = editor.comments!.add('Review the actual card', [card])!;
  flush();
  return {
    editor, ui, stage, doc, card, viewport, sticky, header, note, hits,
    target: (box: Box) => { target = box; }, column: (box: Box) => { column = box; }, heading: (box: Box) => { heading = box; },
    origin: (left: number, top: number) => { origin = { left, top }; },
    border: () => document.querySelector<HTMLElement>('.comment-target-border'),
    marker: () => document.querySelector<HTMLButtonElement>('.comment-marker'),
    add: () => document.querySelector<HTMLButtonElement>('.comment-add')!,
  };
}

describe('comment overlay clipping (page coordinates, then stage coordinates)', () => {
  it('intersects nested overflow client boxes, including borders, and drops a target exactly on the clip edge', () => {
    const f = setup();
    f.target({ left: 10, top: 20, width: 150, height: 100 });
    f.sticky.style.background = 'transparent';
    f.header.style.background = 'transparent';
    f.ui.render();
    expect(placed(f.border()!)).toEqual({ left: 42, top: 42, width: 118, height: 78 });
    expect(f.border()!.style.clipPath).not.toBe(''); // outline-offset must not escape the clip
    f.target({ left: -108, top: 70, width: 150, height: 100 });
    f.editor.select(f.card);
    f.ui.render();
    expect(f.border()).toBeNull();
    expect(f.marker()).toBeNull();
    expect(f.add().hidden).toBe(true);
    expect(f.editor.comments!.get('C1')).toEqual(f.note);
  });

  it('subtracts an opaque sticky column using iframe-only hit tests, scales once, and never clamps its marker over the column', () => {
    const f = setup(0.86);
    f.column({ left: 40, top: 40, width: 230, height: 300 });
    f.target({ left: 100, top: 120, width: 190, height: 100 });
    f.editor.select(f.card);
    f.hits.mockClear();
    f.ui.render();
    const box = placed(f.border()!);
    expect(box.left).toBeCloseTo(270 * 0.86);
    expect(box.width).toBeCloseTo(20 * 0.86);
    expect(box.top).toBeCloseTo(120 * 0.86);
    expect(placed(f.marker()!).left).toBeGreaterThanOrEqual(270 * 0.86);
    expect(placed(f.add()).left).toBeGreaterThanOrEqual(270 * 0.86);
    expect(f.hits.mock.calls.length).toBeLessThanOrEqual(27); // 9 target probes + 9 per overflowing control footprint
    expect(f.hits.mock.calls.length).toBeGreaterThan(0);
    expect(f.marker()!.getAttribute('aria-label')).toBe('Open comment 1');
    expect(f.editor.selected).toBe(f.card);
  });

  it('shares target probes across selection and multiple notes, and checks wider controls beside a sticky column', () => {
    const f = setup();
    f.editor.comments!.add('Another request on the same target', [f.card]);
    f.editor.select(f.card);
    f.editor.setBusy('text'); // no transient Add footprint to measure
    f.hits.mockClear();
    f.ui.render();
    expect(f.hits).toHaveBeenCalledTimes(9);
    f.editor.setBusy(null);
    f.column({ left: 40, top: 40, width: 60, height: 300 });
    f.target({ left: 105, top: 120, width: 12, height: 10 }); // itself fully visible, but narrower than a marker
    f.ui.render();
    expect(placed(f.border()!).left).toBe(105);
    for (const marker of document.querySelectorAll<HTMLButtonElement>('.comment-marker')) {
      expect(marker.hidden).toBe(false);
      expect(placed(marker).left).toBeGreaterThanOrEqual(100);
    }
  });

  it('hides fully obscured targets without deleting notes, and clips a partially obscured sticky header', () => {
    const f = setup(1.25);
    f.column({ left: 40, top: 40, width: 230, height: 300 });
    f.target({ left: 80, top: 120, width: 120, height: 100 });
    f.editor.select(f.card);
    f.ui.render();
    expect(f.border()).toBeNull();
    expect(f.marker()).toBeNull();
    expect(f.add().hidden).toBe(true);
    expect(f.editor.comments!.targets(f.note)).toEqual([f.card]);
    f.target({ left: 300, top: 60, width: 120, height: 80 });
    f.ui.render();
    expect(placed(f.border()!)).toEqual({ left: 375, top: 100, width: 150, height: 75 });
    expect(placed(f.marker()!).top).toBeGreaterThanOrEqual(100);
    f.target({ left: 300, top: 45, width: 120, height: 30 });
    f.ui.render();
    expect(f.marker()).toBeNull();
  });

  it('does not mistake transparent surfaces, a target child, or a sticky sibling behind the target for occlusion', () => {
    const f = setup();
    f.column({ left: 40, top: 40, width: 500, height: 300 });
    f.sticky.style.background = 'transparent';
    f.ui.render();
    expect(placed(f.border()!).width).toBe(260);
    f.sticky.style.background = 'rgb(20, 30, 40)';
    f.hits.mockImplementation(() => [f.card, f.sticky, f.viewport]);
    f.ui.render();
    expect(placed(f.border()!).width).toBe(260);
    f.card.append(f.sticky);
    f.hits.mockImplementation(() => [f.sticky, f.card, f.viewport]);
    f.ui.render();
    expect(placed(f.border()!).width).toBe(260);
  });

  it('clips to the scrolled outer canvas and overlaid editor sidebar rather than pinning markers to stage zero', () => {
    const f = setup();
    f.origin(-100, 20);
    f.target({ left: 120, top: 80, width: 260, height: 100 });
    f.ui.render();
    expect(placed(f.border()!)).toEqual({ left: 200, top: 80, width: 180, height: 100 });
    expect(placed(f.marker()!).left).toBeGreaterThanOrEqual(200);
    measure(document.querySelector('.side')!, { left: 100, top: 80, width: 240, height: 500 });
    f.ui.render();
    expect(f.marker()).toBeNull(); // card is wholly underneath the expanded sidebar
    f.target({ left: 300, top: 80, width: 260, height: 100 });
    f.ui.render();
    expect(placed(f.border()!).left).toBe(440);
    expect(placed(f.marker()!).left).toBeGreaterThanOrEqual(440);
  });

  it('follows captured native scroll and live redraw while retaining the marker node and true target', () => {
    const f = setup(0.86);
    const marker = f.marker()!;
    const before = placed(marker);
    f.target({ left: 150, top: 140, width: 260, height: 100 });
    f.viewport.dispatchEvent(new f.doc.defaultView!.Event('scroll'));
    f.viewport.dispatchEvent(new f.doc.defaultView!.Event('scroll'));
    expect(frames).toHaveLength(1);
    flush();
    expect(f.marker()).toBe(marker);
    expect(placed(marker).left - before.left).toBeCloseTo(30 * 0.86);
    expect(placed(marker).top - before.top).toBeCloseTo(20 * 0.86);
    const replacement = f.card.cloneNode(true) as HTMLElement;
    f.card.replaceWith(replacement);
    measure(replacement, { left: 180, top: 160, width: 260, height: 100 });
    f.editor.emit('redraw');
    flush();
    expect(f.marker()).toBe(marker);
    expect(f.editor.comments!.targets(f.note)).toEqual([replacement]);
    expect(placed(marker).top).toBeCloseTo(160 * 0.86 + 3);
  });

  it('retains deterministic collision packing for six notes on a tiny target through zoom and scroll', () => {
    const f = setup();
    f.target({ left: 45, top: 100, width: 12, height: 10 });
    f.sticky.style.background = 'transparent';
    for (let i = 2; i <= 6; i++) f.editor.comments!.add(`Request ${i}`, [f.card]);
    for (const zoom of [1, 0.86, 1.25]) {
      f.editor.zoom = zoom;
      f.editor.emit('layout');
      f.viewport.dispatchEvent(new f.doc.defaultView!.Event('scroll'));
      flush();
      const markers = [...document.querySelectorAll<HTMLButtonElement>('.comment-marker')];
      expect(markers).toHaveLength(6);
      for (const [index, marker] of markers.entries()) {
        expect(marker.hidden).toBe(false);
        expect(marker.dataset.commentId).toBe(`C${index + 1}`);
        for (const earlier of markers.slice(0, index)) expect(overlaps(placed(marker), placed(earlier))).toBe(false);
      }
    }
  });

  it('keeps shared IDs, keyboard opening, textarea focus and Escape restoration on the stable marker', () => {
    const f = setup();
    const second = f.doc.createElement('article');
    second.id = 'second';
    second.textContent = 'Second card';
    f.viewport.append(second);
    measure(second, { left: 430, top: 120, width: 180, height: 100 });
    f.editor.comments!.delete(f.note.id);
    const shared = f.editor.comments!.add('Shared request', [f.card, second])!;
    flush();
    const markers = [...document.querySelectorAll<HTMLButtonElement>('.comment-marker')];
    expect(markers).toHaveLength(2);
    expect(markers.every(marker => marker.dataset.commentId === shared.id)).toBe(true);
    const marker = markers[0];
    marker.focus();
    marker.click(); // native button keyboard activation reaches the same click handler
    const input = document.querySelector<HTMLTextAreaElement>('.comment-input')!;
    expect(document.activeElement).toBe(input);
    input.value = 'Updated shared request';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    expect(document.activeElement).toBe(input);
    expect(document.querySelector('.comment-marker')).toBe(marker);
    expect(markers.every(node => node.getAttribute('aria-expanded') === 'true')).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flush();
    expect(document.activeElement).toBe(marker);
    expect(f.editor.comments!.get(shared.id)!.targets).toHaveLength(2);
    expect(f.editor.history!.changes).toEqual([]);
    expect(f.doc.querySelector('.comment-marker, .comment-target-border, .comment-popover')).toBeNull();
  });
});
