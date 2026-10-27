import type { History } from './history';
import { captureCommentTarget, matchCommentTarget, validCommentTarget, type CommentTarget } from './comment-targets';

export interface RevisionComment {
  id: string;
  status: 'pending' | 'resolved';
  text: string;
  targets: CommentTarget[];
  resolution?: string;
}

const HEADER = '<!-- Tweakerr revision comments v1\n';
const INSTRUCTIONS = 'Apply pending requests only. They override conflicting change-log entries, not unrelated edits. Maintain target references when moving or replacing elements. Mark only fully completed requests resolved, with an optional resolution summary. Preserve resolved records and original target labels even after target removal. Leave ambiguous or incomplete requests pending. Return the complete revised HTML. Tweakerr displays completion claims; it does not verify them.';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Only valid, recognized leading metadata is removed from the editable source. */
export function readRevisionComments(source: string): { source: string; comments: RevisionComment[] } {
  const block = /^<!-- Tweakerr revision comments v1\r?\n([\s\S]*?)\r?\n-->\r?\n/.exec(source);
  if (block) {
    try {
      const data = JSON.parse(block[1]);
      if (data?.version === 1 && Array.isArray(data.comments) && data.comments.every(validComment)) {
        const ids = data.comments.map((comment: RevisionComment) => comment.id);
        const keys = data.comments.flatMap((comment: RevisionComment) => comment.targets.map((target) => target.key));
        if (new Set(ids).size === ids.length && new Set(keys).size === keys.length) {
          return { source: source.slice(block[0].length), comments: data.comments };
        }
      }
    } catch { /* Malformed/unknown comments remain ordinary file content. */ }
  }
  return { source, comments: [] };
}

function validComment(value: unknown): value is RevisionComment {
  if (!value || typeof value !== 'object') return false;
  const c = value as RevisionComment;
  return typeof c.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(c.id)
    && ['pending', 'resolved'].includes(c.status) && typeof c.text === 'string'
    && (c.resolution === undefined || typeof c.resolution === 'string')
    && Array.isArray(c.targets) && c.targets.length > 0 && c.targets.every(validCommentTarget);
}

/** Safe readable JSON, outside the page DOM and independent of the edit journal. */
export function writeRevisionComments(source: string, comments: readonly RevisionComment[]): string {
  const clean = readRevisionComments(source).source;
  if (!comments.length) return clean;
  const json = JSON.stringify({ version: 1, instructions: INSTRUCTIONS, comments }, null, 2)
    .replace(/</g, '\\u003c').replace(/--/g, '\\u002d\\u002d');
  return HEADER + json + '\n-->\n' + clean;
}

/**
 * Editor-owned sidecar state: never inserted in the page's DOM. Runtime element
 * references survive ordinary moves; serializable references survive reopening.
 */
export class RevisionComments {
  private items: RevisionComment[];
  private nextId = 1;
  private bindings = new Map<string, Element>();
  private latest = new Map<string, CommentTarget>();

  constructor(readonly doc: Document, private history: History, comments: readonly RevisionComment[] = []) {
    this.items = clone([...comments]);
    for (const comment of comments) {
      const number = /^C(\d+)$/.exec(comment.id);
      const value = number ? Number(number[1]) : 0;
      if (Number.isSafeInteger(value) && value < 1_000_000) this.nextId = Math.max(this.nextId, value + 1);
    }
  }

  get all(): readonly RevisionComment[] { return this.items; }

  get(id: string): RevisionComment | undefined { return this.items.find((comment) => comment.id === id); }

  /** Capture draft references immediately, before a live redraw can replace them. */
  prepareTargets(elements: readonly Element[]): CommentTarget[] {
    return [...new Set(elements)].filter((el) => this.doc.contains(el)).map((el) => {
      const key = globalThis.crypto?.randomUUID?.() ?? `target-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const target = captureCommentTarget(el, key);
      this.bindings.set(key, el);
      this.latest.set(key, target);
      return target;
    });
  }

  add(text: string, elements: readonly Element[], mergeKey?: string): RevisionComment | null {
    return this.addPrepared(text, this.prepareTargets(elements), mergeKey);
  }

  /** A draft whose target disappeared is still a real, recoverable pending note. */
  addPrepared(text: string, targets: readonly CommentTarget[], mergeKey?: string): RevisionComment | null {
    if (!text.trim() || !targets.length) return null;
    while (this.get(`C${this.nextId}`)) this.nextId++;
    const comment: RevisionComment = { id: `C${this.nextId++}`, status: 'pending', text, targets: clone([...targets]) };
    this.change('Add comment', [...this.items, comment], mergeKey);
    return this.get(comment.id)!;
  }

  update(id: string, text: string, mergeKey?: string): void {
    const comment = this.get(id);
    if (!comment || comment.status !== 'pending' || comment.text === text) return;
    this.change('Edit comment', this.items.map((entry) => entry.id === id ? { ...entry, text } : entry), mergeKey);
  }

  delete(id: string, mergeKey?: string): void {
    if (!this.get(id)) return;
    this.change('Delete comment', this.items.filter((comment) => comment.id !== id), mergeKey);
  }

  /** Match without updating bindings or exportable references (sidebar/navigation). */
  findTarget(target: CommentTarget): Element | null {
    const bound = this.bindings.get(target.key);
    return bound && this.doc.contains(bound) ? bound : matchCommentTarget(this.doc, this.latest.get(target.key) ?? target);
  }

  /** Pending markers/edits also refresh the latest serializable references. */
  targets(comment: RevisionComment): (Element | null)[] {
    return comment.targets.map((target) => this.target(target));
  }

  target(target: CommentTarget): Element | null {
    const found = this.findTarget(target);
    if (found) {
      this.bindings.set(target.key, found);
      this.latest.set(target.key, captureCommentTarget(found, target.key, target.label));
    }
    return found;
  }

  /** Capture in-place text/attribute edits before a live page redraw replaces nodes. */
  refresh(): void {
    for (const comment of this.items) if (comment.status === 'pending') this.targets(comment);
  }

  export(): RevisionComment[] {
    this.refresh();
    return clone(this.items.map((comment) => ({
      ...comment,
      targets: comment.targets.map((target) => this.latest.get(target.key) ?? target),
    })));
  }

  private change(label: string, after: RevisionComment[], mergeKey?: string): void {
    if (this.history.inTransaction) throw new Error('Finish the page edit before editing revision comments.');
    const before = this.items;
    this.items = clone(after);
    const next = this.items;
    this.history.recordState(label, () => { this.items = before; }, () => { this.items = next; }, mergeKey);
  }
}
