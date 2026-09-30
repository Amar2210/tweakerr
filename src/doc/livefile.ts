/**
 * Saving a live page (one whose scripts draw it). The file is kept exactly
 * as it was, plus:
 *   - one <style id="tweakerr-edits"> block holding the style changes, and
 *   - text swaps: an edited label replaced where it's written in the file,
 *     usually inside the script's data ("Invoice" -> "Billing").
 * These helpers work on the file's text only, so they're easy to test.
 */

export const EDITS_ID = 'tweakerr-edits';

export interface TextSwap {
  from: string;
  to: string;
  /**
   * Other words of the same item ("Employee data"), used when `from` ("HR")
   * is written several times: the one in the same {…} or […] as this wins.
   */
  anchor?: string;
}

type Found = { index: number; length: number; write: (to: string) => string };

const QUOTES = ["'", '"', '`'] as const;

function escapeJs(s: string, q: string): string {
  let out = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  out = out.split(q).join(`\\${q}`);
  if (q === '`') out = out.replace(/\$\{/g, '\\${');
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

function literalsOf(source: string, text: string): Found[] {
  const out: Found[] = [];
  for (const q of QUOTES) {
    const lit = `${q}${escapeJs(text, q)}${q}`;
    for (const index of occurrences(source, lit)) {
      out.push({ index, length: lit.length, write: (to) => `${q}${escapeJs(to, q)}${q}` });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** How many times these words are written as a string in the code. */
export function literalCount(source: string, text: string): number {
  return literalsOf(source, text).length;
}

/**
 * Where this text is written in the file, if Tweakerr can tell for sure:
 * first as a whole string in the code ('Invoice', "Invoice" or `Invoice`),
 * then as plain text. Null when it's missing or can't be told apart.
 *
 * When the string is written several times (team: "HR" on three cards),
 * `anchor` picks one: the copy inside the same {…} or […] as the anchor
 * words, which must themselves be written only once ("Employee data").
 */
export function findText(source: string, text: string, anchor?: string): Found | null {
  if (!text.trim()) return null;
  const literals = literalsOf(source, text);
  if (literals.length === 1) return literals[0];
  if (literals.length > 1) {
    const box = anchor ? anchorGroup(source, anchor) : null;
    const inside = box ? literals.filter((l) => l.index > box[0] && l.index + l.length <= box[1]) : [];
    return inside.length === 1 ? inside[0] : null;
  }

  for (const needle of new Set([text, escapeHtml(text)])) {
    const at = occurrences(source, needle);
    if (at.length > 1) return null;
    if (at.length === 1) {
      // Page text needs HTML escaping; text inside a script is written as is.
      const write = inScript(source, at[0]) ? (to: string) => to : escapeHtml;
      return { index: at[0], length: needle.length, write };
    }
  }
  return null;
}

function inScript(source: string, index: number): boolean {
  const before = source.slice(0, index).toLowerCase();
  return before.lastIndexOf('<script') > before.lastIndexOf('</script');
}

/**
 * The innermost {…} or […] in the code around the anchor words, as
 * [open, close] offsets; null when the anchor isn't written exactly once.
 */
export function anchorGroup(source: string, anchor: string): [number, number] | null {
  const lits = literalsOf(source, anchor);
  if (lits.length !== 1) return null;
  const at = lits[0].index;
  const script = scriptAround(source, at);
  if (!script) return null;
  let best: [number, number] | null = null;
  for (const [open, close] of brackets(source, script[0], script[1])) {
    if (open < at && close > at && (!best || close - open < best[1] - best[0])) best = [open, close];
  }
  return best;
}

function scriptAround(source: string, index: number): [number, number] | null {
  const lower = source.toLowerCase();
  const start = lower.lastIndexOf('<script', index);
  if (start === -1 || lower.lastIndexOf('</script', index) > start) return null;
  const open = source.indexOf('>', start);
  const end = lower.indexOf('</script', index);
  return open === -1 ? null : [open + 1, end === -1 ? source.length : end];
}

/** Matching bracket pairs in a script, skipping strings and comments. */
function brackets(src: string, from: number, to: number): [number, number][] {
  const pairs: [number, number][] = [];
  const stack: number[] = [];
  for (let i = from; i < to; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < to && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < to && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? to : end + 1;
    } else if (c === '{' || c === '[') stack.push(i);
    else if ((c === '}' || c === ']') && stack.length) pairs.push([stack.pop()!, i]);
  }
  return pairs;
}

export function applySwaps(source: string, swaps: TextSwap[]): string {
  let out = source;
  for (const s of swaps) {
    const f = findText(out, s.from, s.anchor);
    if (f) out = out.slice(0, f.index) + f.write(s.to) + out.slice(f.index + f.length);
  }
  return out;
}

const BLOCK = new RegExp(`[ \\t]*<style[^>]*\\bid=["']?${EDITS_ID}["']?[^>]*>[\\s\\S]*?</style>[ \\t]*\\r?\\n?`, 'i');

/** Put the style block in the file: replace the one from an earlier save, or add it at the end of <head>. */
export function placeEditsBlock(source: string, rules: string[]): string {
  const nl = source.includes('\r\n') ? '\r\n' : '\n';
  const block = rules.length
    ? [`<style id="${EDITS_ID}">`, '/* Changes made with Tweakerr. Delete this block to undo them all. */', ...rules, '</style>'].join(nl) + nl
    : '';
  if (BLOCK.test(source)) return source.replace(BLOCK, block);
  if (!block) return source;
  const head = /<\/head\s*>/i.exec(source);
  if (head) return source.slice(0, head.index) + block + source.slice(head.index);
  const body = /<body[\s>]/i.exec(source);
  if (body) return source.slice(0, body.index) + block + source.slice(body.index);
  return block + source;
}

export function saveLiveFile(source: string, rules: string[], swaps: TextSwap[]): string {
  return placeEditsBlock(applySwaps(source, swaps), rules);
}
