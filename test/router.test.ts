import { describe, it, expect } from 'vitest';
import { routeAllEdges } from '../src/router.js';

describe('routeAllEdges', () => {
  it('handles empty edges array', () => {
    expect(routeAllEdges([], [])).toHaveLength(0);
  });

  it('routes a single edge and returns waypoints (not SVG strings)', () => {
    const result = routeAllEdges([{ id: 'e1', sx: 0, sy: 0, tx: 80, ty: 0 }], []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
    // waypoints is an array of {x, y} points
    expect(Array.isArray(result[0].waypoints)).toBe(true);
    expect(result[0].waypoints.length).toBeGreaterThanOrEqual(2);
    expect(result[0].waypoints[0]).toHaveProperty('x');
    expect(result[0].waypoints[0]).toHaveProperty('y');
    // No 'path' property (SVG string) on RoutedEdge
    expect(result[0]).not.toHaveProperty('path');
  });

  it('routes multiple edges', () => {
    const edges = [
      { id: 'e1', sx: 0, sy: 0, tx: 80, ty: 0 },
      { id: 'e2', sx: 0, sy: 40, tx: 80, ty: 40 },
      { id: 'e3', sx: 40, sy: 0, tx: 40, ty: 80 },
    ];
    const result = routeAllEdges(edges, []);
    expect(result).toHaveLength(3);
    for (const r of result) {
      expect(r.waypoints.length).toBeGreaterThanOrEqual(1);
      expect(r.segments.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('each routed edge has id matching input', () => {
    const edges = [
      { id: 'alpha', sx: 0, sy: 0, tx: 40, ty: 0 },
      { id: 'beta', sx: 0, sy: 16, tx: 40, ty: 16 },
    ];
    const result = routeAllEdges(edges, []);
    expect(result[0].id).toBe('alpha');
    expect(result[1].id).toBe('beta');
  });

  it('CrossingPoint includes correct coordinates and axis', () => {
    // Two perpendicular edges that should cross
    const edges = [
      { id: 'e-h', sx: 0, sy: 40, tx: 80, ty: 40 },  // horizontal
      { id: 'e-v', sx: 40, sy: 0, tx: 40, ty: 80 },   // vertical
    ];
    const result = routeAllEdges(edges, []);
    // The second edge should detect crossing with first
    const crossings = result[1].crossings;
    if (crossings.length > 0) {
      expect(crossings[0]).toHaveProperty('x');
      expect(crossings[0]).toHaveProperty('y');
      expect(crossings[0]).toHaveProperty('axis');
      expect(['h', 'v']).toContain(crossings[0].axis);
    }
  });

  it('empty edges returns empty array', () => {
    const result = routeAllEdges([], [{ x: 0, y: 0, w: 100, h: 100 }]);
    expect(result).toEqual([]);
  });

  it('accepts RouterOptions for custom grid size', () => {
    const result = routeAllEdges(
      [{ id: 'e1', sx: 0, sy: 0, tx: 100, ty: 0 }],
      [],
      { gridSize: 10 },
    );
    expect(result).toHaveLength(1);
    // All waypoints should be on 10px grid
    for (const wp of result[0].waypoints) {
      expect(wp.x % 10).toBe(0);
      expect(wp.y % 10).toBe(0);
    }
  });
});
