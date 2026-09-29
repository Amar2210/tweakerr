/**
 * SVG arrowheads are <marker> elements shared by reference. To recolour one
 * arrow's head without repainting every other arrow, the marker is cloned
 * for this arrow first (only when it's shared).
 */
import { canHaveMarkers } from './kinds';
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

/** Give `el` its own copy of its start/end marker if others share it. Call inside an edit. */
export function ensureOwnMarker(el: Element, which: MarkerEnd): Element | null {
  const marker = markerOf(el, which);
  if (!marker) return null;
  const others = markerUsers(el.ownerDocument, marker).filter((u) => u !== el);
  // Also shared if this element uses the same marker at its other end.
  const otherEnd = which === 'start' ? 'end' : 'start';
  const selfShared = markerId(el, otherEnd) === marker.id || markerId(el, 'mid') === marker.id;
  if (others.length === 0 && !selfShared) return marker;
  const clone = marker.cloneNode(true) as Element;
  clone.id = uniqueId(el.ownerDocument, `${marker.id}-${which}`);
  marker.after(clone);
  setStyle(el, `marker-${which}`, `url(#${clone.id})`);
  return clone;
}

export function setMarkerColor(marker: Element, color: string): void {
  for (const shape of markerShapes(marker)) {
    const fill = computed(shape, 'fill');
    const stroke = computed(shape, 'stroke');
    if (fill && fill !== 'none') setStyle(shape, 'fill', color);
    if (stroke && stroke !== 'none') setStyle(shape, 'stroke', color);
  }
}
