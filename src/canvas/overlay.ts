import type { Editor } from '../editor';
import { describe, resizeKind } from '../doc/kinds';
import type { Box, Guide } from '../util/geometry';
import { h } from '../util/dom';
import type { Point } from '../util/path';
import { arrowHandles, isArrow } from './arrow';
import type { Stage } from './stage';

const BOX_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

/**
 * The glass sheet over the page. Draws hover and selection outlines,
 * resize handles and snap guides. None of this lives inside the page,
 * so it can never leak into the saved file.
 */
export class Overlay {
  private hoverBox = h('div', { class: 'ov-hover' });
  private selBox = h('div', { class: 'ov-select' });
  /** Extra outlines for the other elements of a multi-selection. */
  private groupBoxes = h('div', { class: 'ov-group' });
  private label = h('div', { class: 'ov-label' });
  private handles = h('div', { class: 'ov-handles' });
  private guides = h('div', { class: 'ov-guides' });
  /** The box an arrow end is snapping to, and the point on its edge. */
  private snapBox = h('div', { class: 'ov-snap' });
  private snapDot = h('div', { class: 'ov-snap-dot' });
  private queued = false;
  private guideList: Guide[] = [];

  constructor(
    private editor: Editor,
    private stage: Stage,
    readonly root: HTMLElement,
  ) {
    root.append(this.hoverBox, this.groupBoxes, this.selBox, this.snapBox, this.handles, this.guides, this.snapDot, this.label);
    this.snapBox.hidden = this.snapDot.hidden = true;
    for (const ev of ['selection', 'hover', 'change', 'redraw', 'layout', 'interaction', 'load'] as const) {
      editor.on(ev, () => this.queue());
    }
    // Page-internal scrolling (overflow containers) moves elements under us.
    editor.on('load', () => editor.doc?.addEventListener('scroll', () => this.queue(), true));
  }

  setGuides(guides: Guide[]): void {
    this.guideList = guides;
    this.queue();
  }

  /** Show (or with null, hide) the magnet's target while an arrow end is dragged. */
  setSnap(box: Box | null, point?: Point): void {
    this.snapBox.hidden = this.snapDot.hidden = !box;
    if (!box || !point) return;
    place(this.snapBox, this.stage.toStage(box));
    const z = this.stage.zoom;
    this.snapDot.style.left = `${point.x * z}px`;
    this.snapDot.style.top = `${point.y * z}px`;
  }

  queue(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.render();
    });
  }

  render(): void {
    const { selected, hovered, busy, selection } = this.editor;
    this.root.classList.toggle('passthrough', busy === 'text');

    if (hovered && !this.editor.isSelected(hovered) && !busy) {
      place(this.hoverBox, this.stage.toStage(this.stage.docRect(hovered)));
      this.hoverBox.hidden = false;
    } else {
      this.hoverBox.hidden = true;
    }

    this.handles.replaceChildren();
    if (!selected) {
      this.selBox.hidden = true;
      this.label.hidden = true;
    } else {
      const doc = this.stage.docRect(selected);
      const box = this.stage.toStage(doc);
      place(this.selBox, box);
      this.selBox.hidden = false;
      this.selBox.classList.toggle('editing', busy === 'text');
      this.label.textContent =
        selection.length > 1 ? `${selection.length} selected` : `${describe(selected)}  ${Math.round(doc.width)} × ${Math.round(doc.height)}`;
      this.label.style.left = `${box.left}px`;
      this.label.style.top = `${Math.max(0, box.top - 22)}px`;
      this.label.hidden = false;
      if (busy !== 'text' && selection.length === 1) this.renderHandles(selected, box);
    }

    this.groupBoxes.replaceChildren(
      ...selection.slice(0, -1).map((el) => {
        const b = h('div', { class: 'ov-select ov-select-extra' });
        place(b, this.stage.toStage(this.stage.docRect(el)));
        return b;
      }),
    );

    this.guides.replaceChildren(
      ...this.guideList.map((g) => {
        const z = this.stage.zoom;
        const line = h('div', { class: `ov-guide ov-guide-${g.axis}` });
        if (g.axis === 'v') {
          line.style.left = `${g.pos * z}px`;
          line.style.top = `${g.from * z}px`;
          line.style.height = `${(g.to - g.from) * z}px`;
        } else {
          line.style.top = `${g.pos * z}px`;
          line.style.left = `${g.from * z}px`;
          line.style.width = `${(g.to - g.from) * z}px`;
        }
        return line;
      }),
    );
  }

  private renderHandles(el: Element, box: { left: number; top: number; width: number; height: number }): void {
    if (isArrow(el)) {
      const dots = arrowHandles(el);
      if (!dots) return;
      for (const [name, p] of Object.entries(dots)) {
        const mid = name === 'mid';
        const hd = h('div', {
          class: `ov-handle ov-handle-point${mid ? ' ov-handle-mid' : ''}`,
          title: mid ? 'Drag to bend the arrow' : `Drag to move the ${name === 'p1' ? 'tail' : 'head'} (snaps onto boxes; Alt: no snapping)`,
          dataset: { handle: name },
        });
        hd.style.left = `${p.x * this.stage.zoom}px`;
        hd.style.top = `${p.y * this.stage.zoom}px`;
        this.handles.append(hd);
      }
      return;
    }
    const kind = resizeKind(el);
    if (kind === 'none' || kind === 'line') return;
    for (const pos of BOX_HANDLES) {
      const hd = h('div', { class: `ov-handle ov-h-${pos}`, dataset: { handle: pos } });
      const x = pos.includes('w') ? 0 : pos.includes('e') ? 1 : 0.5;
      const y = pos.includes('n') ? 0 : pos.includes('s') ? 1 : 0.5;
      hd.style.left = `${box.left + box.width * x}px`;
      hd.style.top = `${box.top + box.height * y}px`;
      this.handles.append(hd);
    }
  }
}

function place(el: HTMLElement, b: { left: number; top: number; width: number; height: number }): void {
  el.style.left = `${b.left}px`;
  el.style.top = `${b.top}px`;
  el.style.width = `${b.width}px`;
  el.style.height = `${b.height}px`;
}
