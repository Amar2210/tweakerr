import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentsUI } from '../../src/canvas/comments';
import type { Stage } from '../../src/canvas/stage';
import { Editor } from '../../src/editor';
import { captureCommentTarget } from '../../src/doc/comment-targets';
import { readRevisionComments, writeRevisionComments, type RevisionComment } from '../../src/doc/comments';
import { writeChangeLog } from '../../src/doc/changelog';
import type { Box } from '../../src/util/geometry';

let frames: FrameRequestCallback[];
let removeListeners: () => void;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
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
const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
});
function setup(imported: (doc: Document) => RevisionComment[] = () => []) {
  document.body.innerHTML = '<aside><div id="history" tabindex="0"></div></aside><main id="canvas" tabindex="0"><div id="stage"><iframe></iframe></div></main><button id="outside">Other editor control</button>';
  const canvas = document.querySelector<HTMLElement>('#canvas')!;
  const stageNode = document.querySelector<HTMLElement>('#stage')!;
  const sidebar = document.querySelector<HTMLElement>('#history')!;
  const frame = document.querySelector('iframe')!;
  const doc = frame.contentDocument!;
  doc.body.innerHTML = '<button id="first">First card</button><button id="second">Second card</button>';
  const first = doc.querySelector<HTMLElement>('#first')!;
  const second = doc.querySelector<HTMLElement>('#second')!;
  const measure = (el: Element, box: DOMRect) => {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(box);
    vi.spyOn(el, 'getClientRects').mockReturnValue([box] as unknown as DOMRectList);
  };
  measure(canvas, rect(0, 50, 900, 600));
  measure(stageNode, rect(0, 50, 900, 600));
  measure(first, rect(60, 80, 200, 80));
  measure(second, rect(360, 80, 200, 80));
  for (const el of [canvas, stageNode, frame]) {
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 900 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 600 });
  }
  const editor = new Editor(frame);
  const stage = { canvas, stage: stageNode, zoom: 1, toStage: (box: Box) => box } as Stage;
  const ui = new CommentsUI(editor, stage, sidebar, () => {});
  editor.attach(doc, { name: 'comment-lifecycle.html', handle: null, source: doc.documentElement.outerHTML, trailingNewline: false, comments: imported(doc) });
  flush();
  const input = document.querySelector<HTMLTextAreaElement>('.comment-input')!;
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); flush(); };
  const draft = (value = '') => {
    editor.select(first); flush();
    document.querySelector<HTMLButtonElement>('.comment-add')!.click();
    if (value) type(value);
  };
  const exported = () => writeChangeLog(writeRevisionComments(doc.documentElement.outerHTML, editor.comments!.export()), editor.history!.changes);
  return { editor, ui, doc, first, second, sidebar, input, type, draft, exported };
}
function sparse(doc: Document): RevisionComment[] {
  return [
    { id: 'C2', status: 'resolved', text: 'Earlier completed request', resolution: 'Legacy summary', targets: [captureCommentTarget(doc.querySelector('#second')!, 'resolved-target')] },
    { id: 'C5', status: 'pending', text: 'Current request', targets: [captureCommentTarget(doc.querySelector('#first')!, 'pending-target')] },
  ];
}

