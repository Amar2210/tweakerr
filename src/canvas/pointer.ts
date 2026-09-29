import type { Editor } from '../editor';
import { isStructural, isSvg, isTextEditable } from '../doc/kinds';
import { snapBox, type Box } from '../util/geometry';
import type { Overlay } from './overlay';
import type { Stage } from './stage';
import type { TextEditor } from './textedit';
import { createMover, createResizer } from './transform';

const DRAG_THRESHOLD = 3;
const SNAP_PX = 6;
/** Offsets probed around the cursor so hairline SVG arrows are easy to click. */
const PROBE = [
  [0, -4], [4, 0], [0, 4], [-4, 0], [3, 3], [-3, 3], [3, -3], [-3, -3],
  [0, -8], [8, 0], [0, 8], [-8, 0],
];

type Gesture =
  | { kind: 'pending'; x: number; y: number; el: Element; hit: Element }
  | { kind: 'move'; x: number; y: number; el: Element; mover: NonNullable<ReturnType<typeof createMover>>; start: Box; targets: Box[] }
  | { kind: 'resize'; x: number; y: number; resizer: NonNullable<ReturnType<typeof createResizer>> };

/** Mouse interaction on the glass sheet: hover, select, drag, resize, double-click. */
export class Pointer {
  private gesture: Gesture | null = null;

  constructor(
    private editor: Editor,
    private stage: Stage,
    private overlay: Overlay,
    private text: TextEditor,
  ) {
    const root = overlay.root;
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointercancel', (e) => this.onUp(e));
    root.addEventListener('pointerleave', () => {
      if (!this.gesture) editor.hover(null);
    });
    root.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    root.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    // Clicking the empty canvas around the page clears the selection.
    stage.canvas.addEventListener('pointerdown', (e) => {
      if (e.target === stage.canvas) editor.select(null);
    });
  }

  /** The page element under a screen point. */
  hitTest(clientX: number, clientY: number): Element | null {
    const doc = this.editor.doc;
    if (!doc) return null;
    const { x, y } = this.stage.toDoc(clientX, clientY);
    const hit = doc.elementFromPoint(x, y);
    if (!hit) return null;
    if (hit === doc.documentElement) return doc.body ?? hit;
    // Clicked empty space inside an SVG: look around for a thin line or path.
    if (isSvg(hit) && (hit.localName === 'svg' || hit.localName === 'g')) {
      for (const [ox, oy] of PROBE) {
        const near = doc.elementFromPoint(x + ox / this.stage.zoom, y + oy / this.stage.zoom);
        if (near && isSvg(near) && near.localName !== 'svg' && near.localName !== 'g' && hit.contains(near)) return near;
      }
    }
    return hit;
  }

  private onMove(e: PointerEvent): void {
    const g = this.gesture;
    if (!g) {
      const hit = this.hitTest(e.clientX, e.clientY);
      this.editor.hover(hit);
      const sel = this.editor.selected;
      this.overlay.root.style.cursor = sel && hit && (sel === hit || sel.contains(hit)) && !isStructural(sel) ? 'move' : '';
      return;
    }
    const z = this.stage.zoom;
    let dx = (e.clientX - g.x) / z;
    let dy = (e.clientY - g.y) / z;

    if (g.kind === 'pending') {
      if (Math.hypot(dx * z, dy * z) < DRAG_THRESHOLD) return;
      const mover = createMover(g.el);
      if (!mover) {
        this.gesture = null;
        return;
      }
      this.editor.history?.begin('Move');
      this.editor.setBusy('drag');
      this.gesture = { kind: 'move', x: g.x, y: g.y, el: g.el, mover, start: this.stage.docRect(g.el), targets: this.snapTargets(g.el) };
      return this.onMove(e);
    }

    if (g.kind === 'move') {
      if (e.shiftKey) {
        // Lock to the dominant axis.
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let guides: ReturnType<typeof snapBox>['guides'] = [];
      if (!e.altKey) {
        const moving = { ...g.start, left: g.start.left + dx, top: g.start.top + dy };
        const snap = snapBox(moving, g.targets, SNAP_PX / z);
        if (!e.shiftKey || dy === 0) dx += snap.dx;
        if (!e.shiftKey || dx === 0) dy += snap.dy;
        guides = snap.guides;
      }
      g.mover.move(dx, dy);
      this.overlay.setGuides(guides);
      this.editor.emit('change');
      return;
    }

    g.resizer.resize(dx, dy, e.shiftKey);
    this.editor.emit('change');
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.editor.doc) return;
    const root = this.overlay.root;
    // preventDefault below stops the browser moving focus, so do it here:
    // a half-typed panel field commits, and shortcuts reach the editor.
    this.stage.canvas.focus({ preventScroll: true });
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    const sel = this.editor.selected;

    if (handle && sel) {
      const resizer = createResizer(sel, handle.dataset.handle!);
      if (resizer) {
        e.preventDefault();
        root.setPointerCapture(e.pointerId);
        this.editor.history?.begin('Resize');
        this.editor.setBusy('resize');
        this.gesture = { kind: 'resize', x: e.clientX, y: e.clientY, resizer };
      }
      return;
    }

    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    // Dragging inside the current selection moves the selection itself, so
    // a card can be grabbed by its text; a plain click there drills into
    // the element under the cursor instead (decided on release).
    const target = sel && !isStructural(sel) && (sel === hit || sel.contains(hit)) ? sel : hit;
    this.editor.select(target);
    root.setPointerCapture(e.pointerId);
    this.gesture = { kind: 'pending', x: e.clientX, y: e.clientY, el: target, hit };
  }

  private onUp(e: PointerEvent): void {
    const g = this.gesture;
    this.gesture = null;
    if (this.overlay.root.hasPointerCapture(e.pointerId)) this.overlay.root.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === 'pending') {
      if (g.hit !== g.el) this.editor.select(g.hit);
      return;
    }
    this.overlay.setGuides([]);
    this.editor.history?.end();
    this.editor.setBusy(null);
  }

  private onDoubleClick(e: MouseEvent): void {
    const hit = this.hitTest(e.clientX, e.clientY);
    const sel = this.editor.selected;
    const target = hit && isTextEditable(hit) ? hit : sel && isTextEditable(sel) ? sel : null;
    if (target) this.text.start(target, e.clientX, e.clientY);
  }

  private onWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.stage.setZoom(this.editor.zoom * Math.exp(-e.deltaY * 0.002), e);
      return;
    }
    // Let scrollable boxes inside the page scroll; otherwise the canvas scrolls.
    const hit = this.hitTest(e.clientX, e.clientY);
    const win = this.editor.win;
    for (let el = hit; el && win; el = el.parentElement) {
      if (el === this.editor.doc?.body || el === this.editor.doc?.documentElement) break;
      const oy = win.getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        const atTop = el.scrollTop <= 0 && e.deltaY < 0;
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
        if (!atTop && !atEnd) {
          e.preventDefault();
          el.scrollTop += e.deltaY;
          return;
        }
      }
    }
  }

  /** Boxes to align with while dragging: the parent and the siblings. */
  private snapTargets(el: Element): Box[] {
    const parent = el.parentElement;
    if (!parent) return [];
    const boxes: Box[] = [];
    if (!isStructural(parent) || parent.localName === 'body') boxes.push(this.stage.docRect(parent));
    for (const sib of Array.from(parent.children).slice(0, 300)) {
      if (sib === el) continue;
      const b = this.stage.docRect(sib);
      if (b.width > 0 || b.height > 0) boxes.push(b);
    }
    return boxes;
  }
}
