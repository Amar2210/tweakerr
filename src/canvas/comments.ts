import type { Editor } from '../editor';
import type { RevisionComment } from '../doc/comments';
import type { CommentTarget } from '../doc/comment-targets';
import { CommentSidebar } from '../panel/comments';
import type { Box } from '../util/geometry';
import { h } from '../util/dom';
import { icon } from '../util/icons';
import type { Stage } from './stage';

interface CommentView {
  bounds: Box | null;
  occluders: Box[];
}
interface VisibleTarget {
  box: Box;
  bounds: Box;
  occluders: Box[];
}

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
  private popover = h('section', {
    class: 'comment-popover', attrs: { role: 'dialog', 'aria-labelledby': 'comment-popover-title' },
    on: { keydown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.dismiss();
      }
    } },
  });
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
    },
  });
  private save = h('button', {
    class: 'comment-save', title: 'Save comment in the editor and close (keeps it pending)',
    attrs: { type: 'button' }, on: { click: () => this.saveComment() },
  }, icon('check'), h('span', { text: 'Save comment' }));
  private cancel = h('button', {
    class: 'btn comment-cancel', text: 'Cancel', title: 'Discard this new comment completely',
    attrs: { type: 'button', 'aria-label': 'Cancel new comment' }, on: { click: () => this.dismiss() },
  });
  private hint = h('p', { class: 'comment-help' });
  private newDraft = false;
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
      h('div', { class: 'comment-popover-actions' }, this.hint,
        h('div', { class: 'comment-popover-buttons' }, this.save, this.cancel)),
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
    this.newDraft = true;
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

  /** Only an explicitly cancelled fresh draft is discarded; other closes keep autosave. */
  private dismiss(): void {
    const id = this.newDraft ? this.openId : null;
    this.close(true);
    if (id && this.editor.comments?.get(id)?.status === 'pending') this.editor.comments.delete(id);
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
    this.newDraft = false;
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
    const view = this.canvasView();
    // Shared requests and the selection often refer to the same element. Pay
    // for page geometry/hit testing only once per target in this animation frame.
    const visible = new Map<Element, VisibleTarget | null>();
    const measure = (el: Element) => {
      if (!visible.has(el)) visible.set(el, this.visibleBox(el, view));
      return visible.get(el)!;
    };
    const selected = this.editor.selected;
    const selectedBox = selected && measure(selected);
    this.add.hidden = !selectedBox || !!this.editor.busy;
    // Pack persistent markers in record order, independent of selection/drafts.
    // Later notes yield to earlier slots, never the other way around.
    if (comments) for (const comment of comments.all) {
      if (comment.status !== 'pending') continue;
      const targets = comments.targets(comment);
      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        if (!target) continue;
        const targetView = measure(target);
        if (!targetView) continue;
        const border = h('div', { class: 'comment-target-border', dataset: { commentId: comment.id } });
        place(border, targetView.box);
        this.borders.append(border);
        clipBorder(border, targetView);
        const key = `${comment.id}:${comment.targets[index].key}`;
        usedMarkers.add(key);
        let marker = this.markerNodes.get(key);
        if (!marker) {
          marker = h('button', {
            class: 'comment-marker', dataset: { commentId: comment.id },
            attrs: { type: 'button' },
            on: { click: () => this.open(comment.id) },
          }, icon('comment'), h('span', { class: 'comment-marker-id' }));
          this.markerNodes.set(key, marker);
          this.markers.append(marker);
        }
        const number = comments.displayNumber(comment.id)!;
        marker.querySelector('.comment-marker-id')!.textContent = `#${number}`;
        marker.title = `Comment ${number}: ${comment.text || 'Empty request'}\nRecord ID: ${comment.id}`;
        marker.setAttribute('aria-label', `Open comment ${number}`);
        marker.setAttribute('aria-expanded', String(this.openId === comment.id));
        marker.hidden = !!this.editor.busy;
        let position = markerPosition(targetView.box, marker.offsetWidth || 46, marker.offsetHeight || 25, targetView.bounds, occupied, targetView.occluders);
        if (position) position = this.controlPosition(target, position, targetView, occupied);
        marker.hidden ||= !position;
        if (position) {
          marker.style.left = `${position.left}px`;
          marker.style.top = `${position.top}px`;
          occupied.push(position);
        }
      }
    }
    for (const [key, marker] of this.markerNodes) if (!usedMarkers.has(key)) {
      marker.remove();
      this.markerNodes.delete(key);
    }
    if (selected && selectedBox && !this.add.hidden) this.positionAdd(selected, selectedBox, occupied);
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

  private positionAdd(target: Element, view: VisibleTarget, markers: readonly Box[]): void {
    const stage = this.stage.stage.getBoundingClientRect();
    // Overlay renders first. Measure its actual label/handles, including their
    // transformed hit rectangles, rather than guessing from the target's size.
    const controls = [...this.stage.stage.querySelectorAll('.ov-label:not([hidden]), .ov-handle')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left - stage.left, top: rect.top - stage.top, width: rect.width, height: rect.height };
    });
    const occupied = [...markers, ...controls];
    let position = addPosition(view.box, this.add.offsetWidth, this.add.offsetHeight, view.bounds, [...occupied, ...view.occluders]);
    if (position) position = this.controlPosition(target, position, view, occupied);
    this.add.hidden = !position;
    if (position) {
      this.add.style.left = `${position.left}px`;
      this.add.style.top = `${position.top}px`;
    }
  }

  private syncPopover(): void {
    const comment = this.openId ? this.editor.comments?.get(this.openId) : null;
    const number = comment ? this.editor.comments!.displayNumber(comment.id) : null;
    this.heading.textContent = comment ? `Comment ${number}` : 'New comment';
    this.heading.title = comment ? `Record ID: ${comment.id}` : '';
    this.remove.disabled = !comment;
    this.remove.setAttribute('aria-label', comment ? `Delete comment ${number}` : 'Delete comment');
    this.cancel.hidden = !this.newDraft;
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

  /** The canvas may scroll underneath an expanded editor sidebar at narrow widths. */
  private canvasView(): CommentView {
    const stage = this.stage.stage.getBoundingClientRect();
    const canvas = this.stage.canvas;
    const rect = canvas.getBoundingClientRect();
    const left = Math.max(0, rect.left + canvas.clientLeft);
    const top = Math.max(0, rect.top + canvas.clientTop);
    const right = Math.min(window.innerWidth, rect.left + canvas.clientLeft + canvas.clientWidth);
    const bottom = Math.min(window.innerHeight, rect.top + canvas.clientTop + canvas.clientHeight);
    const bounds = intersect({ left: left - stage.left, top: top - stage.top, width: right - left, height: bottom - top },
      { left: 0, top: 0, width: this.stage.stage.clientWidth, height: this.stage.stage.clientHeight });
    const occluders: Box[] = [];
    for (const side of document.querySelectorAll<HTMLElement>('.side.left, .side.right')) {
      const css = getComputedStyle(side), box = side.getBoundingClientRect();
      if (css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0' || !box.width || !box.height) continue;
      occluders.push({ left: box.left - stage.left, top: box.top - stage.top, width: box.width, height: box.height });
    }
    return { bounds, occluders };
  }

  /** Clip in iframe CSS pixels first; apply the editor zoom exactly once. */
  private pageBounds(el: Element): Box | null {
    const win = this.editor.win;
    if (!win || !el.isConnected) return null;
    let left = 0, top = 0, right = this.editor.frame.clientWidth, bottom = this.editor.frame.clientHeight;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const css = win.getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || css.opacity === '0') return null;
      if (node === el) continue;
      const clip = node.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(css.overflowX)) {
        left = Math.max(left, clip.left + node.clientLeft);
        right = Math.min(right, clip.left + node.clientLeft + node.clientWidth);
      }
      if (/auto|scroll|hidden|clip/.test(css.overflowY)) {
        top = Math.max(top, clip.top + node.clientTop);
        bottom = Math.min(bottom, clip.top + node.clientTop + node.clientHeight);
      }
    }
    return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
  }

  private visibleBox(el: Element, view: CommentView): VisibleTarget | null {
    const page = this.pageBounds(el);
    const rect = el.getBoundingClientRect();
    if (!page || !view.bounds || (!rect.width && !rect.height)) return null;
    const bounds = intersect(this.stage.toStage(page), view.bounds);
    const clipped = bounds && intersect(this.stage.toStage({ left: rect.left, top: rect.top, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }), bounds);
    if (!bounds || !clipped) return null;
    const occluders = [...view.occluders, ...this.pageOccluders(el, clipped)];
    const pieces = subtractAll(clipped, occluders);
    if (!pieces.length) return null;
    const left = Math.min(...pieces.map((box) => box.left)), top = Math.min(...pieces.map((box) => box.top));
    const right = Math.max(...pieces.map((box) => box.left + box.width)), bottom = Math.max(...pieces.map((box) => box.top + box.height));
    return { box: { left, top, width: right - left, height: bottom - top }, bounds, occluders };
  }

  /**
   * Overflow clipping cannot see sticky/fixed siblings painted above a card.
   * Nine iframe-only probes discover edge strips and central covers; subtract
   * only opaque rectangular surfaces in those stacking contexts, not arbitrary
   * hit boxes (e.g. a transparent SVG spanning the board). No page-wide scan,
   * and editor markers/selection controls can never become page occluders.
   */
  private pageOccluders(target: Element, area: Box): Box[] {
    const doc = target.ownerDocument, win = this.editor.win;
    if (!doc.elementsFromPoint || !win) return [];
    const z = this.stage.zoom;
    const left = area.left / z, top = area.top / z, width = area.width / z, height = area.height / z;
    const xs = [left + Math.min(0.5, width / 2), left + width / 2, left + width - Math.min(0.5, width / 2)];
    const ys = [top + Math.min(0.5, height / 2), top + height / 2, top + height - Math.min(0.5, height / 2)];
    const surfaces = new Set<Element>();
    for (const x of xs) for (const y of ys) {
      for (const hit of doc.elementsFromPoint(x, y)) {
        if (target === hit || target.contains(hit)) break;
        let surface: Element | null = null;
        for (let node: Element | null = hit; node && !node.contains(target) && !target.contains(node); node = node.parentElement) {
          const css = win.getComputedStyle(node);
          if (!surface && opaqueBackground(css) && Number(css.opacity || 1) === 1) surface = node;
          if (css.position === 'sticky' || css.position === 'fixed') {
            if (surface) surfaces.add(surface);
            break;
          }
        }
      }
    }
    const boxes: Box[] = [];
    for (const surface of surfaces) {
      const bounds = this.pageBounds(surface);
      const box = bounds && intersect(surface.getBoundingClientRect(), bounds);
      if (box) boxes.push(this.stage.toStage(box));
    }
    return boxes;
  }

  /** Tiny targets/packed controls can extend past the target into a nearby sticky column. */
  private controlPosition(target: Element, position: Box, view: VisibleTarget, occupied: readonly Box[]): Box | null {
    if (position.left < view.box.left || position.top < view.box.top || position.left + position.width > view.box.left + view.box.width
      || position.top + position.height > view.box.top + view.box.height) {
      view.occluders.push(...this.pageOccluders(target, position));
    }
    return view.occluders.some((box) => !!intersect(position, box))
      ? freePosition(position, view.bounds, [...occupied, ...view.occluders]) : position;
  }
}