describe('comment cancellation and persistent export', () => {
  it('discards a typed new comment with Escape instead of merely closing its editor', () => {
    const f = setup();
    f.draft('CANCELLED-DRAFT-TEXT');
    expect(f.editor.comments!.all).toHaveLength(1); // typing is still captured for ordinary Save
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flush();
    expect(f.editor.comments!.export()).toEqual([]);
    expect(f.exported()).not.toContain('CANCELLED-DRAFT-TEXT');
    expect(f.exported()).not.toContain('Tweakerr revision comments');
    expect(JSON.stringify(f.editor.history!.changes)).not.toContain('CANCELLED-DRAFT-TEXT');
    expect(document.querySelector<HTMLElement>('.comment-popover')!.hidden).toBe(true);
  });

  it('has an explicit new-comment Cancel action, including a clean empty draft', () => {
    const f = setup();
    f.draft();
    const cancel = document.querySelector<HTMLButtonElement>('.comment-cancel');
    expect(cancel).not.toBeNull();
    expect(cancel!.hidden).toBe(false);
    expect([...document.querySelectorAll('.comment-popover-buttons button')].map((button) => button.classList.contains('comment-save'))).toEqual([true, false]);
    cancel!.click(); flush();
    expect(f.editor.comments!.export()).toEqual([]);
    expect(f.editor.history!.dirty).toBe(false);
    f.draft('DISCARD-ME');
    cancel!.click(); flush();
    expect(f.editor.comments!.export()).toEqual([]);
    expect(f.exported()).not.toContain('DISCARD-ME');
    // Explicit discard remains recoverable in memory, not exported history.
    f.editor.undo(); flush();
    expect(f.editor.comments!.all[0].text).toBe('DISCARD-ME');
    f.editor.redo(); flush();
    expect(f.exported()).not.toContain('DISCARD-ME');
  });

  it('keeps normal outside-click autosave and never turns Escape on an existing note into deletion', () => {
    const f = setup();
    f.draft('Keep the request');
    document.querySelector('#outside')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    flush();
    const id = f.editor.comments!.all[0].id;
    expect(f.exported()).toContain('Keep the request');
    f.ui.open(id);
    expect(document.querySelector<HTMLButtonElement>('.comment-cancel')!.hidden).toBe(true);
    f.type('Edited existing request');
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flush();
    expect(f.editor.comments!.get(id)?.text).toBe('Edited existing request');
    expect(f.editor.comments!.all).toHaveLength(1);
  });

  it('includes active typing in a Save snapshot, and makes a later draft discard a new unsaved deletion', () => {
    const f = setup();
    f.draft('SAVED-WHILE-TYPING');
    const saved = f.exported();
    const checkpoint = f.editor.history!.checkpoint();
    f.editor.markSaved(checkpoint);
    expect(readRevisionComments(saved).comments[0].text).toBe('SAVED-WHILE-TYPING');
    expect(f.editor.dirty).toBe(false);
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flush();
    expect(f.editor.comments!.export()).toEqual([]);
    expect(f.editor.dirty).toBe(true);
    expect(f.exported()).not.toContain('SAVED-WHILE-TYPING');
    f.editor.undo(); flush();
    expect(f.editor.comments!.all[0].text).toBe('SAVED-WHILE-TYPING');
    expect(f.editor.dirty).toBe(false);
  });

  it('deletes a record entirely, retains resolved history, and does not serialize tombstones or deleted text', () => {
    const f = setup(sparse);
    f.ui.open('C5');
    document.querySelector<HTMLButtonElement>('.comment-popover .comment-delete')!.click(); flush();
    expect(f.editor.comments!.export().map((comment) => comment.id)).toEqual(['C2']);
    expect(f.exported()).not.toContain('Current request');
    expect(f.exported()).not.toContain('"id": "C5"');
    expect(f.exported()).not.toContain('"status": "deleted"');
    expect(f.editor.comments!.all[0].resolution).toBe('Legacy summary');
    expect(f.editor.history!.changes).toEqual([]);
    f.editor.undo(); flush();
    expect(f.editor.comments!.get('C5')?.text).toBe('Current request');
  });
});

describe('contiguous display numbers with stable metadata IDs', () => {
  it('numbers pending first and resolved next without rewriting imported IDs, keys or summaries', () => {
    const f = setup(sparse);
    const before = f.editor.comments!.export();
    expect(f.editor.comments!.displayNumber('C5')).toBe(1);
    expect(f.editor.comments!.displayNumber('C2')).toBe(2);
    expect(f.editor.comments!.displayNumber('missing')).toBeNull();
    expect([...f.sidebar.querySelectorAll('.comment-history-heading strong')].map((el) => el.textContent)).toEqual(['#1', '#2']);
    expect(f.sidebar.querySelector('[data-comment-id="C5"] strong')!.getAttribute('title')).toBe('Record ID: C5');
    expect(f.editor.comments!.export()).toEqual(before);
    expect(f.editor.dirty).toBe(false);
    expect(f.exported()).not.toContain('displayNumber');
  });

  it('refreshes shared marker, sidebar and popover labels after deletion/Undo without changing their record-bound actions', () => {
    const f = setup();
    const first = f.editor.comments!.add('Delete this first request', [f.first])!;
    const shared = f.editor.comments!.add('Shared surviving request', [f.first, f.second])!;
    flush();
    const markers = [...document.querySelectorAll<HTMLButtonElement>(`.comment-marker[data-comment-id="${shared.id}"]`)];
    expect(markers).toHaveLength(2);
    expect(markers.every((marker) => marker.querySelector('.comment-marker-id')!.textContent === '#2')).toBe(true);
    f.editor.comments!.delete(first.id); flush();
    expect(markers.every((marker) => marker.querySelector('.comment-marker-id')!.textContent === '#1')).toBe(true);
    expect(markers.every((marker) => marker.getAttribute('aria-label') === 'Open comment 1')).toBe(true);
    expect(f.sidebar.querySelector(`[data-comment-id="${shared.id}"] strong`)!.textContent).toBe('#1');
    markers[1].click();
    expect(document.querySelector('#comment-popover-title')!.textContent).toBe('Comment 1');
    f.type('Still the shared surviving request');
    expect(f.editor.comments!.get(shared.id)?.text).toBe('Still the shared surviving request');
    expect(f.editor.comments!.get(first.id)).toBeUndefined();
    f.editor.undo(); flush(); // edit
    f.editor.undo(); flush(); // delete
    expect(document.querySelector(`.comment-marker[data-comment-id="${shared.id}"]`)).toBe(markers[0]);
    expect(markers.every((marker) => marker.querySelector('.comment-marker-id')!.textContent === '#2')).toBe(true);
    expect(document.querySelector('#comment-popover-title')!.textContent).toBe('Comment 2');
    expect(f.editor.comments!.get(first.id)?.text).toBe('Delete this first request');
  });
});
