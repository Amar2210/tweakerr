/**
 * Live pages: pages whose own scripts draw them (a diagram built from a
 * data list, say). Their scripts run while editing, so the drawn boxes are
 * real and clickable, but saving those boxes would draw them twice.
 *
 * Instead every style change becomes a rule in one <style id="tweakerr-edits">
 * inside the page ("#box-quote { border-color: red !important }"), and text
 * edits become swaps in the file's text. Saving writes the original file
 * plus that block and those swaps; the scripts are kept as they were.
 *
 * The rules live in the style element's single text node, and the swaps in
 * one of its attributes, so undo/redo (which records DOM changes) covers them.
 */
import { adoptKey } from './keys';
import { EDITS_ID, applySwaps, findText, literalCount, saveLiveFile, type TextSwap } from './livefile';

const registry = new WeakMap<Document, LiveEdits>();

/** The live-page state for this document, or null for an ordinary page. */
export function liveFor(doc: Document | null | undefined): LiveEdits | null {
  return (doc && registry.get(doc)) || null;
}

/** Changes that can move things, after which the page's code may need to redraw its connectors. */
const MOVES_THINGS = /^(translate|transform|width|height|min-|max-|padding|margin|border|font|line-height|letter-spacing|display|position|top|left|right|bottom|flex|gap|x|y|cx|cy|r|rx|ry)$|^(min-|max-|padding-|margin-|border-|font-|flex-)/;

const SWAPS_ATTR = 'data-text-swaps';
const ID_ATTRS = ['data-id', 'data-key', 'data-node', 'data-name'];

export class LiveEdits {
  readonly style: HTMLStyleElement;
  private text: Text;
  private selectors = new WeakMap<Element, string>();
  /** Selector as written here -> as the browser normalises it. */
  private normal = new Map<string, string>();
  private lastTextEl: Element | null = null;
  /** Set when a change may have moved things; the page watcher asks the page to redraw. */
  movedThings = false;

  constructor(
    readonly doc: Document,
    /** The file as it was opened. */
    readonly source: string,
  ) {
    let style = doc.getElementById(EDITS_ID);
    if (!style || style.localName !== 'style') {
      style = doc.createElement('style');
      style.id = EDITS_ID;
      (doc.head ?? doc.documentElement).append(style);
    }
    this.text = doc.createTextNode(style.textContent ?? '');
    style.replaceChildren(this.text);
    this.style = style as HTMLStyleElement;
    registry.set(doc, this);
  }

  // ------------------------------------------------------------ selectors

  /**
   * How the saved rules find this element when the page draws it again:
   * its id, else a data-id-like attribute, else its position under the
   * nearest ancestor that has one ("#diagram > g:nth-child(3) > rect:nth-child(1)").
   */
  selectorFor(el: Element): string {
    const cached = this.selectors.get(el);
    // Redrawn by the page and gone: keep using what it was, so edits still land.
    if (cached && !this.doc.contains(el)) return cached;
    const sel = this.build(el);
    this.selectors.set(el, sel);
    return sel;
  }

  /** Found only by its position, so a reordered data list would move the edit. */
  isFragile(el: Element): boolean {
    return this.selectorFor(el).includes(':nth-child(');
  }

  find(sel: string): Element | null {
    try {
      return this.doc.querySelector(sel);
    } catch {
      return null;
    }
  }

  /**
   * The element as it is now: itself, or the copy the page's code drew in
   * its place (connectors are often wiped and redrawn on every resize).
   */
  relocate(el: Element): Element | null {
    if (this.doc.contains(el)) return el;
    const found = this.find(this.selectorFor(el));
    if (found) adoptKey(el, found);
    return found;
  }

