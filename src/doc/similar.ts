/**
 * "Select all like this": find the elements that look like the given one,
 * so a whole family (every card, every arrow, everything in this blue) can
 * be changed in one go.
 */
import { isLineLike, isStructural, isSvgChild } from './kinds';
import { computed } from './style';

const MAX_SCAN = 5000;

export interface Match {
  /** Button text, e.g. "Same type" or "Same border colour". */
  label: string;
  /** What is shared, for the tooltip, e.g. "div.card" or "#4a67d6". */
  detail: string;
  elements: Element[];
}

function candidates(el: Element): Element[] {
  const body = el.ownerDocument.body;
  if (!body) return [];
  return Array.from(body.querySelectorAll('*'))
    .slice(0, MAX_SCAN)
    .filter((e) => !isStructural(e) && !['script', 'style', 'template', 'noscript', 'defs', 'marker'].includes(e.localName) && !e.closest('defs'));
}

function classes(el: Element): string[] {
  return (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * Same tag and the same main (first) class, so `div.card` finds every card,
 * including `card done` and `card risk`. Without a class: same tag, no class.
 */
export function sameType(el: Element): Match {
  const main = classes(el)[0];
  const elements = candidates(el).filter(
    (e) => e.localName === el.localName && e.namespaceURI === el.namespaceURI && (main ? classes(e).includes(main) : classes(e).length === 0),
  );
  return { label: 'Same type', detail: `${el.localName}${main ? '.' + main : ''}`, elements };
}

type ColourProp = { prop: string; label: string };

/** The colour that best describes this element: its fill, else its outline, else its text. */
function mainColour(el: Element): (ColourProp & { value: string }) | null {
  const pick = (prop: string, label: string) => ({ prop, label, value: computed(el, prop) });
  if (isSvgChild(el)) {
    if (isLineLike(el) || computed(el, 'fill') === 'none') {
      return computed(el, 'stroke') === 'none' ? null : pick('stroke', 'Same stroke');
    }
    return pick('fill', 'Same fill');
  }
  const bg = computed(el, 'background-color');
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return pick('background-color', 'Same fill');
  if (parseFloat(computed(el, 'border-top-width')) > 0 && computed(el, 'border-top-style') !== 'none') {
    return pick('border-top-color', 'Same border colour');
  }
  if (hasOwnText(el)) return pick('color', 'Same text colour');
  return null;
}

function hasOwnText(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '');
}

/** Elements (of the same family, HTML or SVG) sharing this element's main colour. */
export function sameColour(el: Element): Match | null {
  const main = mainColour(el);
  if (!main) return null;
  const svg = isSvgChild(el);
  const elements = candidates(el).filter((e) => {
    if (isSvgChild(e) !== svg) return false;
    // Groups pick colours up from their parents; only match them against another group.
    if ((e.localName === 'g') !== (el.localName === 'g')) return false;
    if (main.prop === 'color' && !hasOwnText(e)) return false;
    if (main.prop === 'border-top-color' && !(parseFloat(computed(e, 'border-top-width')) > 0 && computed(e, 'border-top-style') !== 'none')) return false;
    if (main.prop === 'stroke' && computed(e, 'stroke') === 'none') return false;
    return computed(e, main.prop) === main.value;
  });
  return { label: main.label, detail: main.value, elements };
}
