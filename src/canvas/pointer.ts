import type { Editor } from '../editor';
import { isStructural, isSvg, isTextEditable } from '../doc/kinds';
import { snapBox, type Box } from '../util/geometry';
import { arrowResizer, isArrow, type ArrowHandle, type ArrowResizer } from './arrow';
import { magnetSnap, magnetTargets, type MagnetTarget } from './magnet';
import type { Overlay } from './overlay';
import type { Stage } from './stage';
import type { TextEditor } from './textedit';
import { createMover, createResizer, type Mover } from './transform';

const DRAG_THRESHOLD = 3;
const SNAP_PX = 6;
/** How close (screen px) an arrow end must come to a box edge to snap onto it. */
const MAGNET_PX = 10;
/** Offsets probed around the cursor so hairline SVG arrows are easy to click. */
const PROBE = [
  [0, -4], [4, 0], [0, 4], [-4, 0], [3, 3], [-3, 3], [3, -3], [-3, -3],
  [0, -8], [8, 0], [0, 8], [-8, 0],
];

type Gesture =
  | { kind: 'pending'; x: number; y: number; el: Element; hit: Element }
  | { kind: 'move'; x: number; y: number; movers: Mover[]; start: Box; targets: Box[] }
  | { kind: 'resize'; x: number; y: number; resizer: NonNullable<ReturnType<typeof createResizer>> }
  | { kind: 'arrow'; x: number; y: number; resizer: ArrowResizer; targets: MagnetTarget[] }
  | { kind: 'scrollbar'; x: number; y: number; el: Element; axis: 'x' | 'y'; start: number; ratio: number };

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
      this.overlay.root.style.cursor = hit && this.selectedOwner(hit) ? 'move' : '';
      return;
    }
    const z = this.stage.zoom;
    let dx = (e.clientX - g.x) / z;
    let dy = (e.clientY - g.y) / z;

    if (g.kind === 'scrollbar') {
      const d = (g.axis === 'x' ? dx : dy) * g.ratio;
      if (g.axis === 'x') g.el.scrollLeft = g.start + d;
      else g.el.scrollTop = g.start + d;
      return;
    }

    if (g.kind === 'pending') {
      if (Math.hypot(dx * z, dy * z) < DRAG_THRESHOLD) return;
      // Move every selected element together; snapping follows the one grabbed.
      const roots = this.editor.isSelected(g.el) ? this.editor.selectionRoots.filter((r) => !isStructural(r)) : [g.el];
      const grabbed = roots.find((r) => r === g.el || r.contains(g.el)) ?? g.el;
      const movers = roots.map(createMover).filter((m): m is Mover => !!m);
      if (!movers.length) {
        this.gesture = null;
        return;
      }
      this.editor.history?.begin(roots.length > 1 ? `Move ${roots.length} elements` : 'Move');
      this.editor.setBusy('drag');
      this.gesture = { kind: 'move', x: g.x, y: g.y, movers, start: this.stage.docRect(grabbed), targets: this.snapTargets(grabbed, roots) };
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
      for (const m of g.movers) m.move(dx, dy);
      this.overlay.setGuides(guides);
      this.editor.emit('change');
      return;
    }

    if (g.kind === 'arrow') {
      const snap = g.resizer.magnet && !e.altKey
        ? magnetSnap({ x: g.resizer.start.x + dx, y: g.resizer.start.y + dy }, g.targets, MAGNET_PX / z)
        : null;
      if (snap) {
        dx = snap.point.x - g.resizer.start.x;
        dy = snap.point.y - g.resizer.start.y;
      }
      this.overlay.setSnap(snap?.target.box ?? null, snap?.point);
      g.resizer.resize(dx, dy);
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

    const name = handle?.dataset.handle;
    if (handle && sel && isArrow(sel) && (name === 'p1' || name === 'p2' || name === 'mid')) {
      e.preventDefault();
      // Begin first: bending a straight <line> replaces it with a <path>.
      this.editor.history?.begin(name === 'mid' ? 'Bend arrow' : 'Move arrow end');
      const resizer = arrowResizer(sel, name as ArrowHandle);
      if (!resizer) {
        this.editor.history?.end();
        return;
      }
      if (resizer.replaced) this.editor.setSelection([resizer.replaced]);
      root.setPointerCapture(e.pointerId);
      this.editor.setBusy('resize');
      const targets = resizer.magnet ? magnetTargets(this.editor.doc, resizer.replaced ?? sel) : [];
      this.gesture = { kind: 'arrow', x: e.clientX, y: e.clientY, resizer, targets };
      return;
    }

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

    const bar = this.scrollbarAt(e.clientX, e.clientY);
    if (bar) {
      e.preventDefault();
      root.setPointerCapture(e.pointerId);
      this.gesture = bar;
      return;
    }

    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();

    // Shift/Ctrl+click adds to the selection, or takes out what's already in it.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const owner = this.selectedOwner(hit);
      if (owner) this.editor.toggle(owner);
      else this.editor.toggle(this.sameLevel(hit));
      return;
    }

    // Dragging inside the selection moves the whole selection, so a card can
    // be grabbed by its text; a plain click there picks just the element
    // under the cursor instead (decided on release).
    const owner = this.selectedOwner(hit);
    if (!owner) this.editor.select(hit);
    root.setPointerCapture(e.pointerId);
    this.gesture = { kind: 'pending', x: e.clientX, y: e.clientY, el: owner ?? hit, hit };
  }

  private onUp(e: PointerEvent): void {
    const g = this.gesture;
    this.gesture = null;
    if (this.overlay.root.hasPointerCapture(e.pointerId)) this.overlay.root.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === 'pending') {
      if (g.hit !== g.el || this.editor.multi) this.editor.select(g.hit);
      return;
    }
    if (g.kind === 'scrollbar') return;
    this.overlay.setGuides([]);
    this.overlay.setSnap(null);
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
    // Let scrollable boxes inside the page scroll (either way); otherwise the canvas scrolls.
    // Shift+wheel scrolls sideways, as it does in a browser.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
    const z = this.stage.zoom;
    const win = this.editor.win;
    for (let el = this.hitTest(e.clientX, e.clientY); el && win; el = el.parentElement) {
      if (el === this.editor.doc?.body || el === this.editor.doc?.documentElement) break;
      const cs = win.getComputedStyle(el);
      const sx = canScroll(cs.overflowX, el.scrollLeft, el.clientWidth, el.scrollWidth, dx) ? dx : 0;
      const sy = canScroll(cs.overflowY, el.scrollTop, el.clientHeight, el.scrollHeight, dy) ? dy : 0;
      if (sx || sy) {
        e.preventDefault();
        // Divide by zoom so the content moves as far on screen as the wheel asked.
        el.scrollBy({ left: sx / z, top: sy / z, behavior: 'instant' });
        return;
      }
    }
  }

  /**
   * Is the press on a scrollbar of a scrollable box inside the page? Then
   * drag it (the glass overlay would otherwise take the press as a select).
   */
  private scrollbarAt(clientX: number, clientY: number): Gesture | null {
    const hit = this.hitTest(clientX, clientY);
    const win = this.editor.win;
    if (!hit || !win || isStructural(hit)) return null;
    const cs = win.getComputedStyle(hit);
    const { x, y } = this.stage.toDoc(clientX, clientY);
    const r = hit.getBoundingClientRect();
    const inner = { left: r.left + hit.clientLeft, top: r.top + hit.clientTop };
    const scrollsX = /auto|scroll/.test(cs.overflowX) && hit.scrollWidth > hit.clientWidth;
    const scrollsY = /auto|scroll/.test(cs.overflowY) && hit.scrollHeight > hit.clientHeight;
    // The bar sits between the padding box and the border.
    const onBottomBar = scrollsX && y > inner.top + hit.clientHeight && y < r.bottom - (parseFloat(cs.borderBottomWidth) || 0);
    const onRightBar = scrollsY && x > inner.left + hit.clientWidth && x < r.right - (parseFloat(cs.borderRightWidth) || 0);
    if (!onBottomBar && !onRightBar) return null;
    const axis = onBottomBar ? 'x' : 'y';
    const track = axis === 'x' ? hit.clientWidth : hit.clientHeight;
    const total = axis === 'x' ? hit.scrollWidth : hit.scrollHeight;
    const at = axis === 'x' ? x - inner.left : y - inner.top;
    // Pressed beside the thumb: jump there first, like a browser does.
    const thumb = (track * track) / total;
    const pos = axis === 'x' ? hit.scrollLeft : hit.scrollTop;
    const thumbStart = (pos / total) * track;
    if (at < thumbStart || at > thumbStart + thumb) {
      const to = ((at - thumb / 2) / track) * total;
      if (axis === 'x') hit.scrollLeft = to;
      else hit.scrollTop = to;
    }
    return { kind: 'scrollbar', x: clientX, y: clientY, el: hit, axis, start: axis === 'x' ? hit.scrollLeft : hit.scrollTop, ratio: total / track };
  }

  /** The selected element that is, or contains, `hit` (page-level ones don't count). */
  private selectedOwner(hit: Element): Element | null {
    return this.editor.selection.find((s) => !isStructural(s) && (s === hit || s.contains(hit))) ?? null;
  }

  /**
   * When adding to a selection, click a card's text and you mean the card:
   * pick the ancestor that sits next to what's already selected.
   */
  private sameLevel(hit: Element): Element {
    const sel = this.editor.selected;
    const parent = sel?.parentElement;
    if (!sel || !parent || isStructural(sel)) return hit;
    for (let e: Element | null = hit; e; e = e.parentElement) if (e.parentElement === parent) return e;
    return hit;
  }

  /** Boxes to align with while dragging: the parent and the siblings, minus what's being moved. */
  private snapTargets(el: Element, moving: Element[] = [el]): Box[] {
    const parent = el.parentElement;
    if (!parent) return [];
    const boxes: Box[] = [];
    if (!isStructural(parent) || parent.localName === 'body') boxes.push(this.stage.docRect(parent));
    for (const sib of Array.from(parent.children).slice(0, 300)) {
      if (moving.some((m) => m === sib || m.contains(sib))) continue;
      const b = this.stage.docRect(sib);
      if (b.width > 0 || b.height > 0) boxes.push(b);
    }
    return boxes;
  }
}

/** Can a box with this overflow and scroll position scroll by `delta`? */
function canScroll(overflow: string, pos: number, size: number, total: number, delta: number): boolean {
  if (!delta || !/auto|scroll/.test(overflow) || total <= size + 1) return false;
  return delta < 0 ? pos > 0 : pos + size < total - 1;
}
