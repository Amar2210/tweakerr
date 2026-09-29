import { formatColor, resolveColor } from '../util/color';

const MAX_SCAN = 3000;

/** The colours this page already uses, most frequent first — to stay on palette. */
export function collectPalette(doc: Document, limit = 24): string[] {
  const win = doc.defaultView;
  if (!win || !doc.body) return [];
  const counts = new Map<string, number>();
  const add = (v: string) => {
    if (!v || v === 'none' || v.startsWith('url(') || v.includes('context-')) return;
    const c = resolveColor(v);
    if (!c || c.a === 0) return;
    const key = formatColor(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const els = Array.from(doc.body.querySelectorAll('*')).slice(0, MAX_SCAN);
  for (const el of [doc.body, ...els]) {
    const cs = win.getComputedStyle(el);
    add(cs.color);
    add(cs.backgroundColor);
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') add(cs.borderTopColor);
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      add(cs.fill);
      add(cs.stroke);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c]) => c);
}

const fontCache = new WeakMap<Document, string[]>();

/** The font lists (font-family values) this page uses. Cached per document. */
export function collectFonts(doc: Document): string[] {
  const cached = fontCache.get(doc);
  if (cached) return cached;
  const win = doc.defaultView;
  const seen = new Set<string>();
  if (win && doc.body) {
    for (const el of [doc.body, ...Array.from(doc.body.querySelectorAll('*')).slice(0, MAX_SCAN)]) {
      const stack = win.getComputedStyle(el).fontFamily;
      if (stack) seen.add(stack);
    }
  }
  const fonts = [...seen];
  fontCache.set(doc, fonts);
  return fonts;
}
