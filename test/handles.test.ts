import { describe, it, expect } from 'vitest';
import { computeHandlePositions, computeEdgeEndpoints, distributeOnSide, computeAllEndpoints } from '../src/handles.js';
import type { NodeRect } from '../src/types.js';

describe('computeHandlePositions', () => {
  const nodeRect: NodeRect = { x: 0, y: 0, w: 160, h: 120 };

  it('returns empty array for node with no connected edges', () => {
    const result = computeHandlePositions('n1', nodeRect, []);
    expect(result).toHaveLength(0);
  });

  it('assigns a handle position for each connected edge', () => {
    const otherRect: NodeRect = { x: 300, y: 0, w: 160, h: 120 };
    const edges = [
      { edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e2', direction: 'source' as const, otherNodeRect: otherRect },
    ];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result).toHaveLength(2);
    for (const h of result) expect(h.position).toBe('right');
  });

  it('assigns unique handle positions (different offsets) per edge on same side', () => {
    const otherRect: NodeRect = { x: 300, y: 0, w: 160, h: 120 };
    const edges = [
      { edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e2', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e3', direction: 'source' as const, otherNodeRect: otherRect },
    ];
    const result = computeHandlePositions('n1', nodeRect, edges);
    const offsets = result.map(h => h.offset);
    const unique = new Set(offsets);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('nodeId is set on each handle', () => {
    const otherRect: NodeRect = { x: 300, y: 60, w: 160, h: 120 };
    const edges = [{ edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect }];
    const result = computeHandlePositions('my-node', nodeRect, edges);
    for (const h of result) expect(h.nodeId).toBe('my-node');
  });

  it('handles edges on multiple sides', () => {
    const rightRect: NodeRect = { x: 400, y: 60, w: 100, h: 100 };
    const bottomRect: NodeRect = { x: 80, y: 400, w: 100, h: 100 };
    const edges = [
      { edgeId: 'e1', direction: 'source' as const, otherNodeRect: rightRect },
      { edgeId: 'e2', direction: 'source' as const, otherNodeRect: bottomRect },
    ];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result).toHaveLength(2);
    const sides = result.map(h => h.position);
    expect(sides).toContain('right');
    expect(sides).toContain('bottom');
  });

  // New tests for center-bias requirement
  it('single edge on right side: handle near center of right side', () => {
    const otherRect: NodeRect = { x: 300, y: 0, w: 100, h: 120 };
    const edges = [{ edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect }];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result).toHaveLength(1);
    expect(result[0].position).toBe('right');
    // Right side length is nodeRect.h = 120. step = 120/2 = 60. snapToGrid(60, 8) = 64 (60/8=7.5 rounds to 8).
    expect(result[0].offset).toBe(64);
  });

  it('two edges on same side: handles evenly spaced around center', () => {
    const otherRect: NodeRect = { x: 300, y: 0, w: 100, h: 120 };
    const edges = [
      { edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e2', direction: 'source' as const, otherNodeRect: otherRect },
    ];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result).toHaveLength(2);
    // Both on right side, with different offsets
    const offsets = result.map(h => h.offset).sort((a, b) => a - b);
    expect(offsets[0]).toBeLessThan(offsets[1]);
  });

  it('three edges on same side: handles distributed across side', () => {
    const otherRect: NodeRect = { x: 300, y: 0, w: 100, h: 120 };
    const edges = [
      { edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e2', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e3', direction: 'source' as const, otherNodeRect: otherRect },
    ];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result).toHaveLength(3);
    const offsets = result.map(h => h.offset).sort((a, b) => a - b);
    // Should be three distinct positions (at least 2 unique given grid snapping)
    expect(new Set(offsets).size).toBeGreaterThanOrEqual(2);
  });

  it('edge to node directly right: handle on right side', () => {
    const rightNode: NodeRect = { x: 400, y: 0, w: 100, h: 120 };
    const edges = [{ edgeId: 'e1', direction: 'source' as const, otherNodeRect: rightNode }];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result[0].position).toBe('right');
  });

  it('edge to node diagonally below-right: handle on right side (dx > dy)', () => {
    const diagNode: NodeRect = { x: 400, y: 100, w: 100, h: 100 };
    const edges = [{ edgeId: 'e1', direction: 'source' as const, otherNodeRect: diagNode }];
    const result = computeHandlePositions('n1', nodeRect, edges);
    // dx = 400+50 - 80 = 370, dy = 100+50 - 60 = 90 => right side
    expect(result[0].position).toBe('right');
  });

  it('edge to node directly below: handle on bottom side', () => {
    const belowNode: NodeRect = { x: 0, y: 400, w: 160, h: 120 };
    const edges = [{ edgeId: 'e1', direction: 'source' as const, otherNodeRect: belowNode }];
    const result = computeHandlePositions('n1', nodeRect, edges);
    expect(result[0].position).toBe('bottom');
  });

  it('overflow wraps to adjacent side when too many edges on one side', () => {
    // Create a very small node so slots run out quickly
    const tinyNode: NodeRect = { x: 0, y: 0, w: 16, h: 16 };
    const otherRect: NodeRect = { x: 200, y: 0, w: 100, h: 100 };
    // Right side of 16h node has only 1 slot (floor(16/8) - 1 = 1)
    const edges = [
      { edgeId: 'e1', direction: 'source' as const, otherNodeRect: otherRect },
      { edgeId: 'e2', direction: 'source' as const, otherNodeRect: otherRect },
    ];
    const result = computeHandlePositions('n1', tinyNode, edges);
    expect(result).toHaveLength(2);
    // First fits on right, second should overflow to adjacent side
    const sides = result.map(h => h.position);
    expect(sides).toContain('right');
    // The overflow side should be different
    const nonRight = sides.filter(s => s !== 'right');
    expect(nonRight.length).toBe(1);
  });
});

