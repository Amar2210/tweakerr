/**
 * Read and write styles on page elements. On a live page (see live.ts) the
 * writes become style rules instead of inline styles, so every caller gets
 * that for free.
 */
import { liveFor } from './live';

type Styled = Element & ElementCSSInlineStyle;

export function computed(el: Element, prop: string): string {
  // A live page may have just redrawn this element: read the copy on the page
  // (a detached element has no styles, so X would read as 0 when moving Y).
  if (!el.isConnected) el = liveFor(el.ownerDocument)?.relocate(el) ?? el;
  const win = el.ownerDocument.defaultView;
  return win ? win.getComputedStyle(el).getPropertyValue(prop).trim() : '';
}

/** The value set on this element itself (its inline style, or its rule on a live page). */
export function inlineStyle(el: Element, prop: string): string {
  const live = liveFor(el.ownerDocument);
  if (live) return live.get(el, prop);
  return (el as Styled).style?.getPropertyValue(prop) ?? '';
}

/**
 * Set one CSS property as an inline style on this element only.
 * If a stylesheet rule marked `!important` wins over the inline value,
 * retry with `!important` so the user's edit actually shows up.
 * An empty value removes the inline property.
 */
export function setStyle(el: Element, prop: string, value: string): void {
  const live = liveFor(el.ownerDocument);
  if (live) return live.set(el, prop, value);
  const style = (el as Styled).style;
  if (!style) return;
  if (value === '') {
    style.removeProperty(prop);
    if (!style.cssText.trim()) el.removeAttribute('style');
    return;
  }
  // Already had to be !important: keep it. (Re-setting it without the flag
  // drops `!important` from the attribute while Chrome keeps painting the
  // old cascade result, so the screen and the saved file would disagree.)
  if (style.getPropertyPriority(prop) === 'important') {
    style.setProperty(prop, value, 'important');
    return;
  }
  const before = computed(el, prop);
  style.setProperty(prop, value);
  if (computed(el, prop) !== before) return;
  style.setProperty(prop, value, 'important');
  if (computed(el, prop) === before) {
    // Nothing was blocking it — the new value simply equals the old one.
    style.setProperty(prop, value);
  }
}

/** SVG attributes that are also CSS properties, so a live page can change them with a rule. */
const SVG_GEOMETRY = new Set(['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry']);
const SVG_PRESENTATION = new Set([
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'stroke-opacity', 'fill-opacity', 'opacity', 'marker-start', 'marker-mid', 'marker-end',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'visibility', 'display',
]);
const NO_CSS_X_Y = new Set(['text', 'tspan']); // their x/y are text positions, not CSS

/** Can this attribute be changed on a live page? */
export function liveAttr(el: Element, name: string): boolean {
  return (SVG_GEOMETRY.has(name) && !(NO_CSS_X_Y.has(el.localName) && (name === 'x' || name === 'y'))) || SVG_PRESENTATION.has(name);
}

/** Set or remove (null) an attribute. On a live page, only those with a CSS twin (x, fill…). */
export function setAttr(el: Element, name: string, value: string | null): void {
  const live = liveFor(el.ownerDocument);
  if (live) {
    if (!liveAttr(el, name)) {
      console.warn(`Tweakerr: can't change "${name}" on a page drawn by code.`);
      return;
    }
    const v = value ?? '';
    return live.set(el, name, SVG_GEOMETRY.has(name) && /^-?[\d.]+$/.test(v) ? `${v}px` : v);
  }
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/** An SVG number such as x, width or r: its attribute, or its current CSS value on a live page. */
export function svgNumber(el: Element, name: string, fallback = 0): number {
  const raw = liveFor(el.ownerDocument) && SVG_GEOMETRY.has(name) ? computed(el, name) : el.getAttribute(name);
  const v = parseFloat(raw ?? '');
  return Number.isFinite(v) ? v : fallback;
}
