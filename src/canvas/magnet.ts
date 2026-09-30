/**
 * The magnet: while an arrow's end is dragged, it snaps onto the edge of the
 * nearest box (a card, a shape), and most readily onto the middle of a side,
 * so reconnecting an arrow to a box that moved is a quick drag.
 */
import { isSvg } from '../doc/kinds';
import type { Box } from '../util/geometry';
import type { Point } from '../util/path';

export interface MagnetTarget {
  el: Element;
  box: Box;
  round: boolean;
}

export interface Snap {
  point: Point;
  target: MagnetTarget;
}

const SVG_TARGETS = new Set(['rect', 'circle', 'ellipse', 'polygon', 'image', 'foreignObject']);
const LIMIT = 4000;

/** Boxes an arrow end can snap to: things with a visible edge, not the page-sized containers. */
export function magnetTargets(doc: Document, arrow: Element): MagnetTarget[] {
  const win = doc.defaultView;
  const body = doc.body;
  if (!win || !body) return [];
  const vw = doc.documentElement.scrollWidth;
  const vh = doc.documentElement.scrollHeight;
  const out: MagnetTarget[] = [];
  const all = body.getElementsByTagName('*');
  for (let i = 0; i < all.length && i < LIMIT; i++) {
    const el = all[i];
    if (el === arrow || el.contains(arrow) || el.closest('defs, marker, script, style, head')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    let round = false;
    if (isSvg(el)) {
      if (!SVG_TARGETS.has(el.localName)) continue;
      round = el.localName === 'circle' || el.localName === 'ellipse';
    } else {
      if (r.width > vw * 0.7 && r.height > vh * 0.5) continue;
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      const framed = ['Top', 'Right', 'Bottom', 'Left'].some(
        (s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none',
      );
      if (!filled && !framed && cs.backgroundImage === 'none' && cs.boxShadow === 'none') continue;
    }
    out.push({ el, box: { left: r.left, top: r.top, width: r.width, height: r.height }, round });
  }
  return out;
}

/**
 * The edge point to snap `p` to, if one is within `reach` (page px). The
 * middle of a side pulls from further away than the rest of the edge.
 */
export function magnetSnap(p: Point, targets: MagnetTarget[], reach: number): Snap | null {
  let best: (Snap & { score: number; area: number }) | null = null;
  for (const t of targets) {
    const { left, top, width, height } = t.box;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const candidates: { point: Point; score: number }[] = [];
    for (const m of [
      { x: cx, y: top },
      { x: left + width, y: cy },
      { x: cx, y: top + height },
      { x: left, y: cy },
    ]) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d <= reach * 1.8) candidates.push({ point: m, score: d * 0.55 });
    }
    const edge = t.round ? onEllipse(p, cx, cy, width / 2, height / 2) : onRect(p, t.box);
    const d = Math.hypot(p.x - edge.x, p.y - edge.y);
    if (d <= reach) candidates.push({ point: edge, score: d });
    for (const c of candidates) {
      const area = width * height;
      // Near-ties go to the smaller box: a card before the cell around it.
      if (!best || c.score < best.score - 1 || (Math.abs(c.score - best.score) <= 1 && area < best.area)) {
        best = { point: c.point, target: t, score: c.score, area };
      }
    }
  }
  return best && { point: best.point, target: best.target };
}

/** Nearest point on a box's outline (from inside or outside). */
function onRect(p: Point, b: Box): Point {
  const r = b.left + b.width;
  const bt = b.top + b.height;
  const x = Math.min(r, Math.max(b.left, p.x));
  const y = Math.min(bt, Math.max(b.top, p.y));
  if (x !== p.x || y !== p.y) return { x, y }; // outside: the clamp is on the outline
  // Inside: out to the nearest side.
  const d = [p.x - b.left, r - p.x, p.y - b.top, bt - p.y];
  const i = d.indexOf(Math.min(...d));
  return i === 0 ? { x: b.left, y: p.y } : i === 1 ? { x: r, y: p.y } : i === 2 ? { x: p.x, y: b.top } : { x: p.x, y: bt };
}

/** Point on an ellipse's outline in the direction of `p` from its centre. */
function onEllipse(p: Point, cx: number, cy: number, rx: number, ry: number): Point {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const k = Math.hypot(dx / rx, dy / ry);
  if (!k) return { x: cx + rx, y: cy };
  return { x: cx + dx / k, y: cy + dy / k };
}
