import { describe, expect, it } from 'vitest';
import { bendThrough, ends, formatPath, isOpen, moveEnd, parsePath, straighten } from '../../src/util/path';

describe('parsePath', () => {
  it('reads absolute and relative commands as absolute segments', () => {
    const segs = parsePath('M10,20 l5 5 h10 v-5 L 0 0')!;
    expect(formatPath(segs)).toBe('M 10 20 L 15 25 L 25 25 L 25 20 L 0 0');
  });

  it('turns S into C and T into Q, reflecting the last control point', () => {
    expect(formatPath(parsePath('M0 0 C 10 0 20 10 20 20 S 30 40 40 40')!)).toBe('M 0 0 C 10 0 20 10 20 20 C 20 30 30 40 40 40');
    expect(formatPath(parsePath('M0 0 Q 10 10 20 0 T 40 0')!)).toBe('M 0 0 Q 10 10 20 0 Q 30 -10 40 0');
  });

  it('reads packed numbers and arc flags', () => {
    expect(formatPath(parsePath('M.5.5L-1-1')!)).toBe('M 0.5 0.5 L -1 -1');
    expect(formatPath(parsePath('M0 0a5 5 0 015 5')!)).toBe('M 0 0 A 5 5 0 0 1 5 5');
    expect(formatPath(parsePath('M0 0 1 1 2 2')!)).toBe('M 0 0 L 1 1 L 2 2');
  });

  it('refuses bad data', () => {
    expect(parsePath('')).toBeNull();
    expect(parsePath('L 1 2')).toBeNull();
    expect(parsePath('M 1')).toBeNull();
    expect(parsePath('M 0 0 X 1 1')).toBeNull();
  });

  it('knows arrows from closed shapes', () => {
    expect(isOpen(parsePath('M0 0 C 10 0 20 10 20 20')!)).toBe(true);
    expect(isOpen(parsePath('M0 0 L 10 0 L 10 10 Z')!)).toBe(false);
    expect(isOpen(parsePath('M0 0')!)).toBe(false);
  });
});

describe('reshaping', () => {
  const elbow = parsePath('M 0 0 L 50 0 L 50 100 L 100 100')!;

  it('moving the head keeps the tail still and the bends in proportion', () => {
    const out = moveEnd(elbow, 'end', 20, 40);
    expect(ends(out)).toEqual([{ x: 0, y: 0 }, { x: 120, y: 140 }]);
    // The corners move part of the way: by how far along the arrow they are.
    expect(out[1].p[0]).toBeGreaterThan(50);
    expect(out[1].p[0]).toBeLessThan(70);
  });

  it('moving the tail keeps the head still', () => {
    const out = moveEnd(elbow, 'start', -10, 0);
    expect(ends(out)).toEqual([{ x: -10, y: 0 }, { x: 100, y: 100 }]);
  });

  it('bending passes the curve through the dragged point halfway', () => {
    const out = bendThrough(parsePath('M 0 0 L 100 0')!, { x: 50, y: 30 });
    expect(formatPath(out)).toBe('M 0 0 Q 50 60 100 0');
    const [, q] = out;
    const mid = { x: (0 + 2 * q.p[0] + 100) / 4, y: (0 + 2 * q.p[1] + 0) / 4 };
    expect(mid).toEqual({ x: 50, y: 30 });
  });

  it('straighten keeps just the ends', () => {
    expect(formatPath(straighten(elbow))).toBe('M 0 0 L 100 100');
  });
});
