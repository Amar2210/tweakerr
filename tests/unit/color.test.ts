import { describe, it, expect } from 'vitest';
import { parseColor, formatColor, toHex } from '../../src/util/color';

describe('color', () => {
  it('parses rgb, rgba, modern rgb syntax and hex', () => {
    expect(parseColor('rgb(255, 0, 10)')).toEqual({ r: 255, g: 0, b: 10, a: 1 });
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('#11223380')!.a).toBeCloseTo(0.502, 2);
    expect(parseColor('transparent')!.a).toBe(0);
    expect(parseColor('nonsense')).toBeNull();
  });

  it('formats opaque as hex and translucent as rgba', () => {
    expect(formatColor({ r: 255, g: 87, b: 34, a: 1 })).toBe('#ff5722');
    expect(formatColor({ r: 0, g: 0, b: 0, a: 0.25 })).toBe('rgba(0, 0, 0, 0.25)');
    expect(formatColor({ r: 0, g: 0, b: 0, a: 0 })).toBe('transparent');
    expect(toHex({ r: 1, g: 2, b: 3, a: 1 })).toBe('#010203');
  });
});
