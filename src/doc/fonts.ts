/**
 * Fonts. In CSS a font is a fallback list ("Segoe UI", Arial, sans-serif):
 * the browser uses the first one that's installed. The panel shows and
 * offers single font names, and writes a sensible list behind the scenes.
 */

export type Generic = 'sans-serif' | 'serif' | 'monospace' | 'cursive';

/** Fonts found on most Windows and Mac machines, with the kind to fall back to. */
export const COMMON_FONTS: { name: string; generic: Generic }[] = [
  { name: 'Arial', generic: 'sans-serif' },
  { name: 'Helvetica', generic: 'sans-serif' },
  { name: 'Segoe UI', generic: 'sans-serif' },
  { name: 'Calibri', generic: 'sans-serif' },
  { name: 'Verdana', generic: 'sans-serif' },
  { name: 'Tahoma', generic: 'sans-serif' },
  { name: 'Trebuchet MS', generic: 'sans-serif' },
  { name: 'Gill Sans', generic: 'sans-serif' },
  { name: 'Impact', generic: 'sans-serif' },
  { name: 'Georgia', generic: 'serif' },
  { name: 'Times New Roman', generic: 'serif' },
  { name: 'Cambria', generic: 'serif' },
  { name: 'Palatino Linotype', generic: 'serif' },
  { name: 'Garamond', generic: 'serif' },
  { name: 'Courier New', generic: 'monospace' },
  { name: 'Consolas', generic: 'monospace' },
  { name: 'Lucida Console', generic: 'monospace' },
  { name: 'Comic Sans MS', generic: 'cursive' },
];

/** CSS's built-in font kinds: always available. */
export const GENERIC_FONTS = ['system-ui', 'sans-serif', 'serif', 'monospace', 'ui-monospace', 'cursive'];

const isGeneric = (name: string) => GENERIC_FONTS.includes(name.toLowerCase()) || ['ui-sans-serif', 'ui-serif', 'fantasy', 'emoji', 'math'].includes(name.toLowerCase());

/** `"Segoe UI", Arial, sans-serif` -> ["Segoe UI", "Arial", "sans-serif"]. */
export function families(stack: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  for (const c of stack) {
    if (quote) {
      if (c === quote) quote = '';
      else cur += c;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/** The font a stack asks for first: what the panel shows. */
export function primaryFamily(stack: string): string {
  return families(stack)[0] ?? '';
}

/** Quote a family name when CSS needs it (spaces, digits, odd characters). */
export function quoteFamily(name: string): string {
  if (isGeneric(name) || /^-?[a-z_][a-z0-9_-]*$/i.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

/**
 * Turn a chosen font name into a full font-family value.
 * `known` maps a name to the list the page already uses for it, so picking
 * "Inter" keeps the page's own "Inter, -apple-system, …" fallbacks.
 */
export function stackFor(name: string, known: Map<string, string> = new Map()): string {
  const n = name.trim();
  if (!n) return '';
  if (n.includes(',')) return n; // typed a whole list: use it as written
  const page = known.get(n.toLowerCase());
  if (page) return page;
  if (n.toLowerCase() === 'system-ui') return 'system-ui, sans-serif';
  if (isGeneric(n)) return n;
  const generic = COMMON_FONTS.find((f) => f.name.toLowerCase() === n.toLowerCase())?.generic ?? 'sans-serif';
  return `${quoteFamily(n)}, ${generic}`;
}

/** Each named font this page's stacks mention, mapped (lower-case) to the stack it leads. */
export function pageFamilies(stacks: string[]): { names: string[]; known: Map<string, string> } {
  const names: string[] = [];
  const known = new Map<string, string>();
  for (const stack of stacks) {
    families(stack).forEach((name, i) => {
      // Vendor names like "-apple-system" and CSS keywords aren't fonts to pick.
      if (name.startsWith('-') || isGeneric(name)) return;
      const key = name.toLowerCase();
      if (!names.some((n) => n.toLowerCase() === key)) names.push(name);
      if (i === 0 && !known.has(key)) known.set(key, stack);
    });
  }
  return { names, known };
}
