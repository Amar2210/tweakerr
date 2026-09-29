import { describe, expect, it } from 'vitest';
import { families, pageFamilies, primaryFamily, stackFor } from '../../src/doc/fonts';

describe('fonts', () => {
  it('splits a font list and unquotes names', () => {
    expect(families('system-ui, -apple-system, "Segoe UI", sans-serif')).toEqual(['system-ui', '-apple-system', 'Segoe UI', 'sans-serif']);
    expect(primaryFamily('"IBM Plex Sans", system-ui')).toBe('IBM Plex Sans');
  });

  it('adds a fallback that matches the kind of font', () => {
    expect(stackFor('Georgia')).toBe('Georgia, serif');
    expect(stackFor('Courier New')).toBe('"Courier New", monospace');
    expect(stackFor('Some Font')).toBe('"Some Font", sans-serif');
    expect(stackFor('monospace')).toBe('monospace');
    expect(stackFor('Arial, Helvetica, sans-serif')).toBe('Arial, Helvetica, sans-serif');
  });

  it("reuses the page's own fallbacks for a font it already uses", () => {
    const { names, known } = pageFamilies(['Inter, -apple-system, BlinkMacSystemFont, sans-serif', 'system-ui, "Segoe UI", sans-serif']);
    expect(names).toEqual(['Inter', 'BlinkMacSystemFont', 'Segoe UI']);
    expect(stackFor('Inter', known)).toBe('Inter, -apple-system, BlinkMacSystemFont, sans-serif');
    expect(stackFor('Segoe UI', known)).toBe('"Segoe UI", sans-serif');
  });
});
