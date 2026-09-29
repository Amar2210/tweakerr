/**
 * Undo/redo built on MutationObserver.
 *
 * Every edit runs inside a transaction. While it runs, a MutationObserver
 * records each DOM change (attribute, text, added/removed nodes). Undo
 * replays those records backwards; redo replays them forwards. Because the
 * records hold the real nodes, element identity survives any number of
 * undo/redo round trips, so every kind of edit gets undo for free.
 */

interface Rec {
  type: MutationRecordType;
  target: Node;
  attributeName: string | null;
  attributeNamespace: string | null;
  /** Value before the mutation. */
  oldValue: string | null;
  /** Value after the mutation; captured when the record is first undone. */
  newValue: string | null;
  addedNodes: Node[];
  removedNodes: Node[];
  nextSibling: Node | null;
}

export interface Entry {
  label: string;
  recs: Rec[];
  mergeKey?: string;
  time: number;
}

const OBSERVE: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeOldValue: true,
  characterData: true,
  characterDataOldValue: true,
};

/** Consecutive edits with the same merge key inside this window become one undo step. */
const MERGE_WINDOW_MS = 1200;

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private observer: MutationObserver | null = null;
  /** Records the browser already delivered to the observer mid-transaction. */
  private delivered: Rec[] = [];
  private open: { label: string; mergeKey?: string } | null = null;
  private depth = 0;
  private savedAt: Entry | null = null;
  private now: () => number;

  constructor(
    private root: Node,
    private onChange: () => void = () => {},
    now?: () => number,
  ) {
    this.now = now ?? (() => Date.now());
  }

  /** Run `fn` and record everything it changes as one undo step. */
  transact(label: string, fn: () => void, mergeKey?: string): void {
    this.begin(label, mergeKey);
    try {
      fn();
    } finally {
      this.end();
    }
  }

  /** Start a long-running transaction (e.g. a drag or a text edit). Nests safely. */
  begin(label: string, mergeKey?: string): void {
    this.depth++;
    if (this.depth > 1) return;
    this.open = { label, mergeKey };
    // Long transactions (typing, dragging) span many tasks, and the browser
    // hands queued records to this callback between them; keep them, since
    // takeRecords() at the end only returns the ones not yet delivered.
    this.delivered = [];
    this.observer = new MutationObserver((recs) => this.delivered.push(...recs.map(copyRecord)));
    this.observer.observe(this.root, OBSERVE);
  }

  end(): void {
    if (this.depth === 0) return;
    this.depth--;
    if (this.depth > 0 || !this.observer || !this.open) return;
    const recs = [...this.delivered, ...this.observer.takeRecords().map(copyRecord)];
    this.delivered = [];
    this.observer.disconnect();
    this.observer = null;
    const { label, mergeKey } = this.open;
    this.open = null;
    if (recs.length === 0) return;

    const time = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      mergeKey &&
      top &&
      top.mergeKey === mergeKey &&
      time - top.time < MERGE_WINDOW_MS &&
      top !== this.savedAt
    ) {
      top.recs.push(...recs);
      top.time = time;
    } else {
      this.undoStack.push({ label, recs, mergeKey, time });
    }
    this.redoStack = [];
    this.onChange();
  }

  get inTransaction(): boolean {
    return this.depth > 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  peekUndo(): Entry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  peekRedo(): Entry | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }

  undo(): boolean {
    if (this.depth > 0) return false;
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (let i = entry.recs.length - 1; i >= 0; i--) revert(entry.recs[i]);
    this.redoStack.push(entry);
    this.onChange();
    return true;
  }

  redo(): boolean {
    if (this.depth > 0) return false;
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const rec of entry.recs) reapply(rec);
    this.undoStack.push(entry);
    this.onChange();
    return true;
  }

  /** Remember the current state as "saved" so `dirty` can be computed. */
  markSaved(): void {
    this.savedAt = this.peekUndo() ?? null;
  }

  get dirty(): boolean {
    return (this.peekUndo() ?? null) !== this.savedAt;
  }
}

function copyRecord(m: MutationRecord): Rec {
  return {
    type: m.type,
    target: m.target,
    attributeName: m.attributeName,
    attributeNamespace: m.attributeNamespace,
    oldValue: m.oldValue,
    newValue: null,
    addedNodes: Array.from(m.addedNodes),
    removedNodes: Array.from(m.removedNodes),
    nextSibling: m.nextSibling,
  };
}

function revert(r: Rec): void {
  switch (r.type) {
    case 'attributes': {
      const el = r.target as Element;
      r.newValue = readAttr(el, r);
      writeAttr(el, r, r.oldValue);
      break;
    }
    case 'characterData': {
      const node = r.target as CharacterData;
      r.newValue = node.data;
      node.data = r.oldValue ?? '';
      break;
    }
    case 'childList': {
      for (let i = r.addedNodes.length - 1; i >= 0; i--) {
        const n = r.addedNodes[i];
        if (n.parentNode === r.target) r.target.removeChild(n);
      }
      insertAll(r.target, r.removedNodes, r.nextSibling);
      break;
    }
  }
}

function reapply(r: Rec): void {
  switch (r.type) {
    case 'attributes':
      writeAttr(r.target as Element, r, r.newValue);
      break;
    case 'characterData':
      (r.target as CharacterData).data = r.newValue ?? '';
      break;
    case 'childList': {
      for (const n of r.removedNodes) {
        if (n.parentNode === r.target) r.target.removeChild(n);
      }
      insertAll(r.target, r.addedNodes, r.nextSibling);
      break;
    }
  }
}

function insertAll(parent: Node, nodes: Node[], before: Node | null): void {
  const ref = before && before.parentNode === parent ? before : null;
  for (const n of nodes) parent.insertBefore(n, ref);
}

function readAttr(el: Element, r: Rec): string | null {
  return r.attributeNamespace
    ? el.getAttributeNS(r.attributeNamespace, r.attributeName!)
    : el.getAttribute(r.attributeName!);
}

function writeAttr(el: Element, r: Rec, value: string | null): void {
  const name = r.attributeName!;
  const ns = r.attributeNamespace;
  if (value === null) {
    if (ns) el.removeAttributeNS(ns, name);
    else el.removeAttribute(name);
    return;
  }
  if (ns) {
    // Keep the original prefix (e.g. xlink:href) when the attribute already exists.
    const existing = el.getAttributeNodeNS(ns, name);
    el.setAttributeNS(ns, existing?.name ?? name, value);
  } else {
    el.setAttribute(name, value);
  }
}
