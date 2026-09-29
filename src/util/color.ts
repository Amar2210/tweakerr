export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const RGB_RE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;
const HEX_RE = /^#([0-9a-f]{3,8})$/i;

/** Parse the colour formats computed styles and users commonly produce. */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = HEX_RE.exec(s);
  if (hex) return parseHex(hex[1]);
  const m = RGB_RE.exec(s);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]), a: clamp01(a) };
  }
  return null;
}

function parseHex(h: string): RGBA | null {
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 3) : 1 };
}

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Resolve any CSS colour (oklch, hsl, named, color-mix...) to RGBA.
 * Falls back to painting one pixel on a canvas, which the browser
 * converts for us; returns null outside a real browser.
 */
export function resolveColor(input: string): RGBA | null {
  const quick = parseColor(input);
  if (quick) return quick;
  if (probe === undefined) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probe = c.getContext('2d', { willReadFrequently: true });
    } catch {
      probe = null;
    }
  }
  if (!probe || typeof CSS === 'undefined' || !CSS.supports('color', input)) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = input;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: round(a / 255, 3) };
}

export function toHex({ r, g, b }: RGBA): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Short, human-friendly form: #rrggbb when opaque, rgba() otherwise. */
export function formatColor(c: RGBA): string {
  if (c.a >= 1) return toHex(c);
  if (c.a <= 0) return 'transparent';
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${round(c.a, 3)})`;
}

export function isTransparent(input: string): boolean {
  const c = parseColor(input);
  return !!c && c.a === 0;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