function intersect(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width), bottom = Math.min(a.top + a.height, b.top + b.height);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

function subtractAll(box: Box, occluders: readonly Box[]): Box[] {
  let pieces = [box];
  for (const cover of occluders) pieces = pieces.flatMap((piece) => {
    const overlap = intersect(piece, cover);
    if (!overlap) return [piece];
    const right = overlap.left + overlap.width, bottom = overlap.top + overlap.height;
    return [
      { left: piece.left, top: piece.top, width: piece.width, height: overlap.top - piece.top },
      { left: piece.left, top: bottom, width: piece.width, height: piece.top + piece.height - bottom },
      { left: piece.left, top: overlap.top, width: overlap.left - piece.left, height: overlap.height },
      { left: right, top: overlap.top, width: piece.left + piece.width - right, height: overlap.height },
    ].filter((part) => part.width > 0 && part.height > 0);
  });
  return pieces;
}

function opaqueBackground(css: CSSStyleDeclaration): boolean {
  // Computed legacy sRGB colors serialize as rgb()/rgba(). Translucent or
  // image-only surfaces are not evidence that their entire hit box is hidden.
  return /^rgb\(/.test(css.backgroundColor) || /^rgba\([^,]+,[^,]+,[^,]+,\s*1\s*\)$/.test(css.backgroundColor);
}

function clipBorder(border: HTMLElement, view: VisibleTarget): void {
  const css = getComputedStyle(border);
  const pad = Math.max(0, (parseFloat(css.outlineWidth) || 0) + (parseFloat(css.outlineOffset) || 0));
  const { left, top, width, height } = view.box;
  const area = intersect({ left: left - pad, top: top - pad, width: width + pad * 2, height: height + pad * 2 }, view.bounds);
  // Clip the outline too: its CSS outline-offset otherwise leaks six pixels
  // back across an overflow/sticky boundary even after the box was trimmed.
  const path = (area ? subtractAll(area, view.occluders) : []).map((box) => {
    const x = box.left - left, y = box.top - top, r = x + box.width, b = y + box.height;
    return `M${x} ${y}H${r}V${b}H${x}Z`;
  }).join(' ');
  border.style.clipPath = `path("${path}")`;
}

/** The transient action yields to saved markers and selection controls, within the visible canvas. */
function addPosition(anchor: Box, width: number, height: number, bounds: Box, occupied: readonly Box[]): Box | null {
  const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
  if (bounds.width < width || bounds.height < height || anchor.left >= right || anchor.top >= bottom
    || anchor.left + anchor.width <= bounds.left || anchor.top + anchor.height <= bounds.top) return null;
  const preferred = {
    left: Math.max(bounds.left, Math.min(anchor.left + anchor.width - width, right - width)),
    top: Math.max(bounds.top, Math.min(anchor.top - height - 8, bottom - height)),
    width, height,
  };
  return freePosition(preferred, bounds, occupied);
}

function freePosition(preferred: Box, bounds: Box, occupied: readonly Box[]): Box | null {
  const { width, height } = preferred;
  const gap = 5;
  const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
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
function markerPosition(anchor: Box, width: number, height: number, bounds: Box, occupied: readonly Box[], occluders: readonly Box[]): Box | null {
  const gap = 5;
  if (width > bounds.width || height > bounds.height) return null;
  const preferred = Math.max(bounds.left, Math.min(anchor.left + anchor.width - width - 3, bounds.left + bounds.width - width));
  const minLeft = Math.max(bounds.left, Math.min(anchor.left, preferred));
  const box = { left: preferred, top: Math.max(bounds.top, anchor.top + 3), width, height };
  const overlaps = (other: Box) => box.left < other.left + other.width + gap && box.left + width + gap > other.left
    && box.top < other.top + other.height + gap && box.top + height + gap > other.top;
  while (occupied.some(overlaps)) {
    box.left -= width + gap;
    if (box.left < minLeft) {
      box.left = preferred;
      box.top += height + gap;
    }
  }
  if (box.top + height > bounds.top + bounds.height || occluders.some((cover) => !!intersect(box, cover))) {
    return freePosition({ left: preferred, top: Math.max(bounds.top, anchor.top + 3), width, height }, bounds, [...occupied, ...occluders]);
  }
  return box;
}

function place(el: HTMLElement, box: Box): void {
  el.style.left = `${box.left}px`; el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`; el.style.height = `${box.height}px`;
}