describe('distributeOnSide', () => {
  const gridSize = 8;

  it('1 edge: centered on grid line', () => {
    const positions = distributeOnSide(1, 80, gridSize);
    expect(positions).toEqual([80]);
  });

  it('1 edge: snaps center to grid', () => {
    const positions = distributeOnSide(1, 83, gridSize); // 83 snaps to 80
    expect(positions).toEqual([80]);
  });

  it('2 edges: center is gap, pair straddling', () => {
    const positions = distributeOnSide(2, 80, gridSize);
    expect(positions).toEqual([72, 88]); // center ± gridSize
    // Verify center (80) is NOT occupied
    expect(positions).not.toContain(80);
  });

  it('3 edges: one centered, pair on each side', () => {
    const positions = distributeOnSide(3, 80, gridSize);
    expect(positions).toEqual([72, 80, 88]);
    // Middle position is the center
    expect(positions[1]).toBe(80);
  });

  it('4 edges: two pairs, center is gap', () => {
    const positions = distributeOnSide(4, 80, gridSize);
    expect(positions).toEqual([64, 72, 88, 96]);
    expect(positions).not.toContain(80);
  });

  it('5 edges: center + two pairs', () => {
    const positions = distributeOnSide(5, 80, gridSize);
    expect(positions).toEqual([64, 72, 80, 88, 96]);
    expect(positions[2]).toBe(80);
  });

  it('0 edges: empty array', () => {
    expect(distributeOnSide(0, 80, gridSize)).toEqual([]);
  });

  it('all positions are on grid lines', () => {
    for (let n = 1; n <= 8; n++) {
      const positions = distributeOnSide(n, 100, gridSize);
      for (const p of positions) {
        expect(p % gridSize).toBe(0);
      }
    }
  });

  it('positions are always sorted ascending', () => {
    for (let n = 1; n <= 8; n++) {
      const positions = distributeOnSide(n, 120, gridSize);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    }
  });
});

