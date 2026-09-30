/**
 * SVG arrowheads are <marker> elements shared by reference. To recolour one
 * arrow's head without repainting every other arrow, the marker is cloned
 * for this arrow first (only when it's shared).
 */
import { canHaveMarkers } from './kinds';
import { liveFor } from './live';
import { computed, setStyle } from './style';

export type MarkerEnd = 'start' | 'end';

const MARKER_SHAPES = 'path, polygon, polyline, circle, rect, ellipse, line';

export function markerId(el: Element, which: MarkerEnd | 'mid'): string | null {
  const v = computed(el, `marker-${which}`);
  if (!v || v === 'none') return null;
  const m = /#([^"')\s]+)["']?\s*\)\s*$/.exec(v);
  return m ? m[1] : null;
}

export function markerOf(el: Element, which: MarkerEnd): Element | null {
  const id = markerId(el, which);
  if (!id) return null;
  const m = el.ownerDocument.getElementById(id);
  return m && m.localName === 'marker' ? m : null;
}

export function markerShapes(marker: Element): Element[] {
  return Array.from(marker.querySelectorAll(MARKER_SHAPES));
}

/** The arrowhead's colour: its first shape's fill, or its stroke if unfilled. */
export function markerColor(marker: Element): string {
  const shape = markerShapes(marker)[0];
  if (!shape) return '';
  const fill = computed(shape, 'fill');
  if (fill && fill !== 'none') return fill;
  return computed(shape, 'stroke');
}

/** Does the arrowhead automatically follow the line colour (context-stroke)? */
export function followsLine(marker: Element): boolean {
  return markerShapes(marker).some((s) => /context-(stroke|fill)/.test(computed(s, 'fill') + computed(s, 'stroke')));
}

export function markerUsers(doc: Document, marker: Element): Element[] {
  const users: Element[] = [];
  for (const el of Array.from(doc.querySelectorAll('line, path, polyline, polygon'))) {
    if (!canHaveMarkers(el)) continue;
    for (const w of ['start', 'mid', 'end'] as const) {
      if (markerId(el, w) === marker.id) {
        users.push(el);
        break;
      }
    }
  }
  return users;
}

export function uniqueId(doc: Document, base: string): string {
  let id = base;
  for (let n = 2; doc.getElementById(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Give these elements their own arrowhead at one end, then return it.
 * Only copies when something outside the group also uses the marker (or a
 * group member uses it at another end); the whole group shares one copy.
 * Call inside an edit.
 */
export function ensureGroupMarker(els: Element[], which: MarkerEnd): Element[] {
  // A live page saves style rules, not new elements: recolour the shared arrowhead itself.
  if (els[0] && liveFor(els[0].ownerDocument)) {
    return [...new Set(els.map((el) => markerOf(el, which)).filter((m): m is Element => !!m))];
  }
  const byMarker = new Map<Element, Element[]>();
  for (const el of els) {
    const m = markerOf(el, which);
    if (m) byMarker.set(m, [...(byMarker.get(m) ?? []), el]);
  }
  const own: Element[] = [];
  for (const [marker, group] of byMarker) {
    const outsiders = markerUsers(marker.ownerDocument, marker).filter((u) => !group.includes(u));
    const otherEnd = which === 'start' ? 'end' : 'start';
    const selfShared = group.some((el) => markerId(el, otherEnd) === marker.id || markerId(el, 'mid') === marker.id);
    if (outsiders.length === 0 && !selfShared) {
      own.push(marker);
      continue;
    }
    const clone = marker.cloneNode(true) as Element;
    clone.id = uniqueId(marker.ownerDocument, `${marker.id}-${which}`);
    marker.after(clone);
    for (const el of group) setStyle(el, `marker-${which}`, `url(#${clone.id})`);
    own.push(clone);
  }
  return own;
}

export function setMarkerColor(marker: Element, color: string): void {
  for (const shape of markerShapes(marker)) {
    const fill = computed(shape, 'fill');
    const stroke = computed(shape, 'stroke');
    if (fill && fill !== 'none') setStyle(shape, 'fill', color);
    if (stroke && stroke !== 'none') setStyle(shape, 'stroke', color);
  }
}
