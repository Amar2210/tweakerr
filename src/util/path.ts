/**
 * SVG path data (the `d` of a <path>) as a list of absolute segments, so an
 * arrow can be reshaped: its ends dragged, or its middle bent into a curve.
 * Relative commands become absolute; H/V become L, S becomes C and T becomes Q.
 */

export interface Seg {
  c: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z';
  /** Points as x,y pairs; the last pair is where the segment ends (none for Z). */
  p: number[];
  /** Arc radii, rotation and flags. */
  arc?: [number, number, number, number, number];
}

export type Point = { x: number; y: number };

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Parse path data; null if it isn't valid. */
export function parsePath(d: string): Seg[] | null {
  const out: Seg[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const num = (): number | null => {
    skip();
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) return null;
    i = NUM.lastIndex;
    return parseFloat(m[0]);
  };
  const flag = (): number | null => {
    skip();
    const ch = d[i];
    if (ch !== '0' && ch !== '1') return null;
    i++;
    return +ch;
  };

  let x = 0, y = 0, sx = 0, sy = 0;
  let lastC: [number, number] | null = null; // last cubic control, for S
  let lastQ: [number, number] | null = null; // last quadratic control, for T
  let cmd = '';
  for (;;) {
    skip();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) {
      cmd = d[i++];
      if (!(cmd.toUpperCase() in ARGS)) return null;
    } else if (!cmd || cmd === 'z' || cmd === 'Z') {
      return null;
    }
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === 'Z') {
      out.push({ c: 'Z', p: [] });
      x = sx;
      y = sy;
      lastC = lastQ = null;
      continue;
    }
    const a: number[] = [];
    for (let k = 0; k < ARGS[up]; k++) {
      const v = up === 'A' && (k === 3 || k === 4) ? flag() : num();
      if (v === null) return null;
      a.push(v);
    }
    const ax = (v: number) => (rel ? x + v : v);
    const ay = (v: number) => (rel ? y + v : v);
    let seg: Seg;
    switch (up) {
      case 'M':
        seg = { c: 'M', p: [ax(a[0]), ay(a[1])] };
        sx = seg.p[0];
        sy = seg.p[1];
        cmd = rel ? 'l' : 'L'; // more pairs after a move are lines
        break;
      case 'L':
        seg = { c: 'L', p: [ax(a[0]), ay(a[1])] };
        break;
      case 'H':
        seg = { c: 'L', p: [ax(a[0]), y] };
        break;
      case 'V':
        seg = { c: 'L', p: [x, ay(a[0])] };
        break;
      case 'C':
        seg = { c: 'C', p: [ax(a[0]), ay(a[1]), ax(a[2]), ay(a[3]), ax(a[4]), ay(a[5])] };
        break;
      case 'S': {
        const [c1x, c1y] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        seg = { c: 'C', p: [c1x, c1y, ax(a[0]), ay(a[1]), ax(a[2]), ay(a[3])] };
        break;
      }
      case 'Q':
        seg = { c: 'Q', p: [ax(a[0]), ay(a[1]), ax(a[2]), ay(a[3])] };
        break;
      case 'T': {
        const [cx, cy] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
        seg = { c: 'Q', p: [cx, cy, ax(a[0]), ay(a[1])] };
        break;
      }
      default: // A
        seg = { c: 'A', p: [ax(a[5]), ay(a[6])], arc: [a[0], a[1], a[2], a[3], a[4]] };
    }
    out.push(seg);
    const n = seg.p.length;
    x = seg.p[n - 2];
    y = seg.p[n - 1];
    lastC = seg.c === 'C' ? [seg.p[2], seg.p[3]] : null;
    lastQ = seg.c === 'Q' ? [seg.p[0], seg.p[1]] : null;
  }
  return out.length && out[0].c === 'M' ? out : null;
}

const f = (n: number) => String(Math.round(n * 100) / 100);

export function formatPath(segs: Seg[]): string {
  return segs
    .map((s) => {
      if (s.c === 'Z') return 'Z';
      if (s.c === 'A') return `A ${s.arc!.map(f).join(' ')} ${s.p.map(f).join(' ')}`;
      return `${s.c} ${s.p.map(f).join(' ')}`;
    })
    .join(' ');
}

/** Is it an open line (an arrow), not a closed shape? */
export function isOpen(segs: Seg[]): boolean {
  return !segs.some((s) => s.c === 'Z') && segs.filter((s) => s.c === 'M').length === 1 && segs.length > 1;
}

/** Where the path starts and ends. */
export function ends(segs: Seg[]): [Point, Point] {
  const first = segs[0].p;
  const last = [...segs].reverse().find((s) => s.p.length)!.p;
  return [
    { x: first[0], y: first[1] },
    { x: last[last.length - 2], y: last[last.length - 1] },
  ];
}

/**
 * Move one end by (dx, dy) and keep the shape: every point moves by how far
 * along the line from the other end it is, so bends stay bends and the
 * other end stays put.
 */
export function moveEnd(segs: Seg[], which: 'start' | 'end', dx: number, dy: number): Seg[] {
  const [a, b] = ends(segs);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const last = segs.length - 1;
  return segs.map((s, si) => {
    const p = s.p.slice();
    for (let k = 0; k < p.length; k += 2) {
      const isEnd = which === 'start' ? si === 0 && k === 0 : si === last && k === p.length - 2;
      let t = len2 ? ((p[k] - a.x) * vx + (p[k + 1] - a.y) * vy) / len2 : 0;
      t = Math.min(1, Math.max(0, t));
      const w = isEnd ? 1 : which === 'end' ? t : 1 - t;
      p[k] += w * dx;
      p[k + 1] += w * dy;
    }
    return { ...s, p };
  });
}

/** A straight line between the path's ends. */
export function straighten(segs: Seg[]): Seg[] {
  const [a, b] = ends(segs);
  return [{ c: 'M', p: [a.x, a.y] }, { c: 'L', p: [b.x, b.y] }];
}

/** One smooth curve from end to end that passes through `m` halfway along. */
export function bendThrough(segs: Seg[], m: Point): Seg[] {
  const [a, b] = ends(segs);
  // A quadratic curve is at (a + 2c + b) / 4 halfway: solve for the control point c.
  const cx = 2 * m.x - (a.x + b.x) / 2;
  const cy = 2 * m.y - (a.y + b.y) / 2;
  return [{ c: 'M', p: [a.x, a.y] }, { c: 'Q', p: [cx, cy, b.x, b.y] }];
}
