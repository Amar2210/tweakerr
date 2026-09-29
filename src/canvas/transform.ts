import { isStructural, isSvgChild, resizeKind } from '../doc/kinds';
import { computed, setAttr, setStyle } from '../doc/style';
import { addSvgTranslate, formatCssTranslate, parseCssTranslate, r2 } from '../util/geometry';

/**
 * Movers and resizers apply an absolute offset from where the gesture
 * started, so callers can simply pass the current pointer delta each frame.
 * All deltas are in page pixels.
 */
export interface Mover {
  move(dx: number, dy: number): void;
}

export interface Resizer {
  resize(dx: number, dy: number, keepRatio: boolean): void;
}

export function createMover(el: Element): Mover | null {
  if (isStructural(el)) return null;

  if (isSvgChild(el)) {
    // Move in the parent's coordinate system via the transform attribute,
    // so the file stays valid SVG for any viewer.
    const parent = el.parentElement as unknown as SVGGraphicsElement | null;
    const ctm = parent?.getScreenCTM?.();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const base = el.getAttribute('transform');
    return {
      move(dx, dy) {
        const ux = inv.a * dx + inv.c * dy;
        const uy = inv.b * dx + inv.d * dy;
        setAttr(el, 'transform', addSvgTranslate(base, ux, uy) || null);
      },
    };
  }

  // HTML (and outer <svg>): the CSS `translate` property shifts the box
  // visually without disturbing the layout around it, and composes with
  // any existing `transform`.
  const [bx, by] = parseCssTranslate(computed(el, 'translate'));
  const inline = computed(el, 'display') === 'inline';
  let blocked = false;
  return {
    move(dx, dy) {
      if (inline && !blocked) {
        setStyle(el, 'display', 'inline-block'); // translate ignores plain inline boxes
        blocked = true;
      }
      setStyle(el, 'translate', formatCssTranslate(bx + dx, by + dy));
    },
  };
}

export function createResizer(el: Element, handle: string): Resizer | null {
  switch (resizeKind(el)) {
    case 'box':
      return boxResizer(el, handle);
    case 'svg-rect':
      return svgRectResizer(el, handle);
    case 'circle':
      return radiusResizer(el, handle, ['r']);
    case 'ellipse':
      return radiusResizer(el, handle, ['rx', 'ry']);
    case 'line':
      return lineResizer(el as SVGLineElement, handle);
    default:
      return null;
  }
}

