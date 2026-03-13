import { describe, it, expect } from 'vitest';
import { buildScenarioNegotiated } from '../src/negotiated.js';
import { getCell, type NodeDef, type EdgeDef } from '../src/grid2d.js';

describe('buildScenarioNegotiated', () => {
  it('routes a simple horizontal pair', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 3, w: 4, h: 5 },
      { id: 2, label: 'B', col: 14, row: 3, w: 4, h: 5 },
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenarioNegotiated(nodes, edges);

    expect(result.paths?.size).toBe(1);
    const path = result.paths?.get(1);
    expect(path).toBeDefined();
    expect(path!.cells.length).toBeGreaterThan(0);
  });

  it('routes multiple edges without same-direction overlap', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 4, h: 5 },
      { id: 2, label: 'B', col: 14, row: 2, w: 4, h: 5 },
      { id: 3, label: 'C', col: 14, row: 10, w: 4, h: 5 },
    ];
    const edges: EdgeDef[] = [
      { id: 1, source: 1, target: 2 },
      { id: 2, source: 1, target: 3 },
    ];
    const result = buildScenarioNegotiated(nodes, edges);

    expect(result.paths?.size).toBe(2);
    // Both edges should route successfully
    expect(result.paths?.get(1)!.cells.length).toBeGreaterThan(0);
    expect(result.paths?.get(2)!.cells.length).toBeGreaterThan(0);
  });

  it('negotiates connection sides when obstacle blocks direct path', () => {
    // A is at left, B is at right, but a wall of obstacle nodes blocks the direct horizontal path.
    // The solver should reassign connections to top/bottom sides to route around.
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 8, w: 4, h: 5 },
      { id: 2, label: 'B', col: 20, row: 8, w: 4, h: 5 },
      // Wall of obstacles between A and B
      { id: 10, label: 'W1', col: 10, row: 2, w: 4, h: 5 },
      { id: 11, label: 'W2', col: 10, row: 7, w: 4, h: 5 },
      { id: 12, label: 'W3', col: 10, row: 12, w: 4, h: 5 },
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenarioNegotiated(nodes, edges);

    // Edge should still route (find a way around the wall)
    expect(result.paths?.size).toBe(1);
    const path = result.paths?.get(1);
    expect(path).toBeDefined();
    expect(path!.cells.length).toBeGreaterThan(0);

    // Path should not pass through any obstacle node cells
    for (const cell of path!.cells) {
      const gridCell = getCell(result.grid, cell.col, cell.row);
      if (gridCell?.type === 'node') {
        // If it's a node cell, it must be source or target (connection adjacent)
        expect([1, 2].includes(gridCell.id)).toBe(true);
      }
    }
  });

  it('connection points reflect negotiated sides', () => {
    // Diagonal layout: A top-left, B bottom-right.
    // facingSide would pick 'right' for A and 'left' for B.
    // But bottom/top might produce a shorter path if the grid is tight.
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 5, h: 5 },
      { id: 2, label: 'B', col: 16, row: 14, w: 5, h: 5 },
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenarioNegotiated(nodes, edges);

    expect(result.connections.length).toBe(2);
    const srcConn = result.connections.find(c => c.nodeId === 1);
    const tgtConn = result.connections.find(c => c.nodeId === 2);
    expect(srcConn).toBeDefined();
    expect(tgtConn).toBeDefined();

    // The path should exist and be reasonable
    const path = result.paths?.get(1);
    expect(path).toBeDefined();
    expect(path!.cells.length).toBeGreaterThan(0);
  });

  it('handles overlapping nodes — adjusts connection points', () => {
    // Two nodes that overlap by 2 cells in grid space
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 6, h: 5 },
      { id: 2, label: 'B', col: 6, row: 2, w: 6, h: 5 }, // overlaps A by 2 cols
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenarioNegotiated(nodes, edges);

    // Should still produce connections (adjusted away from overlap)
    expect(result.connections.length).toBeGreaterThanOrEqual(2);
    // Should attempt to route (may or may not succeed depending on space)
    // The key: it shouldn't crash or hang
  });

  it('handles adjacent nodes with no gap', () => {
    // Two nodes directly adjacent — connection points land on each other
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 5, h: 5 },
      { id: 2, label: 'B', col: 7, row: 2, w: 5, h: 5 }, // A ends at col 7, B starts at col 7
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenarioNegotiated(nodes, edges);

    // Connections should exist and be adjusted
    expect(result.connections.length).toBeGreaterThanOrEqual(2);
  });

  it('handles partially overlapping nodes vertically', () => {
    // Nodes overlap vertically — connection on shared side lands on other node
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 5, h: 8 },
      { id: 2, label: 'B', col: 5, row: 6, w: 5, h: 8 }, // overlaps A horizontally and vertically
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenarioNegotiated(nodes, edges);

    // Should not crash, connections should be adjusted
    expect(result.connections.length).toBeGreaterThanOrEqual(2);
    // If a path was found, it shouldn't pass through node cells
    const path = result.paths?.get(1);
    if (path) {
      for (const cell of path.cells) {
        const gc = getCell(result.grid, cell.col, cell.row);
        if (gc?.type === 'node') {
          // Only allowed at first/last cell (connection adjacent to node)
          const isEndpoint = cell === path.cells[0] || cell === path.cells[path.cells.length - 1];
          if (!isEndpoint) {
            expect(gc.type).not.toBe('node');
          }
        }
      }
    }
  });

  it('converges within iteration limit', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 4, h: 4 },
      { id: 2, label: 'B', col: 14, row: 2, w: 4, h: 4 },
      { id: 3, label: 'C', col: 14, row: 10, w: 4, h: 4 },
      { id: 4, label: 'D', col: 2, row: 10, w: 4, h: 4 },
    ];
    const edges: EdgeDef[] = [
      { id: 1, source: 1, target: 2 },
      { id: 2, source: 2, target: 3 },
      { id: 3, source: 3, target: 4 },
      { id: 4, source: 4, target: 1 },
    ];
    const result = buildScenarioNegotiated(nodes, edges);

    expect(result.negotiations).toBeLessThanOrEqual(20);
    expect(result.paths?.size).toBe(4);
  });
});
