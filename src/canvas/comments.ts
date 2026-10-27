import type { Editor } from '../editor';
import type { RevisionComment } from '../doc/comments';
import type { CommentTarget } from '../doc/comment-targets';
import { CommentSidebar } from '../panel/comments';
import type { Box } from '../util/geometry';
import { h } from '../util/dom';
import { icon } from '../util/icons';
import type { Stage } from './stage';

/** Comment controls are siblings of the page overlay, never children of the iframe. */
export class CommentsUI {
  private root = h('div', { class: 'comment-layer' });
  private borders = h('div', { class: 'comment-borders' });
  private markers = h('div', { class: 'comment-markers' });
  private markerNodes = new Map<string, HTMLButtonElement>();
  private add = h('button', {
    class: 'comment-add', title: 'Add comment',
    attrs: { type: 'button', 'aria-label': 'Add comment' }, on: { click: () => this.start() },
  }, icon('comment'));
  private popover = h('section', { class: 'comment-popover', attrs: { role: 'dialog', 'aria-labelledby': 'comment-popover-title' } });
  private heading = h('h2', { attrs: { id: 'comment-popover-title' } });
  private remove = h('button', {
    class: 'comment-delete', text: '×', title: 'Delete this comment completely',
    attrs: { type: 'button', 'aria-label': 'Delete comment' },
    on: { click: () => { if (this.openId) this.delete(this.openId); } },
  });
  private targetList = h('ul', { class: 'comment-target-list' });
  private input = h('textarea', {
    class: 'comment-input', attrs: { id: 'comment-request', rows: '5', placeholder: 'Describe the change you want…' },
    on: {
      input: () => this.onInput(),
      focus: () => { this.editKey = `comment-typing-${++this.session}`; },
      keydown: (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.close(true);
        }
      },
    },
  });
  private save = h('button', {
    class: 'comment-save', title: 'Save comment in the editor and close (keeps it pending)',
    attrs: { type: 'button' }, on: { click: () => this.saveComment() },
  }, icon('check'), h('span', { text: 'Save comment' }));
  private hint = h('p', { class: 'comment-help' });
  private openId: string | null = null;
  private draftTargets: CommentTarget[] | null = null;
  private anchor: HTMLElement | null = null;
  private anchorAction: string | null = null;
  private queued = false;
  private session = 0;
  private editKey = '';

  constructor(
    private editor: Editor,
    private stage: Stage,
    private sidebar: HTMLElement,
    private finishPageText: () => void,
  ) {
    this.root.append(this.borders, this.markers, this.add);
    stage.stage.append(this.root);
    this.popover.append(
      h('div', { class: 'comment-popover-heading' }, this.heading, this.remove),
      this.targetList,
      h('label', { class: 'comment-input-label', text: 'Revision request', attrs: { for: 'comment-request' } }),
      this.input,
      h('div', { class: 'comment-popover-actions' }, this.hint, this.save),
    );
    this.popover.hidden = true;
    document.body.append(this.popover);
    new CommentSidebar(editor, sidebar, (id) => this.open(id), (id) => this.delete(id), (target) => this.locate(target));
    for (const event of ['selection', 'change', 'redraw', 'layout', 'interaction'] as const) editor.on(event, () => this.queue());
    editor.on('load', () => {
      this.close();
      const doc = editor.doc;
      doc?.addEventListener('scroll', () => this.queue(), true);
      // Text editing can pass clicks through to the iframe; those do not bubble.
      doc?.addEventListener('pointerdown', () => this.close(), true);
      this.queue();
    });
    stage.canvas.addEventListener('scroll', () => this.queue());
    window.addEventListener('resize', () => this.queue());
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Node;
      if (!this.popover.contains(target) && !this.root.contains(target)) this.close();
    }, true);
    this.render();
  }

  /** Used by the unavailable-target recovery entries as well as canvas markers. */
  open(id: string): void {
    this.finishPageText();
    const comment = this.editor.comments?.get(id);
    if (!comment || comment.status !== 'pending') return;
    this.close();
    this.openId = id;
    this.input.value = comment.text;
    this.show();
  }

  private locate(target: CommentTarget): void {
    this.finishPageText();
    this.close();
    const element = this.editor.comments?.findTarget(target);
    if (!element) {
      this.editor.notify('Target unavailable. The original element could not be identified safely.');
      return;
    }
    // Native scrolling traverses nested containers and the scaled iframe's
    // outer canvas. Instant navigation also honors reduced-motion preferences.
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    this.editor.hover(null);
    this.editor.select(element);
  }

  private start(): void {
    this.finishPageText();
    if (!this.editor.comments || !this.editor.selection.length) return;
    this.close();
    this.draftTargets = this.editor.comments.prepareTargets(this.editor.selection);
    if (this.draftTargets.length !== this.editor.selection.length) {
      this.draftTargets = null;
      this.editor.notify('The selection changed while the page redrew. Select its current elements before commenting.');
      return;
    }
    this.input.value = '';
    this.show();
  }

  private show(): void {
    this.anchor = document.activeElement as HTMLElement | null;
    this.anchorAction = this.sidebar.contains(this.anchor) ? this.anchor?.dataset.commentAction ?? null : null;
    this.popover.hidden = false;
    this.syncPopover();
    this.positionPopover();
    this.input.focus({ preventScroll: true });
    this.queue();
  }

  private onInput(): void {
    const comments = this.editor.comments;
    if (!comments) return;
    if (this.openId) comments.update(this.openId, this.input.value, this.editKey);
    else if (this.draftTargets && this.input.value.trim()) {
      const created = comments.addPrepared(this.input.value, this.draftTargets, this.editKey);
      if (created) {
        this.openId = created.id;
        this.draftTargets = null;
      }
    }
    this.syncPopover();
  }

  private saveComment(): void {
    if (!this.input.value.trim()) return;
    this.onInput();
    if (!this.openId || this.editor.comments?.get(this.openId)?.status !== 'pending') return;
    this.close(true);
    this.editor.notify('Comment saved in editor · still pending');
  }

  private delete(id: string): void {
    this.finishPageText();
    const wasOpen = this.openId === id;
    if (wasOpen) this.close();
    this.editor.comments?.delete(id);
    if (wasOpen) {
      if (!this.add.hidden) this.add.focus({ preventScroll: true });
      else this.stage.canvas.focus({ preventScroll: true });
    }
  }

  close(restoreFocus = false): void {
    const wasOpen = !this.popover.hidden;
    this.popover.hidden = true;
    this.openId = null;
    this.draftTargets = null;
    if (restoreFocus && wasOpen) {
      // Typing rebuilds sidebar entries while the textarea keeps focus. Resolve
      // its original action, never a deleted entry or a now-hidden view.
      const anchor = this.anchorAction
        ? [...this.sidebar.querySelectorAll<HTMLElement>('[data-comment-action]')].find((el) => el.dataset.commentAction === this.anchorAction)
        : this.anchor;
      if (anchor?.isConnected && anchor.getClientRects().length) anchor.focus({ preventScroll: true });
      else this.stage.canvas.focus({ preventScroll: true });
    }
    this.anchor = null;
    this.anchorAction = null;
    if (wasOpen) this.queue();
  }

  private queue(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.render(); });
  }

  render(): void {
    const comments = this.editor.comments;
    this.root.hidden = !comments;
    this.borders.replaceChildren();
    const usedMarkers = new Set<string>();
    const occupied: Box[] = [];
    const selected = this.editor.selected;
    const selectedBox = selected && this.visibleBox(selected);
    this.add.hidden = !selectedBox || !!this.editor.busy;
    // Pack persistent markers in record order, independent of selection/drafts.
    // Later notes yield to earlier slots, never the other way around.
    if (comments) for (const comment of comments.all) {
      if (comment.status !== 'pending') continue;
      const targets = comments.targets(comment);
      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        if (!target) continue;
        const box = this.visibleBox(target);
        if (!box) continue;
        const border = h('div', { class: 'comment-target-border', dataset: { commentId: comment.id } });
        place(border, box);
        this.borders.append(border);
        const key = `${comment.id}:${comment.targets[index].key}`;
        usedMarkers.add(key);
        let marker = this.markerNodes.get(key);
        if (!marker) {
          marker = h('button', {
            class: 'comment-marker', dataset: { commentId: comment.id },
            attrs: { type: 'button', 'aria-label': `Open comment ${comment.id}` },
            on: { click: () => this.open(comment.id) },
          }, icon('comment'), h('span', { class: 'comment-marker-id', text: comment.id }));
          this.markerNodes.set(key, marker);
          this.markers.append(marker);
        }
        marker.title = `${comment.id}: ${comment.text || 'Empty request'}`;
        marker.setAttribute('aria-expanded', String(this.openId === comment.id));
        marker.hidden = !!this.editor.busy;
        const position = markerPosition(box, marker.offsetWidth || 46, marker.offsetHeight || 25, this.stage.stage.clientWidth, occupied);
        marker.style.left = `${position.left}px`;
        marker.style.top = `${position.top}px`;
        occupied.push(position);
      }
    }
    for (const [key, marker] of this.markerNodes) if (!usedMarkers.has(key)) {
      marker.remove();
      this.markerNodes.delete(key);
    }
    if (selectedBox && !this.add.hidden) this.positionAdd(selectedBox, occupied);
    if (!this.popover.hidden) {
      const comment = this.openId && comments?.get(this.openId);
      if (this.openId && !comment) this.close();
      else {
        if (comment && this.input.value !== comment.text) this.input.value = comment.text;
        this.syncPopover();
        this.positionPopover();
      }
    }
  }

  private positionAdd(anchor: Box, markers: readonly Box[]): void {
    const stage = this.stage.stage.getBoundingClientRect();
    const canvas = this.stage.canvas.getBoundingClientRect();
    const left = Math.max(0, canvas.left + this.stage.canvas.clientLeft - stage.left);
    const top = Math.max(0, canvas.top + this.stage.canvas.clientTop - stage.top);
    const right = Math.min(this.stage.stage.clientWidth, canvas.left + this.stage.canvas.clientLeft + this.stage.canvas.clientWidth - stage.left);
    const bottom = Math.min(this.stage.stage.clientHeight, canvas.top + this.stage.canvas.clientTop + this.stage.canvas.clientHeight - stage.top);
    // Overlay renders first. Measure its actual label/handles, including their
    // transformed hit rectangles, rather than guessing from the target's size.
    const controls = [...this.stage.stage.querySelectorAll('.ov-label:not([hidden]), .ov-handle')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left - stage.left, top: rect.top - stage.top, width: rect.width, height: rect.height };
    });
    const position = addPosition(anchor, this.add.offsetWidth, this.add.offsetHeight,
      { left, top, width: right - left, height: bottom - top }, [...markers, ...controls]);
    this.add.hidden = !position;
    if (position) {
      this.add.style.left = `${position.left}px`;
      this.add.style.top = `${position.top}px`;
    }
  }

  private syncPopover(): void {
    const comment = this.openId ? this.editor.comments?.get(this.openId) : null;
    this.heading.textContent = comment ? `Comment ${comment.id}` : 'New comment';
    this.remove.disabled = !comment;
    this.remove.setAttribute('aria-label', comment ? `Delete comment ${comment.id}` : 'Delete comment');
    this.targetList.replaceChildren(...(comment?.targets ?? this.draftTargets ?? []).map((target) => h('li', { text: target.label })));
    const unavailable = comment ? this.editor.comments!.targets(comment).filter((target) => !target).length : 0;
    this.hint.textContent = unavailable ? `${unavailable} target(s) unavailable · still pending · Save the page to write HTML`
      : 'Pending request · Save the page to write HTML';
    this.save.disabled = !this.editor.comments || !this.input.value.trim();
  }

  private positionPopover(): void {
    const comment: RevisionComment | undefined = this.openId ? this.editor.comments?.get(this.openId) : undefined;
    const draft = this.draftTargets?.at(-1);
    const element = comment ? this.editor.comments!.targets(comment).find((target) => !!target) : draft ? this.editor.comments?.target(draft) : null;
    const rect = element?.getBoundingClientRect();
    const stage = this.stage.stage.getBoundingClientRect();
    const canvas = this.stage.canvas.getBoundingClientRect();
    const x = rect ? stage.left + (rect.left + rect.width) * this.stage.zoom : canvas.left + 20;
    const y = rect ? stage.top + rect.top * this.stage.zoom + 32 : canvas.top + 20;
    const width = this.popover.offsetWidth;
    const height = this.popover.offsetHeight;
    this.popover.style.left = `${Math.max(8, Math.min(x + 8, window.innerWidth - width - 8))}px`;
    this.popover.style.top = `${Math.max(50, Math.min(y, window.innerHeight - height - 32))}px`;
  }

  /** Respect clipping inside the user's page, not just the outer editor canvas. */
  private visibleBox(el: Element): Box | null {
    const win = this.editor.win;
    if (!win) return null;
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const rect = el.getBoundingClientRect();
    let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
    if (!rect.width && !rect.height) return null;
    for (let parent = el.parentElement; parent && parent !== el.ownerDocument.body; parent = parent.parentElement) {
      const css = win.getComputedStyle(parent);
      const clip = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(css.overflowX)) {
        left = Math.max(left, clip.left + parent.clientLeft);
        right = Math.min(right, clip.left + parent.clientLeft + parent.clientWidth);
      }
      if (/auto|scroll|hidden|clip/.test(css.overflowY)) {
        top = Math.max(top, clip.top + parent.clientTop);
        bottom = Math.min(bottom, clip.top + parent.clientTop + parent.clientHeight);
      }
    }
    left = Math.max(0, left); top = Math.max(0, top);
    right = Math.min(this.editor.frame.clientWidth, right); bottom = Math.min(this.editor.frame.clientHeight, bottom);
    if (right < left || bottom < top || (rect.width > 0 && right === left) || (rect.height > 0 && bottom === top)) return null;
    return this.stage.toStage({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
  }
}

