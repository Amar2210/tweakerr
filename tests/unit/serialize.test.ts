import { describe, it, expect } from 'vitest';
import { serializeDocument } from '../../src/doc/serialize';

const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');

describe('serializeDocument', () => {
  it('keeps doctype, comments, styles and scripts', () => {
    const src = '<!DOCTYPE html><!-- made by an llm --><html lang="en"><head><style>.a{color:red}</style></head><body><div class="a">x</div><script>alert(1)</script></body></html>';
    const out = serializeDocument(parse(src));
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out).toContain('<!-- made by an llm -->');
    expect(out).toContain('<style>.a{color:red}</style>');
    expect(out).toContain('<script>alert(1)</script>');
  });

  it('round-trips to an identical DOM', () => {
    const src = '<!DOCTYPE html><html><head><title>T</title></head><body><svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10"></line></svg><p>a &amp; b</p></body></html>';
    const once = serializeDocument(parse(src));
    const twice = serializeDocument(parse(once));
    expect(twice).toBe(once);
  });

  it('puts line breaks back after </body> and </html> without growing the file', () => {
    const src = '<!DOCTYPE html>\n<html>\n<head><title>T</title></head>\n<body>\n<p>x</p>\n<script>go()</script>\n</body>\n</html>\n';
    const once = serializeDocument(parse(src), { trailingNewline: true });
    expect(once.endsWith('<script>go()</script>\n</body>\n</html>\n')).toBe(true);
    const twice = serializeDocument(parse(once), { trailingNewline: true });
    expect(twice).toBe(once);
    expect(parse(once).body.innerHTML).toBe(parse(src).body.innerHTML);
  });

  it('keeps trailing comments without drifting whitespace into the body', () => {
    const src = '<html><body><p>x</p>\n</body></html>\n<!-- end -->\n';
    const once = serializeDocument(parse(src), { trailingNewline: true });
    expect(parse(once).body.innerHTML).toBe(parse(src).body.innerHTML);
    expect(serializeDocument(parse(once), { trailingNewline: true })).toBe(once);
  });
});
