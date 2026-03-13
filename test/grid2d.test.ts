import { describe, it, expect } from 'vitest';
import {
  createGrid,
  getCell,
  setCell,
  distributeConnections,
  buildScenario,
  type NodeDef,
  type EdgeDef,
} from '../src/grid2d.js';

describe('createGrid', () => {
  it('creates grid with correct dimensions', () => {
    const grid = createGrid(10, 8);
    expect(grid.cols).toBe(10);
    expect(grid.rows).toBe(8);
    expect(grid.cells.length).toBe(8);
    expect(grid.cells[0]!.length).toBe(10);
  });

  it('all cells start empty', () => {
    const grid = createGrid(5, 5);
    for (const row of grid.cells) {
      for (const cell of row) {
        expect(cell.type).toBe('empty');
        expect(cell.id).toBe(0);
      }
    }
  });
});

describe('getCell / setCell', () => {
  it('gets and sets cells', () => {
    const grid = createGrid(5, 5);
    setCell(grid, 2, 3, 'node', 1);
    const cell = getCell(grid, 2, 3);
    expect(cell?.type).toBe('node');
    expect(cell?.id).toBe(1);
  });

  it('returns null for out-of-bounds', () => {
    const grid = createGrid(5, 5);
    expect(getCell(grid, -1, 0)).toBeNull();
    expect(getCell(grid, 5, 0)).toBeNull();
    expect(getCell(grid, 0, 5)).toBeNull();
  });
});

describe('distributeConnections', () => {
  it('1 connection: at center', () => {
    // Side from row 2, length 5 → center = 2 + floor(4/2) = 4
    expect(distributeConnections(2, 5, 1)).toEqual([4]);
  });

  it('2 connections: center is gap', () => {
    // Center = 4, even → [3, 5]
    expect(distributeConnections(2, 5, 2)).toEqual([3, 5]);
    // Center is not in the list
    expect(distributeConnections(2, 5, 2)).not.toContain(4);
  });

  it('3 connections: center occupied + pair', () => {
    // Center = 4, odd → [2, 4, 6]
    expect(distributeConnections(2, 5, 3)).toEqual([2, 4, 6]);
    expect(distributeConnections(2, 5, 3)).toContain(4); // center IS occupied
  });

  it('4 connections: two pairs, center gap', () => {
    const result = distributeConnections(2, 9, 4);
    expect(result).toHaveLength(4);
    // Center = 2 + floor(8/2) = 6
    expect(result).not.toContain(6); // center is gap
    // Should be symmetric around center
    const center = 6;
    const dists = result.map(p => p - center);
    for (const d of dists) {
      expect(dists).toContain(-d);
    }
  });

  it('0 connections: empty', () => {
    expect(distributeConnections(0, 5, 0)).toEqual([]);
  });

  it('positions are sorted ascending', () => {
    for (let n = 1; n <= 6; n++) {
      const positions = distributeConnections(0, 15, n);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
      }
    }
  });

  it('adjacent positions have gap of 2 (1 empty cell between)', () => {
    for (let n = 2; n <= 5; n++) {
      const positions = distributeConnections(0, 15, n);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBe(2);
      }
    }
  });
});

