/**
 * Arrow handles: a dot on the tail, the head and the middle of an SVG line
 * or open path. Drag an end to reconnect it (the magnet helps), or the
 * middle to bend the arrow into a curve; drag the middle back near the
 * straight line and it snaps straight.
 *
 * On a live page the page's code redraws its arrows, so a reshaped arrow's
 * path is kept as a style rule (`d: path("…")`): it stays as drawn, and no
 * longer follows its boxes, until "Reset shape" hands it back to the code.
 */
import { SVG_NS } from '../doc/kinds';
import { liveFor } from '../doc/live';
import { inlineStyle, setAttr, setStyle } from '../doc/style';
import { bendThrough, ends, formatPath, isOpen, moveEnd, parsePath, straighten, type Point, type Seg } from '../util/path';
import { r2 } from '../util/geometry';

export type ArrowHandle = 'p1' | 'p2' | 'mid';

export interface ArrowResizer {
  resize(dx: number, dy: number): void;
  /** Where the dragged dot started, in page px (the magnet works from it). */
  start: Point;
  /** An end, which the magnet may snap onto a box. */
  magnet: boolean;
  /** Set when a straight <line> had to become a <path> to bend: select it. */
  replaced?: Element;
}

/** The path data as drawn now: a live page's saved shape, or the attribute. */
export function currentD(el: Element): string {
  const m = /path\(\s*(["'])(.*)\1\s*\)/.exec(inlineStyle(el, 'd'));
  return m ? m[2] : (el.getAttribute('d') ?? '');
}

/** Has the user fixed this arrow's shape on a live page? */
export function hasSavedShape(el: Element): boolean {
  return !!liveFor(el.ownerDocument) && inlineStyle(el, 'd') !== '';
}

/** Is this an arrow Tweakerr can reshape (an SVG line, or a path that isn't a closed shape)? */
export function isArrow(el: Element): boolean {
  if (el.namespaceURI !== SVG_NS) return false;
  if (el.localName === 'line') return !liveFor(el.ownerDocument); // a line's ends can't be a style rule
  if (el.localName !== 'path') return false;
  const segs = parsePath(currentD(el));
  return !!segs && isOpen(segs);
}

/** The tail, head and middle dots, in page px. */
export function arrowHandles(el: Element): Record<ArrowHandle, Point> | null {
  const m = (el as SVGGraphicsElement).getScreenCTM?.();
  if (!m) return null;
  const toPage = (p: Point): Point => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
  const geo = el as SVGGeometryElement;
  let a: Point, b: Point, mid: Point;
  if (el.localName === 'line') {
    const l = el as SVGLineElement;
    a = { x: l.x1.baseVal.value, y: l.y1.baseVal.value };
    b = { x: l.x2.baseVal.value, y: l.y2.baseVal.value };
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  } else {
    const segs = parsePath(currentD(el));
    if (!segs) return null;
    [a, b] = ends(segs);
    try {
      const at = geo.getPointAtLength(geo.getTotalLength() / 2);
      mid = { x: at.x, y: at.y };
    } catch {
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return { p1: toPage(a), p2: toPage(b), mid: toPage(mid) };
}

/** Start dragging one of an arrow's dots. Call inside an edit (a <line> may be replaced). */
export function arrowResizer(el: Element, handle: ArrowHandle): ArrowResizer | null {
  const dots = arrowHandles(el);
  if (!dots) return null;
  let target = el;
  let replaced: Element | undefined;
  if (el.localName === 'line' && handle === 'mid') {
    target = replaced = lineToPath(el as SVGLineElement);
  }
  const m = (target as SVGGraphicsElement).getScreenCTM?.();
  if (!m) return null;
  const inv = m.inverse();
  const toUser = (dx: number, dy: number): [number, number] => [inv.a * dx + inv.c * dy, inv.b * dx + inv.d * dy];
  const start = dots[handle];
  const common = { start, magnet: handle !== 'mid', replaced };

  if (target.localName === 'line') {
    const [ax, ay] = handle === 'p1' ? ['x1', 'y1'] : ['x2', 'y2'];
    const l = target as SVGLineElement;
    const x0 = (handle === 'p1' ? l.x1 : l.x2).baseVal.value;
    const y0 = (handle === 'p1' ? l.y1 : l.y2).baseVal.value;
    return {
      ...common,
      resize(dx, dy) {
        const [ux, uy] = toUser(dx, dy);
        setAttr(target, ax, String(r2(x0 + ux)));
        setAttr(target, ay, String(r2(y0 + uy)));
      },
    };
  }

  const segs = parsePath(currentD(target));
  if (!segs) return null;
  const live = !!liveFor(target.ownerDocument);
  const write = (s: Seg[]) => {
    const d = formatPath(s);
    if (live) setStyle(target, 'd', `path("${d}")`);
    else setAttr(target, 'd', d);
  };
  if (handle !== 'mid') {
    return {
      ...common,
      resize(dx, dy) {
        const [ux, uy] = toUser(dx, dy);
        write(moveEnd(segs, handle === 'p1' ? 'start' : 'end', ux, uy));
      },
    };
  }
  const midUser = (() => {
    const [a, b] = ends(segs);
    const geo = target as SVGGeometryElement;
    try {
      const at = geo.getPointAtLength(geo.getTotalLength() / 2);
      return { x: at.x, y: at.y };
    } catch {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  })();
  const straightMid = { x: (dots.p1.x + dots.p2.x) / 2, y: (dots.p1.y + dots.p2.y) / 2 };
  return {
    ...common,
    resize(dx, dy) {
      // Back near the straight line: make it straight.
      if (Math.hypot(start.x + dx - straightMid.x, start.y + dy - straightMid.y) < 6) return write(straighten(segs));
      const [ux, uy] = toUser(dx, dy);
      write(bendThrough(segs, { x: midUser.x + ux, y: midUser.y + uy }));
    },
  };
}

/** A straight <line> becomes a <path> with the same look, so it can bend. */
function lineToPath(line: SVGLineElement): SVGPathElement {
  const path = line.ownerDocument.createElementNS(SVG_NS, 'path') as SVGPathElement;
  for (const a of Array.from(line.attributes)) {
    if (!['x1', 'y1', 'x2', 'y2'].includes(a.name)) path.setAttribute(a.name, a.value);
  }
  const v = (n: SVGAnimatedLength) => r2(n.baseVal.value);
  path.setAttribute('d', `M ${v(line.x1)} ${v(line.y1)} L ${v(line.x2)} ${v(line.y2)}`);
  if (!path.hasAttribute('fill')) path.setAttribute('fill', 'none'); // a line never fills; a path would
  line.replaceWith(path);
  return path;
}
