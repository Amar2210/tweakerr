export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Guide {
  /** 'v' = vertical line at x, 'h' = horizontal line at y. */
  axis: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const xs = (b: Box) => [b.left, b.left + b.width / 2, b.left + b.width];
const ys = (b: Box) => [b.top, b.top + b.height / 2, b.top + b.height];

/**
 * Nudge a moving box so its left/centre/right (and top/middle/bottom)
 * line up with the nearest matching edge of any target box, within
 * `threshold`. Returns the correction to add and the guide lines to draw.
 */
export function snapBox(moving: Box, targets: Box[], threshold: number): SnapResult {
  let bestX: { d: number; pos: number } | null = null;
  let bestY: { d: number; pos: number } | null = null;
  const mx = xs(moving);
  const my = ys(moving);

  for (const t of targets) {
    for (const tx of xs(t)) {
      for (const x of mx) {
        const d = tx - x;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: tx };
      }
    }
    for (const ty of ys(t)) {
      for (const y of my) {
        const d = ty - y;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: ty };
      }
    }
  }

  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  const snapped: Box = { ...moving, left: moving.left + dx, top: moving.top + dy };
  const guides: Guide[] = [];
  const eps = 0.5;

  if (bestX) {
    const pos = bestX.pos;
    let from = snapped.top;
    let to = snapped.top + snapped.height;
    for (const t of targets) {
      if (xs(t).some((v) => Math.abs(v - pos) < eps)) {
        from = Math.min(from, t.top);
        to = Math.max(to, t.top + t.height);
      }
    }
    guides.push({ axis: 'v', pos, from, to });
  }
  if (bestY) {
    const pos = bestY.pos;
    let from = snapped.left;
    let to = snapped.left + snapped.width;
    for (const t of targets) {
      if (ys(t).some((v) => Math.abs(v - pos) < eps)) {
        from = Math.min(from, t.left);
        to = Math.max(to, t.left + t.width);
      }
    }
    guides.push({ axis: 'h', pos, from, to });
  }
  return { dx, dy, guides };
}

/** Parse a computed CSS `translate` value ("none", "10px", "10px 20px"). */
export function parseCssTranslate(value: string | null | undefined): [number, number] {
  if (!value || value === 'none') return [0, 0];
  const parts = value.trim().split(/\s+/).map((p) => parseFloat(p) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0];
}

export function formatCssTranslate(x: number, y: number): string {
  const rx = r2(x);
  const ry = r2(y);
  if (rx === 0 && ry === 0) return '';
  return `${rx}px ${ry}px`;
}

const LEADING_TRANSLATE = /^\s*translate\(\s*(-?[\d.eE+-]+)(?:[\s,]+(-?[\d.eE+-]+))?\s*\)\s*/;

/** Read the leading translate() of an SVG transform attribute. */
export function readSvgTranslate(transform: string | null): [number, number] {
  const m = transform ? LEADING_TRANSLATE.exec(transform) : null;
  if (!m) return [0, 0];
  return [parseFloat(m[1]) || 0, parseFloat(m[2] ?? '0') || 0];
}

/**
 * Shift an SVG element by (dx, dy) in its parent's coordinates by updating
 * (or prepending) a leading translate() — existing rotate/scale are kept.
 */
export function addSvgTranslate(transform: string | null, dx: number, dy: number): string {
  const current = transform ?? '';
  const m = LEADING_TRANSLATE.exec(current);
  const rest = m ? current.slice(m[0].length) : current.trim();
  const [bx, by] = m ? [parseFloat(m[1]) || 0, parseFloat(m[2] ?? '0') || 0] : [0, 0];
  const x = r2(bx + dx);
  const y = r2(by + dy);
  const lead = x === 0 && y === 0 ? '' : `translate(${x} ${y})`;
  return [lead, rest].filter(Boolean).join(' ');
}

export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