  private build(el: Element): string {
    const unique = (sel: string) => {
      try {
        return this.doc.querySelectorAll(sel).length === 1;
      } catch {
        return false;
      }
    };
    const named = (e: Element): string | null => {
      const n = e.localName;
      if (n === 'html' || n === 'head' || n === 'body') return n;
      if (e.id && unique(`#${CSS.escape(e.id)}`)) return `#${CSS.escape(e.id)}`;
      for (const a of ID_ATTRS) {
        const v = e.getAttribute(a);
        const sel = v && `${n}[${a}="${CSS.escape(v)}"]`;
        if (sel && unique(sel)) return sel;
      }
      return null;
    };
    const parts: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const own = named(e);
      if (own) {
        parts.unshift(own);
        break;
      }
      const index = e.parentElement ? Array.from(e.parentElement.children).indexOf(e) + 1 : 1;
      parts.unshift(`${e.localName}:nth-child(${index})`);
    }
    return parts.join(' > ');
  }

  // ------------------------------------------------------------ style rules

  private rule(el: Element, create: boolean): CSSStyleRule | null {
    const sheet = this.style.sheet;
    if (!sheet) return null;
    const sel = this.selectorFor(el);
    const norm = this.normal.get(sel);
    for (const r of Array.from(sheet.cssRules)) {
      // `instanceof CSSStyleRule` fails across the frame boundary.
      if ('selectorText' in r && ((r as CSSStyleRule).selectorText === sel || (r as CSSStyleRule).selectorText === norm)) {
        return r as CSSStyleRule;
      }
    }
    if (!create) return null;
    const rule = sheet.cssRules[sheet.insertRule(`${sel} {}`, sheet.cssRules.length)] as CSSStyleRule;
    this.normal.set(sel, rule.selectorText);
    return rule;
  }

  get(el: Element, prop: string): string {
    return this.rule(el, false)?.style.getPropertyValue(prop) ?? '';
  }

  /** Set (or with '' remove) one property for this element. Call inside an edit. */
  set(el: Element, prop: string, value: string): void {
    const rule = this.rule(el, value !== '');
    if (!rule) return;
    if (value === '') rule.style.removeProperty(prop);
    // !important: the page's code often sets inline styles, which would win otherwise.
    else rule.style.setProperty(prop, value, 'important');
    if (MOVES_THINGS.test(prop)) this.movedThings = true;
    this.write();
  }

  /** This element's rule as editable text, one declaration per line. */
  cssText(el: Element): string {
    const css = this.rule(el, false)?.style.cssText ?? '';
    return css
      .split(/;\s*(?![^(]*\))/)
      .filter((d) => d.trim())
      .map((d) => `${d.replace(/\s*!important\s*$/, '').trim()};`)
      .join('\n');
  }

  setCssText(el: Element, text: string): void {
    const rule = this.rule(el, true);
    if (!rule) return;
    rule.style.cssText = text.replace(/!important/g, '');
    for (const p of Array.from({ length: rule.style.length }, (_, i) => rule.style[i])) {
      rule.style.setProperty(p, rule.style.getPropertyValue(p), 'important');
    }
    this.movedThings = true;
    this.write();
  }

  /** The rules to save, one per line. */
  rules(): string[] {
    const sheet = this.style.sheet;
    if (!sheet) return [];
    return Array.from(sheet.cssRules)
      .filter((r): r is CSSStyleRule => 'selectorText' in r && (r as CSSStyleRule).style.length > 0)
      .map((r) => `${r.selectorText} { ${r.style.cssText} }`);
  }

  /** Write the rules back into the text node: a DOM change, so history records it. */
  private write(): void {
    const text = this.rules().join('\n');
    if (this.text.data !== text) this.text.data = text;
  }

  // ------------------------------------------------------------ text

  swaps(): TextSwap[] {
    try {
      const list = JSON.parse(this.style.getAttribute(SWAPS_ATTR) ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private setSwaps(list: TextSwap[]): void {
    this.style.setAttribute(SWAPS_ATTR, JSON.stringify(list));
  }

  /**
   * Can this element's words be changed, and where are they in the file?
   * Returns a reason when not; otherwise the anchor that finds them (see TextSwap).
   */
  checkText(el: Element): string | { anchor?: string } {
    const own = Array.from(el.children).find((c) => (c.textContent ?? '').trim());
    if (own) {
      return 'The words here are split into separately styled pieces (like a bold word inside a sentence). Double-click right on the piece you want to change.';
    }
    const text = (el.textContent ?? '').trim();
    const last = this.swaps().at(-1);
    if (last && this.lastTextEl === el && last.to === text) return { anchor: last.anchor };
    const source = applySwaps(this.source, this.swaps());
    if (findText(source, text)) return {};
    for (const anchor of anchorsFor(el, text)) {
      if (findText(source, text, anchor)) return { anchor };
    }
    const n = literalCount(source, text);
    return n > 1
      ? `“${short(text)}” is written ${n} times in the page's code, and Tweakerr couldn't work out which one belongs to this item, so it can't change it here.`
      : `“${short(text)}” is put together by the page's code, not written out in one piece, so Tweakerr can't change it here.`;
  }

  /** Record that an element's words changed from `from` to `to`. Call inside an edit. */
  recordText(el: Element, from: string, to: string, anchor?: string): void {
    const a = from.trim();
    const b = to.trim();
    if (a === b) return;
    const list = this.swaps();
    const last = list.at(-1);
    if (last && this.lastTextEl === el && last.to === a) {
      last.to = b;
      if (last.from === last.to) list.pop();
    } else {
      list.push(anchor ? { from: a, to: b, anchor } : { from: a, to: b });
    }
    this.lastTextEl = el;
    this.setSwaps(list);
  }

  /** After the page redraws itself, show the changed words again. Not recorded. */
  reapplySwaps(): void {
    const swaps = this.swaps();
    if (!swaps.length || !this.doc.body) return;
    const walker = this.doc.createTreeWalker(this.doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const parent = n.parentElement?.localName;
      if (parent === 'script' || parent === 'style') continue;
      for (const s of swaps) {
        if (n.data.trim() !== s.from) continue;
        // Words written for one item ("HR" on the Employee data card) change only there.
        if (s.anchor && !itemOf(n.parentElement).some((e) => (e.textContent ?? '').includes(s.anchor!))) continue;
        n.data = n.data.replace(s.from, s.to);
      }
    }
  }

  // ------------------------------------------------------------ save

  save(): string {
    return saveLiveFile(this.source, this.rules(), this.swaps());
  }
}

/** The element and a few ancestors: the item (card) the words belong to. */
function itemOf(el: Element | null, levels = 4): Element[] {
  const out: Element[] = [];
  for (let e = el; e && out.length <= levels && e.localName !== 'body'; e = e.parentElement) out.push(e);
  return out;
}

/** Other words of the same item, nearest first ("Employee data" next to "HR"). */
function anchorsFor(el: Element, text: string): string[] {
  const seen = new Set<string>([text]);
  const out: string[] = [];
  for (const item of itemOf(el.parentElement)) {
    const walker = item.ownerDocument.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? '').trim();
      if (t.length < 2 || seen.has(t) || el.contains(n)) continue;
      seen.add(t);
      out.push(t);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function short(s: string): string {
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}