/** Apply a handle drag to a width/height pair, optionally keeping the aspect ratio. */
export function resizeDims(
  w0: number,
  h0: number,
  handle: string,
  dx: number,
  dy: number,
  keepRatio: boolean,
): { w: number; h: number } {
  let w = w0;
  let h = h0;
  if (handle.includes('e')) w += dx;
  if (handle.includes('w')) w -= dx;
  if (handle.includes('s')) h += dy;
  if (handle.includes('n')) h -= dy;
  if (keepRatio && w0 > 0 && h0 > 0) {
    const ratio = w0 / h0;
    const horiz = handle.includes('e') || handle.includes('w');
    const vert = handle.includes('n') || handle.includes('s');
    if (horiz && (!vert || Math.abs(w / w0 - 1) >= Math.abs(h / h0 - 1))) h = w / ratio;
    else w = h * ratio;
  }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function boxResizer(el: Element, handle: string): Resizer {
  const rect = el.getBoundingClientRect();
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const border = cs.boxSizing === 'border-box';
  const extraX = border ? 0 : px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  const extraY = border ? 0 : px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  const [bx, by] = parseCssTranslate(cs.translate);
  const inline = cs.display === 'inline';
  const horiz = /[ew]/.test(handle);
  const vert = /[ns]/.test(handle);
  let blocked = false;

  return {
    resize(dx, dy, keepRatio) {
      if (inline && !blocked) {
        setStyle(el, 'display', 'inline-block');
        blocked = true;
      }
      const { w, h } = resizeDims(rect.width, rect.height, handle, dx, dy, keepRatio);
      if (horiz || keepRatio) setStyle(el, 'width', `${r2(Math.max(0, w - extraX))}px`);
      if (vert || keepRatio) setStyle(el, 'height', `${r2(Math.max(0, h - extraY))}px`);
      // Dragging a left/top handle should keep the opposite edge still.
      if (handle.includes('w') || handle.includes('n')) {
        const tx = bx + (handle.includes('w') ? rect.width - w : 0);
        const ty = by + (handle.includes('n') ? rect.height - h : 0);
        setStyle(el, 'translate', formatCssTranslate(tx, ty));
      }
    },
  };
}

/** Convert a page-pixel delta into the element's own SVG user units. */
function toUser(el: Element): ((dx: number, dy: number) => [number, number]) | null {
  const ctm = (el as SVGGraphicsElement).getScreenCTM?.();
  if (!ctm) return null;
  const inv = ctm.inverse();
  return (dx, dy) => [inv.a * dx + inv.c * dy, inv.b * dx + inv.d * dy];
}

const num = (el: Element, name: string) => parseFloat(el.getAttribute(name) ?? '') || 0;

function svgRectResizer(el: Element, handle: string): Resizer | null {
  const conv = toUser(el);
  if (!conv) return null;
  const bbox = (el as SVGGraphicsElement).getBBox?.();
  const x0 = num(el, 'x');
  const y0 = num(el, 'y');
  const w0 = el.hasAttribute('width') ? num(el, 'width') : bbox?.width ?? 0;
  const h0 = el.hasAttribute('height') ? num(el, 'height') : bbox?.height ?? 0;
  return {
    resize(dx, dy, keepRatio) {
      const [ux, uy] = conv(dx, dy);
      const { w, h } = resizeDims(w0, h0, handle, ux, uy, keepRatio);
      setAttr(el, 'width', String(r2(w)));
      setAttr(el, 'height', String(r2(h)));
      if (handle.includes('w')) setAttr(el, 'x', String(r2(x0 + (w0 - w))));
      if (handle.includes('n')) setAttr(el, 'y', String(r2(y0 + (h0 - h))));
    },
  };
}

function radiusResizer(el: Element, handle: string, attrs: ['r'] | ['rx', 'ry']): Resizer | null {
  const conv = toUser(el);
  if (!conv) return null;
  const start = attrs.map((a) => num(el, a));
  return {
    resize(dx, dy, keepRatio) {
      const [ux, uy] = conv(dx, dy);
      const sx = handle.includes('e') ? ux : handle.includes('w') ? -ux : 0;
      const sy = handle.includes('s') ? uy : handle.includes('n') ? -uy : 0;
      if (attrs.length === 1) {
        const d = sx && sy ? (sx + sy) / 2 : sx || sy;
        setAttr(el, 'r', String(r2(Math.max(0.5, start[0] + d))));
      } else {
        let rx = Math.max(0.5, start[0] + sx);
        let ry = Math.max(0.5, start[1] + sy);
        if (keepRatio && start[0] > 0 && start[1] > 0) {
          const k = Math.max(rx / start[0], ry / start[1]);
          rx = start[0] * k;
          ry = start[1] * k;
        }
        setAttr(el, 'rx', String(r2(rx)));
        setAttr(el, 'ry', String(r2(ry)));
      }
    },
  };
}

function lineResizer(el: SVGLineElement, handle: string): Resizer | null {
  const conv = toUser(el);
  if (!conv) return null;
  const [ax, ay] = handle === 'p1' ? ['x1', 'y1'] : ['x2', 'y2'];
  const x0 = num(el, ax);
  const y0 = num(el, ay);
  return {
    resize(dx, dy) {
      const [ux, uy] = conv(dx, dy);
      setAttr(el, ax, String(r2(x0 + ux)));
      setAttr(el, ay, String(r2(y0 + uy)));
    },
  };
}