describe('buildScenario', () => {
  it('places nodes on the grid', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 4, h: 3 },
    ];
    const result = buildScenario(nodes, []);
    const cell = getCell(result.grid, 3, 3);
    expect(cell?.type).toBe('node');
    expect(cell?.id).toBe(1);
  });

  it('creates connection points adjacent to nodes', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 4, h: 5 },
      { id: 2, label: 'B', col: 14, row: 2, w: 4, h: 5 },
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenario(nodes, edges);

    // Source connection: right side of A → col = 2+4 = 6
    expect(result.connections.some(c => c.nodeId === 1 && c.col === 6)).toBe(true);

    // Target connection: left side of B → col = 14-1 = 13
    expect(result.connections.some(c => c.nodeId === 2 && c.col === 13)).toBe(true);
  });

  it('connection points are on the grid as connection type', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 4, h: 5 },
      { id: 2, label: 'B', col: 14, row: 2, w: 4, h: 5 },
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenario(nodes, edges);

    for (const cp of result.connections) {
      const cell = getCell(result.grid, cp.col, cp.row);
      // Connection cells may be overwritten by edge routing, so check original placement
      expect(cell).not.toBeNull();
      // The cell should be connection or edge (if routing passed through)
      expect(['connection', 'edge'].includes(cell!.type)).toBe(true);
    }
  });

  it('routes an edge between two horizontal nodes', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 3, w: 4, h: 5 },
      { id: 2, label: 'B', col: 14, row: 3, w: 4, h: 5 },
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenario(nodes, edges);

    // There should be edge cells between the two nodes
    let edgeCellCount = 0;
    for (const row of result.grid.cells) {
      for (const cell of row) {
        if (cell.type === 'edge' && cell.id === 1) edgeCellCount++;
      }
    }
    expect(edgeCellCount).toBeGreaterThan(0);
  });

  it('edges never pass through node cells', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 5, h: 5 },
      { id: 2, label: 'B', col: 14, row: 2, w: 5, h: 5 },
      { id: 3, label: 'C', col: 8, row: 3, w: 3, h: 3 }, // obstacle between A and B
    ];
    const edges: EdgeDef[] = [{ id: 1, source: 1, target: 2 }];
    const result = buildScenario(nodes, edges);

    // Check that no node cell was overwritten by an edge
    for (const n of nodes) {
      for (let r = n.row; r < n.row + n.h; r++) {
        for (let c = n.col; c < n.col + n.w; c++) {
          const cell = getCell(result.grid, c, r);
          expect(cell?.type).toBe('node');
          expect(cell?.id).toBe(n.id);
        }
      }
    }
  });

  it('connection points are center-biased for odd count', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 5, h: 7 },
      { id: 2, label: 'B1', col: 16, row: 1, w: 4, h: 3 },
      { id: 3, label: 'B2', col: 16, row: 6, w: 4, h: 3 },
      { id: 4, label: 'B3', col: 16, row: 11, w: 4, h: 3 },
    ];
    const edges: EdgeDef[] = [
      { id: 1, source: 1, target: 2 },
      { id: 2, source: 1, target: 3 },
      { id: 3, source: 1, target: 4 },
    ];
    const result = buildScenario(nodes, edges);

    // 3 connections on right side of A: odd → center occupied
    const rightConns = result.connections
      .filter(c => c.nodeId === 1 && c.side === 'right')
      .sort((a, b) => a.row - b.row);

    expect(rightConns).toHaveLength(3);
    // Center row of node A's right side: row 2 + floor(6/2) = 5
    const centerRow = 2 + Math.floor((7 - 1) / 2);
    expect(rightConns[1]!.row).toBe(centerRow); // middle connection at center
  });

  it('connection points are center-biased for even count', () => {
    const nodes: NodeDef[] = [
      { id: 1, label: 'A', col: 2, row: 2, w: 5, h: 7 },
      { id: 2, label: 'B1', col: 16, row: 1, w: 4, h: 3 },
      { id: 3, label: 'B2', col: 16, row: 9, w: 4, h: 3 },
    ];
    const edges: EdgeDef[] = [
      { id: 1, source: 1, target: 2 },
      { id: 2, source: 1, target: 3 },
    ];
    const result = buildScenario(nodes, edges);

    // 2 connections on right side of A: even → center is gap
    const rightConns = result.connections
      .filter(c => c.nodeId === 1 && c.side === 'right')
      .sort((a, b) => a.row - b.row);

    expect(rightConns).toHaveLength(2);
    const centerRow = 2 + Math.floor((7 - 1) / 2); // = 5
    // Neither connection should be at center
    for (const cp of rightConns) {
      expect(cp.row).not.toBe(centerRow);
    }
    // They should straddle center
    expect(rightConns[0]!.row).toBeLessThan(centerRow);
    expect(rightConns[1]!.row).toBeGreaterThan(centerRow);
  });
});
