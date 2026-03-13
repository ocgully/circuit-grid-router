import { describe, it, expect } from 'vitest';
import { findCrossings } from '../src/crossings.js';
import type { RouteSegment } from '../src/types.js';
import { DEFAULT_ROUTER_OPTIONS } from '../src/types.js';

const GRID_SIZE = DEFAULT_ROUTER_OPTIONS.gridSize;

describe('findCrossings', () => {
  it('returns empty array when both segment lists are empty', () => {
    expect(findCrossings([], [])).toHaveLength(0);
  });

  it('returns empty array for parallel segments', () => {
    const segA: RouteSegment = { from: { gx: 0, gy: 0 }, to: { gx: 10, gy: 0 }, axis: 'h' };
    const segB: RouteSegment = { from: { gx: 0, gy: 2 }, to: { gx: 10, gy: 2 }, axis: 'h' };
    expect(findCrossings([segA], [segB])).toHaveLength(0);
  });

  it('detects a crossing between H and V segments', () => {
    const segH: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const segV: RouteSegment = { from: { gx: 5, gy: 0 }, to: { gx: 5, gy: 10 }, axis: 'v' };
    const crossings = findCrossings([segH], [segV]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].x).toBe(5 * GRID_SIZE);
    expect(crossings[0].y).toBe(5 * GRID_SIZE);
  });

  it('does not report crossing at segment endpoints', () => {
    const segH: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 5, gy: 5 }, axis: 'h' };
    const segV: RouteSegment = { from: { gx: 5, gy: 5 }, to: { gx: 5, gy: 10 }, axis: 'v' };
    const crossings = findCrossings([segH], [segV]);
    expect(crossings).toHaveLength(0);
  });

  it('reports crossing axis as the second segment axis', () => {
    const segH: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const segV: RouteSegment = { from: { gx: 5, gy: 0 }, to: { gx: 5, gy: 10 }, axis: 'v' };
    const crossings = findCrossings([segH], [segV]);
    expect(crossings[0].axis).toBe('v');
  });

  it('crossing includes correct pixel coordinates', () => {
    const segH: RouteSegment = { from: { gx: 0, gy: 3 }, to: { gx: 10, gy: 3 }, axis: 'h' };
    const segV: RouteSegment = { from: { gx: 7, gy: 0 }, to: { gx: 7, gy: 10 }, axis: 'v' };
    const crossings = findCrossings([segH], [segV]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].x).toBe(7 * GRID_SIZE);
    expect(crossings[0].y).toBe(3 * GRID_SIZE);
  });

  it('parallel segments on same grid line do not produce crossings', () => {
    const segA: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 5, gy: 5 }, axis: 'h' };
    const segB: RouteSegment = { from: { gx: 6, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    expect(findCrossings([segA], [segB])).toHaveLength(0);
  });

  it('accepts custom gridSize for pixel coordinate calculation', () => {
    const segH: RouteSegment = { from: { gx: 0, gy: 5 }, to: { gx: 10, gy: 5 }, axis: 'h' };
    const segV: RouteSegment = { from: { gx: 5, gy: 0 }, to: { gx: 5, gy: 10 }, axis: 'v' };
    const crossings = findCrossings([segH], [segV], 16);
    expect(crossings[0].x).toBe(5 * 16);
    expect(crossings[0].y).toBe(5 * 16);
  });
});
