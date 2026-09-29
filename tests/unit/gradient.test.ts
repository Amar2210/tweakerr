import { describe, expect, it } from 'vitest';
import { formatGradient, gradientLayer, headToAngle, isStop, parseGradient, splitTopLevel } from '../../src/util/gradient';

describe('gradients', () => {
  it('splits only on top-level commas', () => {
    expect(splitTopLevel('rgb(1, 2, 3) 10%, #fff, url("a,b.png")')).toEqual(['rgb(1, 2, 3) 10%', '#fff', 'url("a,b.png")']);
  });

  it('reads a computed linear gradient and writes it back unchanged', () => {
    const src = 'linear-gradient(135deg, rgb(29, 42, 91), rgb(47, 111, 237) 80%)';
    const g = parseGradient(src)!;
    expect(g.kind).toBe('linear');
    expect(g.head).toBe('135deg');
    expect(g.items).toEqual([
      { color: 'rgb(29, 42, 91)', pos: '' },
      { color: 'rgb(47, 111, 237)', pos: '80%' },
    ]);
    expect(formatGradient(g)).toBe(src);
  });

  it('keeps radial shapes, hints, hex colours and the repeating flag', () => {
    const src = 'repeating-radial-gradient(circle at 25% 30%, #3b2f8f 0px, 40%, rgba(0, 0, 0, 0) 55%)';
    const g = parseGradient(src)!;
    expect(g.repeating).toBe(true);
    expect(g.head).toBe('circle at 25% 30%');
    expect(g.items.filter(isStop).map((s) => s.color)).toEqual(['#3b2f8f', 'rgba(0, 0, 0, 0)']);
    expect(formatGradient(g)).toBe(src);
  });

  it('finds the gradient among background layers', () => {
    const found = gradientLayer('url("x.png"), linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))')!;
    expect(found.index).toBe(1);
    expect(found.gradient.head).toBe('');
    expect(gradientLayer('none')).toBeNull();
    expect(gradientLayer('url("x.png")')).toBeNull();
  });

  it('turns directions into degrees', () => {
    expect(headToAngle('')).toBe(180);
    expect(headToAngle('to right')).toBe(90);
    expect(headToAngle('0.25turn')).toBe(90);
    expect(headToAngle('45deg')).toBe(45);
    expect(headToAngle('circle')).toBeNull();
  });
});
