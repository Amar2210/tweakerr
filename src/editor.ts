import { History } from './doc/history';
import { isStructural } from './doc/kinds';
import type { LiveEdits } from './doc/live';

export type Device = 'desktop' | 'tablet' | 'phone';
export const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 768, phone: 390 };
export const DEVICE_HEIGHT: Record<Device, number> = { desktop: 800, tablet: 1024, phone: 844 };

export interface OpenFile {
  name: string;
  handle: FileSystemFileHandle | null;
  trailingNewline: boolean;
  /** The file's text as opened. */
  source: string;
}

type EventName =
  | 'load' // a new document was mounted
  | 'selection' // selection changed
  | 'hover' // hovered element changed
  | 'change' // the document was edited, undone or redone
  | 'edited' // the user's edit, undo or redo (not the page redrawing itself)
  | 'redraw' // a live page's own code redrew part of it
  | 'layout' // page size, zoom or device width changed
  | 'file' // file name / handle / dirty flag changed
  | 'interaction'; // a drag/resize/text edit started or stopped

/**
 * Central editor state. UI modules read from it and subscribe to its
 * events; all edits to the page go through `edit()` so they are undoable.
 */
export class Editor {
  doc: Document | null = null;
  history: History | null = null;
  file: OpenFile | null = null;
  /** Set when the page draws itself with scripts: edits are saved as style rules (see doc/live.ts). */
  live: LiveEdits | null = null;
  /** Shows a short message to the user (main.ts wires it to a toast). */
  notify: (message: string) => void = () => {};

  /** Everything selected, in the order it was picked. Never contains html/head/body alongside others. */
  selection: Element[] = [];
  hovered: Element | null = null;

  zoom = 1;
  fit = true;
  device: Device = 'desktop';

  /** True while a drag, resize or text edit is in progress. */
  busy: 'drag' | 'resize' | 'text' | null = null;

  private listeners = new Map<EventName, Set<() => void>>();

  constructor(readonly frame: HTMLIFrameElement) {}

  on(ev: EventName, fn: () => void): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(ev: EventName): void {
    for (const fn of this.listeners.get(ev) ?? []) fn();
  }

  get win(): Window | null {
    return this.doc?.defaultView ?? null;
  }

  get dirty(): boolean {
    return !!this.history?.dirty;
  }

  /** Called by the loader once the iframe document is ready. */
  attach(doc: Document, file: OpenFile, live: LiveEdits | null = null): void {
    this.doc = doc;
    this.file = file;
    this.live = live;
    this.selection = [];
    this.hovered = null;
    this.history = new History(doc, () => {
      this.pruneSelection();
      this.emit('edited');
      this.emit('change');
      this.emit('file');
    });
    this.emit('load');
    this.emit('selection');
    this.emit('file');
  }

  /** Make an undoable change to the page. */
  edit(label: string, fn: () => void, mergeKey?: string): void {
    if (!this.history) return;
    this.history.transact(label, fn, mergeKey);
  }

  /** The main selected element (the last one picked): the panel shows its values. */
  get selected(): Element | null {
    return this.selection[this.selection.length - 1] ?? null;
  }

  get multi(): boolean {
    return this.selection.length > 1;
  }

  isSelected(el: Element): boolean {
    return this.selection.includes(el);
  }

  /** Select just this element (or nothing). */
  select(el: Element | null): void {
    this.setSelection(el ? [el] : []);
  }

  /**
   * Replace the selection. The last element becomes the main one.
   * Page-level elements (html/head/body) can only be selected on their own.
   */
  setSelection(els: Element[]): void {
    let next = [...new Set(els)].filter((e) => this.doc?.contains(e));
    if (next.length > 1) next = next.filter((e) => !isStructural(e));
    if (next.length === this.selection.length && next.every((e, i) => e === this.selection[i])) return;
    this.selection = next;
    this.emit('selection');
  }

  /** Shift/Ctrl+click: add the element, or take it out if it's already selected. */
  toggle(el: Element): void {
    if (isStructural(el)) return;
    if (this.isSelected(el)) this.setSelection(this.selection.filter((e) => e !== el));
    else this.setSelection([...this.selection.filter((e) => !isStructural(e)), el]);
  }

  /**
   * The selection without elements that sit inside another selected one,
   * so moving or deleting a card and its heading together acts once.
   */
  get selectionRoots(): Element[] {
    return this.selection.filter((e) => !this.selection.some((o) => o !== e && o.contains(e)));
  }

  hover(el: Element | null): void {
    if (el === this.hovered) return;
    this.hovered = el;
    this.emit('hover');
  }

  setBusy(state: Editor['busy']): void {
    this.busy = state;
    this.emit('interaction');
  }

  undo(): void {
    if (this.live) this.live.movedThings = true;
    this.history?.undo();
  }

  redo(): void {
    if (this.live) this.live.movedThings = true;
    this.history?.redo();
  }

  markSaved(): void {
    this.history?.markSaved();
    this.emit('file');
  }

  /**
   * Drop selected/hovered nodes that an undo just removed. On a live page,
   * follow ones its code redrew instead (an edit can land before the page
   * watcher has caught up with the redraw).
   */
  private pruneSelection(): void {
    if (!this.doc) return;
    const live = this.live;
    const kept = this.selection
      .map((e) => (live ? live.relocate(e) : this.doc!.contains(e) ? e : null))
      .filter((e): e is Element => !!e);
    if (kept.length !== this.selection.length || kept.some((e, i) => e !== this.selection[i])) {
      this.selection = kept;
      this.emit('selection');
    }
    if (this.hovered && !this.doc.contains(this.hovered)) this.hovered = null;
  }
}
