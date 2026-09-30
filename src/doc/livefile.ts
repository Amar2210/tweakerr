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

/**
 * Where this text is written in the file, if Tweakerr can tell for sure:
 * first as a whole string in the code ('Invoice', "Invoice" or `Invoice`),
 * then as plain text. Null when it's missing or written more than once.
 */
export function findText(source: string, text: string): Found | null {
  if (!text.trim()) return null;
  const literals: Found[] = [];
  for (const q of QUOTES) {
    const lit = `${q}${escapeJs(text, q)}${q}`;
    for (const index of occurrences(source, lit)) {
      literals.push({ index, length: lit.length, write: (to) => `${q}${escapeJs(to, q)}${q}` });
    }
  }
  if (literals.length === 1) return literals[0];
  if (literals.length > 1) return null;

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

export function applySwaps(source: string, swaps: TextSwap[]): string {
  let out = source;
  for (const s of swaps) {
    const f = findText(out, s.from);
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
