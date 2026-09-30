/**
 * Telling live pages apart, and keeping the editor in step with them.
 * A live page is one whose scripts draw it (see doc/live.ts).
 */
import type { Editor } from '../editor';
import type { LiveEdits } from '../doc/live';
import { isTypingTarget } from '../util/dom';

const JS_TYPES = ['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript'];

export interface PageScripts {
  /** The page as written, before any script ran. */
  written: Document;
  /** Scripts that would run. */
  count: number;
  /** Script files next to the page ("app.js"), which a frame can't load. */
  local: string[];
}

export function pageScripts(html: string): PageScripts {
  const written = new DOMParser().parseFromString(html, 'text/html');
  const local: string[] = [];
  let count = 0;
  for (const s of Array.from(written.querySelectorAll('script'))) {
    if (!JS_TYPES.includes((s.getAttribute('type') ?? '').trim().toLowerCase())) continue;
    const src = s.getAttribute('src');
    if (src) {
      count++;
      if (!/^(https?:|\/\/|data:|blob:)/i.test(src.trim())) local.push(src.trim());
    } else if ((s.textContent ?? '').trim()) count++;
  }
  return { written, count, local };
}

function measure(doc: Document): { elements: number; text: number; styled: number } {
  const body = doc.body;
  if (!body) return { elements: 0, text: 0, styled: 0 };
  const all = Array.from(body.getElementsByTagName('*'));
  return {
    elements: all.length,
    text: (body.textContent ?? '').replace(/\s+/g, ' ').length,
    styled: all.filter((e) => e.hasAttribute('style')).length,
  };
}

/**
 * Did the scripts draw a real part of the page? A script that only sets a
 * title doesn't count: that page keeps full editing with scripts off.
 */
export function drawsItself(written: Document, ran: Document): boolean {
  const a = measure(written);
  const b = measure(ran);
  return b.elements - a.elements >= 5 || b.text - a.text >= 40 || b.styled - a.styled >= 5;
}

/** Wait until the page stops changing (its scripts finished drawing), at most `max` ms. */
export function settle(doc: Document, quiet = 300, max = 3000): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(cap);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(done, quiet);
    });
    observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = window.setTimeout(done, quiet);
    const cap = window.setTimeout(done, max);
  });
}

/**
 * While a live page is open:
 *  - when its code redraws, find the selected items again (by their rule
 *    selector) and show changed words again;
 *  - after a change that moves or resizes things, fire a `resize` event so
 *    code that draws connectors from box positions redraws them.
 * Returns a function that stops watching.
 */
export function watchPage(editor: Editor, live: LiveEdits): () => void {
  const doc = live.doc;
  const win = doc.defaultView;
  let redrawn = 0;
  let resize = 0;

  const remember = () => editor.selection.forEach((e) => live.selectorFor(e));
  const offSelection = editor.on('selection', remember);

  const observer = new MutationObserver(() => {
    if (editor.history?.inTransaction) return;
    clearTimeout(redrawn);
    redrawn = window.setTimeout(afterRedraw, 120);
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  function afterRedraw(): void {
    if (editor.history?.inTransaction) return;
    live.reapplySwaps();
    const next: Element[] = [];
    for (const e of editor.selection) {
      const found = doc.contains(e) ? e : live.find(live.selectorFor(e));
      if (found) next.push(found);
    }
    editor.setSelection(next);
    if (editor.hovered && !doc.contains(editor.hovered)) editor.hover(null);
    editor.emit('change');
  }

  const offEdited = editor.on('edited', () => {
    if (!live.movedThings) return;
    live.movedThings = false;
    clearTimeout(resize);
    resize = window.setTimeout(fireResize, 200);
  });

  function fireResize(): void {
    // Not while the user is typing in the panel: a redraw would rebuild it under them.
    const active = document.activeElement;
    if (editor.busy || (isTypingTarget(active) && active?.closest('#props'))) {
      resize = window.setTimeout(fireResize, 400);
      return;
    }
    if (win) win.dispatchEvent(new win.Event('resize'));
  }

  return () => {
    observer.disconnect();
    offSelection();
    offEdited();
    clearTimeout(redrawn);
    clearTimeout(resize);
  };
}
