import type { Editor } from '../editor';
import { createMover } from '../canvas/transform';
import { isStructural, isSvgChild } from './kinds';
import { uniqueId } from './markers';
import { computed, inlineStyle, setStyle } from './style';

/** Element-level commands shared by the keyboard, the panel and the layers list. */

export function deleteSelected(editor: Editor): void {
  const els = editor.selectionRoots.filter((e) => !isStructural(e));
  if (!els.length) return;
  if (editor.live) {
    // The page's code would just draw it again, so hide it instead.
    editor.edit(els.length > 1 ? `Hide ${els.length} elements` : 'Hide', () => els.forEach((el) => setStyle(el, 'display', 'none')));
    editor.notify(els.length > 1 ? 'Hidden. On a page drawn by code, Delete hides things.' : 'Hidden. On a page drawn by code, Delete hides it.');
    return;
  }
  const next = els.length === 1 ? els[0].parentElement : null;
  editor.edit(els.length > 1 ? `Delete ${els.length} elements` : 'Delete', () => els.forEach((el) => el.remove()));
  editor.select(next && !isStructural(next) ? next : null);
}

export function duplicateSelected(editor: Editor): void {
  const els = editor.selectionRoots.filter((e) => !isStructural(e));
  if (!els.length) return;
  if (editor.live) {
    editor.notify("This page is drawn by code, which decides what's on it, so Tweakerr can't add copies.");
    return;
  }
  const copies: Element[] = [];
  editor.edit(els.length > 1 ? `Duplicate ${els.length} elements` : 'Duplicate', () => {
    for (const el of els) {
      const copy = el.cloneNode(true) as Element;
      // Keep ids unique so labels, anchors and markers still resolve.
      for (const node of [copy, ...Array.from(copy.querySelectorAll('[id]'))]) {
        if (node.id) node.id = uniqueId(el.ownerDocument, `${node.id}-copy`);
      }
      el.after(copy);
      // Floating things would land exactly on top of the original — offset them.
      const floating = isSvgChild(el) || ['absolute', 'fixed'].includes(computed(el, 'position'));
      if (floating) createMover(copy)?.move(16, 16);
      copies.push(copy);
    }
  });
  editor.setSelection(copies);
}

/** Hide the given element, or the selection; if any of them is hidden, show them all instead. */
export function toggleHidden(editor: Editor, el?: Element): void {
  const els = (el ? [el] : editor.selectionRoots).filter((e) => !isStructural(e));
  if (!els.length) return;
  const show = els.some((e) => inlineStyle(e, 'display') === 'none');
  editor.edit(show ? 'Show' : 'Hide', () => els.forEach((e) => setStyle(e, 'display', show ? '' : 'none')));
}

export function nudgeSelected(editor: Editor, dx: number, dy: number): void {
  const movers = editor.selectionRoots.filter((e) => !isStructural(e)).map(createMover);
  if (!movers.length || movers.some((m) => !m)) return;
  const key = editor.selection.map(elementKey).join('+');
  editor.edit('Nudge', () => movers.forEach((m) => m!.move(dx, dy)), `nudge:${key}`);
}

export function selectParent(editor: Editor): void {
  const p = editor.selected?.parentElement;
  if (p && p.localName !== 'html') editor.select(p);
}

/** Ctrl+A: everything next to the main selected element (its siblings). */
export function selectSiblings(editor: Editor): void {
  const el = editor.selected;
  const parent = el?.parentElement;
  if (!el || !parent || isStructural(el)) return;
  const skip = ['script', 'style', 'template', 'noscript', 'link', 'meta', 'defs'];
  const sibs = Array.from(parent.children).filter((c) => !skip.includes(c.localName) && c !== el);
  editor.setSelection([...sibs, el]);
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