describe('computeAllEndpoints', () => {
  it('single edge: endpoints centered on facing sides', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, w: 160, h: 80 }],
      ['b', { x: 300, y: 0, w: 160, h: 80 }],
    ]);
    const result = computeAllEndpoints(
      [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
      rects,
    );
    expect(result).toHaveLength(1);
    const e = result[0];
    // Source exits right side: x = snapToGrid(160) = 160, y = snapToGrid(40) = 40
    expect(e.sx).toBe(160);
    expect(e.sy).toBe(40);
    // Target enters left side: x = snapToGrid(300) = 304, y = snapToGrid(40) = 40
    expect(e.tx).toBe(304);
    expect(e.ty).toBe(40);
  });

  it('2 edges on same side: straddling center (even rule)', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, w: 160, h: 80 }],
      ['b1', { x: 300, y: -40, w: 160, h: 80 }],
      ['b2', { x: 300, y: 40, w: 160, h: 80 }],
    ]);
    const result = computeAllEndpoints(
      [
        { id: 'e1', sourceId: 'a', targetId: 'b1' },
        { id: 'e2', sourceId: 'a', targetId: 'b2' },
      ],
      rects,
    );
    // Both exit A's right side. Center of right side = y=40, snapped=40
    // 2 edges → positions at 40-8=32 and 40+8=48
    const syValues = result.map(e => e.sy).sort((a, b) => a - b);
    expect(syValues[0]).toBe(32);
    expect(syValues[1]).toBe(48);
    // Center (40) should NOT be used
    expect(syValues).not.toContain(40);
  });

  it('3 edges on same side: center + pair (odd rule)', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, w: 160, h: 80 }],
      ['b1', { x: 300, y: -80, w: 160, h: 80 }],
      ['b2', { x: 300, y: 0, w: 160, h: 80 }],
      ['b3', { x: 300, y: 80, w: 160, h: 80 }],
    ]);
    const result = computeAllEndpoints(
      [
        { id: 'e1', sourceId: 'a', targetId: 'b1' },
        { id: 'e2', sourceId: 'a', targetId: 'b2' },
        { id: 'e3', sourceId: 'a', targetId: 'b3' },
      ],
      rects,
    );
    const syValues = result.map(e => e.sy).sort((a, b) => a - b);
    // Center = 40. 3 edges → [32, 40, 48]
    expect(syValues).toEqual([32, 40, 48]);
    // Center IS used for odd count
    expect(syValues).toContain(40);
  });

  it('all endpoint coordinates are on grid lines', () => {
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 0, w: 160, h: 80 }],
      ['b', { x: 300, y: -60, w: 160, h: 80 }],
      ['c', { x: 300, y: 60, w: 160, h: 80 }],
      ['d', { x: 300, y: 180, w: 160, h: 80 }],
    ]);
    const result = computeAllEndpoints(
      [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'd' },
      ],
      rects,
    );
    // Use Math.abs to handle JS -0 % 8 === -0 quirk
    for (const e of result) {
      expect(Math.abs(e.sx % 8)).toBe(0);
      expect(Math.abs(e.sy % 8)).toBe(0);
      expect(Math.abs(e.tx % 8)).toBe(0);
      expect(Math.abs(e.ty % 8)).toBe(0);
    }
  });

  it('edges sorted by other node perpendicular position', () => {
    // b1 is above, b2 is below — edges should be sorted accordingly on A's right side
    const rects = new Map<string, NodeRect>([
      ['a', { x: 0, y: 100, w: 160, h: 80 }],
      ['b1', { x: 300, y: 0, w: 160, h: 80 }],   // above
      ['b2', { x: 300, y: 200, w: 160, h: 80 }],  // below
    ]);
    const result = computeAllEndpoints(
      [
        { id: 'e1', sourceId: 'a', targetId: 'b1' },
        { id: 'e2', sourceId: 'a', targetId: 'b2' },
      ],
      rects,
    );
    // e1 (to upper node) should have lower sy than e2 (to lower node)
    expect(result[0].sy).toBeLessThan(result[1].sy);
  });
});

describe('computeEdgeEndpoints', () => {
  it('exits right side when target is to the right', () => {
    const source: NodeRect = { x: 0, y: 0, w: 100, h: 100 };
    const target: NodeRect = { x: 300, y: 0, w: 100, h: 100 };
    const { sx, sy, tx, ty } = computeEdgeEndpoints(source, target);
    expect(sx).toBe(104); // snapToGrid(100) = 104
    expect(tx).toBe(304); // snapToGrid(300) = 304
  });

  it('exits left side when target is to the left', () => {
    const source: NodeRect = { x: 300, y: 0, w: 100, h: 100 };
    const target: NodeRect = { x: 0, y: 0, w: 100, h: 100 };
    const { sx, tx } = computeEdgeEndpoints(source, target);
    expect(sx).toBe(304); // snapToGrid(300) = 304
    expect(tx).toBe(104); // snapToGrid(100) = 104
  });

  it('exits bottom when target is below', () => {
    const source: NodeRect = { x: 0, y: 0, w: 100, h: 100 };
    const target: NodeRect = { x: 0, y: 300, w: 100, h: 100 };
    const { sy, ty } = computeEdgeEndpoints(source, target);
    expect(sy).toBe(104); // snapToGrid(100) = 104
    expect(ty).toBe(304); // snapToGrid(300) = 304
  });
});
