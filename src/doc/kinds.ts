/** Classify page elements so the canvas and panel know what applies. */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function isSvg(el: Element): boolean {
  return el.namespaceURI === SVG_NS;
}

/** An outer <svg> sitting in HTML: behaves like a box for layout purposes. */
export function isSvgRoot(el: Element): boolean {
  return isSvg(el) && el.localName === 'svg' && !(el.parentElement && isSvg(el.parentElement));
}

/** Anything inside an <svg>: shapes, groups, text. Moved via the transform attribute. */
export function isSvgChild(el: Element): boolean {
  return isSvg(el) && !isSvgRoot(el);
}

const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image', 'use', 'g', 'foreignObject', 'tspan', 'svg']);
export function isSvgShape(el: Element): boolean {
  return isSvgChild(el) && SHAPES.has(el.localName);
}

const LINEY = new Set(['line', 'polyline', 'path']);
export function canHaveMarkers(el: Element): boolean {
  return isSvg(el) && (LINEY.has(el.localName) || el.localName === 'polygon');
}

export function isLineLike(el: Element): boolean {
  return isSvg(el) && LINEY.has(el.localName);
}

/** Top-level page nodes that can't be moved, deleted or duplicated. */
export function isStructural(el: Element): boolean {
  const n = el.localName;
  return n === 'html' || n === 'body' || n === 'head';
}

const VOID_OR_NO_TEXT = new Set(['img', 'input', 'br', 'hr', 'video', 'audio', 'canvas', 'iframe', 'svg', 'select', 'textarea', 'picture', 'object', 'embed']);

/** Can the user double-click to type into this element? */
export function isTextEditable(el: Element): boolean {
  if (isSvg(el) || isStructural(el)) return false;
  if (VOID_OR_NO_TEXT.has(el.localName)) return false;
  return (el.textContent ?? '').trim().length > 0 || el.children.length === 0;
}

export type ResizeKind = 'box' | 'svg-rect' | 'circle' | 'ellipse' | 'line' | 'none';

export function resizeKind(el: Element): ResizeKind {
  if (isStructural(el)) return 'none';
  if (!isSvg(el) || isSvgRoot(el)) return 'box';
  switch (el.localName) {
    case 'rect':
    case 'image':
    case 'foreignObject':
    case 'use':
    case 'svg':
      return 'svg-rect';
    case 'circle':
      return 'circle';
    case 'ellipse':
      return 'ellipse';
    case 'line':
      return 'line';
    default:
      return 'none';
  }
}

/** A short human label: "div.card", "h2#title", "line". */
export function describe(el: Element): string {
  let s = el.localName;
  if (el.id) s += `#${el.id}`;
  else {
    const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)[0];
    if (cls) s += `.${cls}`;
  }
  return s;
}

/** First bit of an element's own text, for the layers list. */
export function textSnippet(el: Element, max = 28): string {
  let t = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent;
    if (t.length > max) break;
  }
  t = t.replace(/\s+/g, ' ').trim();
  if (!t && el.children.length === 0) t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
