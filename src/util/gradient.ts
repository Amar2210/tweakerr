/**
 * Read and write CSS gradients such as
 *   linear-gradient(135deg, rgb(29, 42, 91), rgb(47, 111, 237) 80%)
 * so the panel can offer one colour picker per colour stop.
 */

export interface GradientStop {
  color: string;
  /** Position(s) after the colour, e.g. "30%" or "10% 40%"; '' when unset. */
  pos: string;
}

/** A bare position between two stops (a colour hint), kept as written. */
export interface GradientHint {
  hint: string;
}

export type GradientKind = 'linear' | 'radial' | 'conic';

export interface Gradient {
  repeating: boolean;
  kind: GradientKind;
  /** Direction or shape part before the stops ("135deg", "circle at 25% 30%"); '' when absent. */
  head: string;
  items: (GradientStop | GradientHint)[];
}

export const isStop = (i: GradientStop | GradientHint): i is GradientStop => 'color' in i;

/** Split on commas that aren't inside parentheses. */
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out.filter((p) => p !== '');
}

const COLOR_FN = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/i;
const HEX = /^#[0-9a-f]{3,8}(?![0-9a-z])/i;

/** The colour at the start of a stop ("rgb(1, 2, 3) 40%" -> "rgb(1, 2, 3)"), or null. */
function leadingColor(arg: string): string | null {
  const fn = COLOR_FN.exec(arg) ?? HEX.exec(arg);
  if (fn) return fn[0];
  const word = /^[a-z]+/i.exec(arg)?.[0];
  if (!word) return null;
  const w = word.toLowerCase();
  if (w === 'transparent' || w === 'currentcolor') return word;
  // Named colours ("red"); direction words like "to" or "circle" are not colours.
  return typeof CSS !== 'undefined' && CSS.supports?.('color', w) ? word : null;
}

export function parseGradient(layer: string): Gradient | null {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i.exec(layer.trim());
  if (!m) return null;
  let head = '';
  const items: Gradient['items'] = [];
  splitTopLevel(m[3]).forEach((arg, i) => {
    const color = leadingColor(arg);
    if (color) items.push({ color, pos: arg.slice(color.length).trim() });
    else if (i === 0) head = arg;
    else items.push({ hint: arg });
  });
  if (items.filter(isStop).length < 1) return null;
  return { repeating: !!m[1], kind: m[2].toLowerCase() as GradientKind, head, items };
}

export function formatGradient(g: Gradient): string {
  const parts = g.items.map((i) => (isStop(i) ? [i.color, i.pos].filter(Boolean).join(' ') : i.hint));
  if (g.head) parts.unshift(g.head);
  return `${g.repeating ? 'repeating-' : ''}${g.kind}-gradient(${parts.join(', ')})`;
}

/** The layers of a `background-image` value, and which one is the first gradient. */
export function gradientLayer(backgroundImage: string): { layers: string[]; index: number; gradient: Gradient } | null {
  if (!backgroundImage || backgroundImage === 'none') return null;
  const layers = splitTopLevel(backgroundImage);
  for (let i = 0; i < layers.length; i++) {
    const gradient = parseGradient(layers[i]);
    if (gradient) return { layers, index: i, gradient };
  }
  return null;
}

const SIDES: Record<string, number> = {
  'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270,
  'to top right': 45, 'to right top': 45, 'to bottom right': 135, 'to right bottom': 135,
  'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315,
};

/** A linear gradient's direction in degrees (no direction = 180, i.e. top to bottom), or null. */
export function headToAngle(head: string): number | null {
  const h = head.trim().toLowerCase();
  if (h === '') return 180;
  if (h in SIDES) return SIDES[h];
  const m = /^(-?[\d.]+)(deg|turn|rad|grad)$/.exec(h);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const deg = m[2] === 'deg' ? n : m[2] === 'turn' ? n * 360 : m[2] === 'rad' ? (n * 180) / Math.PI : n * 0.9;
  return Math.round(deg * 100) / 100;
}