/** The transient action yields to saved markers and selection controls, within the visible canvas. */
function addPosition(anchor: Box, width: number, height: number, bounds: Box, occupied: readonly Box[]): Box | null {
  const gap = 5;
  const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
  if (bounds.width < width || bounds.height < height || anchor.left >= right || anchor.top >= bottom
    || anchor.left + anchor.width <= bounds.left || anchor.top + anchor.height <= bounds.top) return null;
  const preferred = {
    left: Math.max(bounds.left, Math.min(anchor.left + anchor.width - width, right - width)),
    top: Math.max(bounds.top, Math.min(anchor.top - height - 8, bottom - height)),
  };
  // Every free rectangle starts/ends at a boundary or an obstacle edge. Search
  // those slots for the nearest fit, allowing overflow beside/below small targets.
  const xs = [preferred.left, bounds.left, right - width];
  const ys = [preferred.top, bounds.top, bottom - height];
  for (const box of occupied) {
    xs.push(box.left - width - gap, box.left + box.width + gap);
    ys.push(box.top - height - gap, box.top + box.height + gap);
  }
  let best: Box | null = null, distance = Infinity;
  for (const left of xs) for (const top of ys) {
    if (left < bounds.left || left + width > right || top < bounds.top || top + height > bottom) continue;
    const next = (left - preferred.left) ** 2 + (top - preferred.top) ** 2;
    if (next >= distance || occupied.some((box) => left < box.left + box.width + gap && left + width + gap > box.left
      && top < box.top + box.height + gap && top + height + gap > box.top)) continue;
    best = { left, top, width, height };
    distance = next;
  }
  return best;
}

/** Pack leftward near each target, then wrap down instead of clamping slots together. */
function markerPosition(anchor: Box, width: number, height: number, stageWidth: number, occupied: readonly Box[]): Box {
  const gap = 5;
  const preferred = Math.max(0, Math.min(anchor.left + anchor.width - width - 3, stageWidth - width));
  const minLeft = Math.max(0, Math.min(anchor.left, preferred));
  const box = { left: preferred, top: Math.max(0, anchor.top + 3), width, height };
  const overlaps = (other: Box) => box.left < other.left + other.width + gap && box.left + width + gap > other.left
    && box.top < other.top + other.height + gap && box.top + height + gap > other.top;
  while (occupied.some(overlaps)) {
    box.left -= width + gap;
    if (box.left < minLeft) {
      box.left = preferred;
      box.top += height + gap;
    }
  }
  return box;
}

function place(el: HTMLElement, box: Box): void {
  el.style.left = `${box.left}px`; el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`; el.style.height = `${box.height}px`;
}
