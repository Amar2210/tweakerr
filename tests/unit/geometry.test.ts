import { describe, it, expect } from 'vitest';
import { snapBox, parseCssTranslate, formatCssTranslate, addSvgTranslate, readSvgTranslate } from '../../src/util/geometry';

describe('snapBox', () => {
  const target = { left: 100, top: 100, width: 100, height: 50 };

  it('snaps left edges within the threshold and draws a guide', () => {
    const r = snapBox({ left: 103, top: 300, width: 40, height: 40 }, [target], 5);
    expect(r.dx).toBe(-3);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ axis: 'v', pos: 100, from: 100, to: 340 }]);
  });

  it('snaps centres', () => {
    const r = snapBox({ left: 131, top: 0, width: 40, height: 10 }, [target], 5);
    expect(r.dx).toBe(-1); // centre 151 -> 150
  });

  it('picks the closest match and ignores far ones', () => {
    const r = snapBox({ left: 500, top: 146, width: 10, height: 10 }, [target], 5);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(-1); // its middle (151) is closest to the target bottom (150)
  });
});

describe('translate helpers', () => {
  it('parses computed CSS translate', () => {
    expect(parseCssTranslate('none')).toEqual([0, 0]);
    expect(parseCssTranslate('12px')).toEqual([12, 0]);
    expect(parseCssTranslate('12.5px -3px')).toEqual([12.5, -3]);
  });

  it('formats and clears zero translate', () => {
    expect(formatCssTranslate(0, 0)).toBe('');
    expect(formatCssTranslate(1.234, 5)).toBe('1.23px 5px');
  });

  it('updates a leading SVG translate and keeps other transforms', () => {
    expect(addSvgTranslate(null, 10, 5)).toBe('translate(10 5)');
    expect(addSvgTranslate('translate(10, 5)', 2, -5)).toBe('translate(12 0)');
    expect(addSvgTranslate('rotate(45 10 10)', 3, 4)).toBe('translate(3 4) rotate(45 10 10)');
    expect(addSvgTranslate('translate(3 4) rotate(45)', -3, -4)).toBe('rotate(45)');
    expect(readSvgTranslate('translate(7) scale(2)')).toEqual([7, 0]);
  });
});
