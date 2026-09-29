import { History } from './doc/history';

export type Device = 'desktop' | 'tablet' | 'phone';
export const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 768, phone: 390 };
export const DEVICE_HEIGHT: Record<Device, number> = { desktop: 800, tablet: 1024, phone: 844 };

export interface OpenFile {
  name: string;
  handle: FileSystemFileHandle | null;
  trailingNewline: boolean;
}

type EventName =
  | 'load' // a new document was mounted
  | 'selection' // selected element changed
  | 'hover' // hovered element changed
  | 'change' // the document was edited, undone or redone
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

  selected: Element | null = null;
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
  attach(doc: Document, file: OpenFile): void {
    this.doc = doc;
    this.file = file;
    this.selected = null;
    this.hovered = null;
    this.history = new History(doc, () => {
      this.pruneSelection();
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

  select(el: Element | null): void {
    if (el && this.doc && !this.doc.contains(el)) el = null;
    if (el === this.selected) return;
    this.selected = el;
    this.emit('selection');
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
    this.history?.undo();
  }

  redo(): void {
    this.history?.redo();
  }

  markSaved(): void {
    this.history?.markSaved();
    this.emit('file');
  }

  /** Drop selection/hover that point at nodes an undo just removed. */
  private pruneSelection(): void {
    if (!this.doc) return;
    if (this.selected && !this.doc.contains(this.selected)) {
      this.selected = null;
      this.emit('selection');
    }
    if (this.hovered && !this.doc.contains(this.hovered)) this.hovered = null;
  }
}
