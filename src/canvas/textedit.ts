import type { Editor } from '../editor';
import { isTextEditable } from '../doc/kinds';
import type { Stage } from './stage';

const XHTML = 'http://www.w3.org/1999/xhtml';

/**
 * In-place text editing: double-click turns the element editable inside
 * the page. The whole typing session is one undo step. The temporary
 * `contenteditable` attribute is toggled outside the recorded transaction,
 * so it never reaches history or the saved file.
 */
export class TextEditor {
  active: HTMLElement | null = null;
  private previousAttr: string | null = null;
  private cleanup: (() => void) | null = null;

  constructor(
    private editor: Editor,
    private stage: Stage,
    /** Ctrl/Cmd shortcuts pressed while typing inside the page. */
    private onShortcut: (e: KeyboardEvent) => void,
  ) {
    editor.on('selection', () => {
      if (this.active && editor.selected !== this.active) this.commit();
    });
    editor.on('load', () => {
      this.active = null;
      this.cleanup = null;
    });
  }

  start(el: Element, clientX?: number, clientY?: number): boolean {
    const doc = this.editor.doc;
    // Check by namespace: `instanceof HTMLElement` fails across the iframe boundary.
    if (!doc || !this.editor.history || !isTextEditable(el) || el.namespaceURI !== XHTML) return false;
    this.commit();

    const html = el as HTMLElement;
    this.previousAttr = el.getAttribute('contenteditable');
    el.setAttribute('contenteditable', 'plaintext-only');
    this.editor.history.begin('Edit text');
    this.active = html;
    this.editor.select(el);
    this.editor.setBusy('text');

    html.focus({ preventScroll: true });
    this.placeCaret(html, clientX, clientY);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        this.commit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ['s', 'o'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        this.commit();
        this.onShortcut(e);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) this.commit();
    };
    const onBlur = () => this.commit();
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onDown, true);
    html.addEventListener('blur', onBlur);
    this.cleanup = () => {
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('pointerdown', onDown, true);
      html.removeEventListener('blur', onBlur);
    };
    return true;
  }

  commit(): void {
    const el = this.active;
    if (!el) return;
    this.active = null;
    this.cleanup?.();
    this.cleanup = null;
    this.editor.history?.end();
    if (this.previousAttr === null) el.removeAttribute('contenteditable');
    else el.setAttribute('contenteditable', this.previousAttr);
    el.ownerDocument.getSelection()?.removeAllRanges();
    // Hand the keyboard back to the editor, out of the page frame.
    el.blur();
    this.stage.canvas.focus({ preventScroll: true });
    this.editor.setBusy(null);
  }

  private placeCaret(el: HTMLElement, clientX?: number, clientY?: number): void {
    const doc = el.ownerDocument;
    const sel = doc.getSelection();
    if (!sel) return;
    let range: Range | null = null;
    if (clientX !== undefined && clientY !== undefined) {
      const p = this.stage.toDoc(clientX, clientY);
      range = doc.caretRangeFromPoint?.(p.x, p.y) ?? null;
      if (range && !el.contains(range.startContainer)) range = null;
    }
    if (!range) {
      range = doc.createRange();
      range.selectNodeContents(el);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
