import { describe, it, expect } from 'vitest';
import {
  segmentKey,
  segmentUnitKeys,
  markOccupied,
  isOccupied,
  segmentsOverlap,
  buildSegments,
} from '../src/segments.js';
import type { RouteSegment, GridPoint } from '../src/types.js';

describe('segmentKey', () => {
  it('produces same key for reversed H segment', () => {
    const a: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const b: RouteSegment = { from: { gx: 10, gy: 5 }, to: { gx: 0, gy: 5 }, axis: 'h' };
    expect(segmentKey(a)).toBe(segmentKey(b));
  });

  it('produces same key for reversed V segment', () => {
    const a: RouteSegment = { from: { gx: 5, gy: 0 }, to: { gx: 5, gy: 10 }, axis: 'v' };
    const b: RouteSegment = { from: { gx: 5, gy: 10 }, to: { gx: 5, gy: 0 }, axis: 'v' };
    expect(segmentKey(a)).toBe(segmentKey(b));
  });

  it('produces different keys for different segments', () => {
    const a: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const b: RouteSegment = { from: { gx: 0, gy: 6 }, to: { gx: 10, gy: 6 }, axis: 'h' };
    expect(segmentKey(a)).not.toBe(segmentKey(b));
  });

  it('normalizes direction for H segment key', () => {
    const seg: RouteSegment = { from: { gx: 5, gy: 3 }, to: { gx: 2, gy: 3 }, axis: 'h' };
    expect(segmentKey(seg)).toBe('h:3:2-5');
  });

  it('normalizes direction for V segment key', () => {
    const seg: RouteSegment = { from: { gx: 4, gy: 8 }, to: { gx: 4, gy: 3 }, axis: 'v' };
    expect(segmentKey(seg)).toBe('v:4:3-8');
  });
});

describe('segmentUnitKeys', () => {
  it('produces correct unit keys for H segment', () => {
    const seg: RouteSegment = { from: { gx: 2, gy: 5 }, to: { gx: 5, gy: 5 }, axis: 'h' };
    const keys = segmentUnitKeys(seg);
    expect(keys).toEqual(['h:5:2', 'h:5:3', 'h:5:4']);
  });

  it('produces correct unit keys for V segment', () => {
    const seg: RouteSegment = { from: { gx: 3, gy: 1 }, to: { gx: 3, gy: 4 }, axis: 'v' };
    const keys = segmentUnitKeys(seg);
    expect(keys).toEqual(['v:3:1', 'v:3:2', 'v:3:3']);
  });

  it('produces empty keys for zero-length segment', () => {
    const seg: RouteSegment = { from: { gx: 3, gy: 3 }, to: { gx: 3, gy: 3 }, axis: 'h' };
    expect(segmentUnitKeys(seg)).toEqual([]);
  });

  it('handles reversed segment direction', () => {
    const fwd: RouteSegment = { from: { gx: 2, gy: 5 }, to: { gx: 5, gy: 5 }, axis: 'h' };
    const rev: RouteSegment = { from: { gx: 5, gy: 5 }, to: { gx: 2, gy: 5 }, axis: 'h' };
    expect(segmentUnitKeys(fwd)).toEqual(segmentUnitKeys(rev));
  });
});

describe('markOccupied / isOccupied', () => {
  it('marks and detects occupied segments', () => {
    const occupied = new Set<string>();
    const seg: RouteSegment = { from: { gx: 0, gy: 0 }, to: { gx: 5, gy: 0 }, axis: 'h' };
    markOccupied(seg, occupied);
    expect(occupied.size).toBe(5);
    expect(isOccupied(seg, occupied)).toBe(true);
  });

  it('zero-length segment is never occupied', () => {
    const occupied = new Set<string>();
    occupied.add('h:0:0');
    const seg: RouteSegment = { from: { gx: 0, gy: 0 }, to: { gx: 0, gy: 0 }, axis: 'h' };
    expect(isOccupied(seg, occupied)).toBe(false);
  });

  it('non-overlapping segment is not occupied', () => {
    const occupied = new Set<string>();
    const segA: RouteSegment = { from: { gx: 0, gy: 0 }, to: { gx: 3, gy: 0 }, axis: 'h' };
    markOccupied(segA, occupied);
    const segB: RouteSegment = { from: { gx: 0, gy: 1 }, to: { gx: 3, gy: 1 }, axis: 'h' };
    expect(isOccupied(segB, occupied)).toBe(false);
  });
});

describe('segmentsOverlap', () => {
  it('detects overlapping H segments on same row', () => {
    const a: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const b: RouteSegment = { from: { gx: 5, gy: 5 }, to: { gx: 15, gy: 5 }, axis: 'h' };
    expect(segmentsOverlap(a, b)).toBe(true);
  });

  it('returns false for H segments on different rows', () => {
    const a: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const b: RouteSegment = { from: { gx: 0, gy: 6 }, to: { gx: 10, gy: 6 }, axis: 'h' };
    expect(segmentsOverlap(a, b)).toBe(false);
  });

  it('returns false for different axes', () => {
    const a: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const b: RouteSegment = { from: { gx: 5, gy: 0 }, to: { gx: 5, gy: 10 }, axis: 'v' };
    expect(segmentsOverlap(a, b)).toBe(false);
  });

  it('returns false for non-overlapping segments on same row', () => {
    const a: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 3, gy: 5 }, axis: 'h' };
    const b: RouteSegment = { from: { gx: 5, gy: 5 }, to: { gx: 8, gy: 5 }, axis: 'h' };
    expect(segmentsOverlap(a, b)).toBe(false);
  });

  it('detects overlapping V segments on same column', () => {
    const a: RouteSegment = { from: { gx: 3, gy: 0 }, to: { gx: 3, gy: 10 }, axis: 'v' };
    const b: RouteSegment = { from: { gx: 3, gy: 5 }, to: { gx: 3, gy: 15 }, axis: 'v' };
    expect(segmentsOverlap(a, b)).toBe(true);
  });
});

describe('buildSegments', () => {
  it('returns empty for fewer than 2 points', () => {
    expect(buildSegments([])).toEqual([]);
    expect(buildSegments([{ gx: 0, gy: 0 }])).toEqual([]);
  });

  it('builds single H segment from two points', () => {
    const path: GridPoint[] = [{ gx: 0, gy: 0 }, { gx: 5, gy: 0 }];
    const segs = buildSegments(path);
    expect(segs).toHaveLength(1);
    expect(segs[0].axis).toBe('h');
  });

  it('builds L-shape from three points', () => {
    const path: GridPoint[] = [{ gx: 0, gy: 0 }, { gx: 5, gy: 0 }, { gx: 5, gy: 3 }];
    const segs = buildSegments(path);
    expect(segs).toHaveLength(2);
    expect(segs[0].axis).toBe('h');
    expect(segs[1].axis).toBe('v');
  });

  it('merges collinear points into a single segment', () => {
    const path: GridPoint[] = [
      { gx: 0, gy: 0 },
      { gx: 1, gy: 0 },
      { gx: 2, gy: 0 },
      { gx: 3, gy: 0 },
    ];
    const segs = buildSegments(path);
    expect(segs).toHaveLength(1);
    expect(segs[0].from).toEqual({ gx: 0, gy: 0 });
    expect(segs[0].to).toEqual({ gx: 3, gy: 0 });
  });
});
