import type { Editor } from '../editor';
import { createMover } from '../canvas/transform';
import { isStructural, isSvgChild } from './kinds';
import { uniqueId } from './markers';
import { computed, inlineStyle, setStyle } from './style';

/** Element-level commands shared by the keyboard, the panel and the layers list. */

export function deleteSelected(editor: Editor): void {
  const el = editor.selected;
  if (!el || isStructural(el)) return;
  const next = el.parentElement;
  editor.edit('Delete', () => el.remove());
  editor.select(next && !isStructural(next) ? next : null);
}

export function duplicateSelected(editor: Editor): void {
  const el = editor.selected;
  if (!el || isStructural(el)) return;
  let copy: Element | null = null;
  editor.edit('Duplicate', () => {
    copy = el.cloneNode(true) as Element;
    // Keep ids unique so labels, anchors and markers still resolve.
    for (const node of [copy, ...Array.from(copy.querySelectorAll('[id]'))]) {
      if (node.id) node.id = uniqueId(el.ownerDocument, `${node.id}-copy`);
    }
    el.after(copy);
    // Floating things would land exactly on top of the original — offset them.
    const floating = isSvgChild(el) || ['absolute', 'fixed'].includes(computed(el, 'position'));
    if (floating) createMover(copy)?.move(16, 16);
  });
  if (copy) editor.select(copy);
}

export function toggleHidden(editor: Editor, el: Element | null = editor.selected): void {
  if (!el || isStructural(el)) return;
  const hidden = inlineStyle(el, 'display') === 'none';
  editor.edit(hidden ? 'Show' : 'Hide', () => setStyle(el, 'display', hidden ? '' : 'none'));
}

export function nudgeSelected(editor: Editor, dx: number, dy: number): void {
  const el = editor.selected;
  if (!el) return;
  const mover = createMover(el);
  if (!mover) return;
  editor.edit('Nudge', () => mover.move(dx, dy), `nudge:${elementKey(el)}`);
}

export function selectParent(editor: Editor): void {
  const p = editor.selected?.parentElement;
  if (p && p.localName !== 'html') editor.select(p);
}

export function selectFirstChild(editor: Editor): void {
  const c = editor.selected?.firstElementChild;
  if (c) editor.select(c);
}

const keys = new WeakMap<Element, number>();
let nextKey = 1;
/** A stable per-element id used to merge repeated edits into one undo step. */
export function elementKey(el: Element): number {
  let k = keys.get(el);
  if (!k) keys.set(el, (k = nextKey++));
  return k;
}
