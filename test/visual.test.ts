/**
 * Visual regression tests — render scenarios to SVG and compare against golden files.
 *
 * Golden files live in docs/images/*.svg (the same ones used in README/article).
 * Run `npx tsx scripts/export-svg.ts` to regenerate goldens after intentional changes.
 *
 * These tests verify that routing + rendering produce stable, expected output.
 * A diff means either:
 *   (a) an intentional algorithm change → update goldens with export-svg.ts
 *   (b) an unintentional regression → investigate
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildScenarioNegotiated,
  getCell,
  type NodeDef,
  type EdgeDef,
  type Grid2D,
  type ConnectionPoint,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// SVG renderer (same logic as export-svg.ts to ensure parity)
// ---------------------------------------------------------------------------

const NODE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];
const EDGE_COLORS = [
  '#93c5fd', '#fca5a5', '#6ee7b7', '#fcd34d',
  '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74',
];
function nodeColor(id: number): string { return NODE_COLORS[(id - 1) % NODE_COLORS.length]!; }
function edgeColor(id: number): string { return EDGE_COLORS[(id - 1) % EDGE_COLORS.length]!; }
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function gridToSvg(
  grid: Grid2D,
  nodes: NodeDef[],
  connections: ConnectionPoint[],
  cellPx: number = 20,
): string {
  const w = grid.cols * cellPx;
  const h = grid.rows * cellPx;
  const lines: string[] = [];

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="font-family:monospace">`);
  lines.push(`<rect width="${w}" height="${h}" fill="#fafafa"/>`);

  const nodeLabels = new Map<number, string>();
  for (const n of nodes) nodeLabels.set(n.id, n.label);

  const connMap = new Map<string, ConnectionPoint>();
  for (const cp of connections) connMap.set(`${cp.col}:${cp.row}`, cp);

  const nodeLabelCells = new Map<string, string>();
  for (const n of nodes) {
    const cx = n.col + Math.floor(n.w / 2);
    const cy = n.row + Math.floor(n.h / 2);
    nodeLabelCells.set(`${cx}:${cy}`, n.label);
  }

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      const x = c * cellPx;
      const y = r * cellPx;

      let fill = '#f5f5f5';
      let stroke = '#e0e0e0';
      let strokeW = 0.5;

      switch (cell.type) {
        case 'node':
          fill = nodeColor(cell.id);
          stroke = fill;
          break;
        case 'connection':
          fill = nodeColor(cell.id) + '70';
          stroke = nodeColor(cell.id);
          strokeW = 1.5;
          break;
        case 'edge':
          fill = edgeColor(cell.id);
          stroke = '#d0d0d0';
          break;
        case 'jump':
          fill = '#fbbf24';
          stroke = '#f59e0b';
          strokeW = 1.5;
          break;
        case 'blocked':
          fill = '#e5e5e5';
          stroke = '#d0d0d0';
          break;
      }

      lines.push(`<rect x="${x}" y="${y}" width="${cellPx}" height="${cellPx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`);

      const key = `${c}:${r}`;
      const labelCell = nodeLabelCells.get(key);
      if (labelCell) {
        lines.push(`<text x="${x + cellPx / 2}" y="${y + cellPx / 2}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${Math.min(9, cellPx * 0.45)}" font-weight="bold">${esc(labelCell)}</text>`);
      } else if (cell.type === 'connection') {
        const cp = connMap.get(key);
        if (cp?.otherNodeLabel) {
          const label = cp.otherNodeLabel.slice(0, 3);
          lines.push(`<text x="${x + cellPx / 2}" y="${y + cellPx / 2}" text-anchor="middle" dominant-baseline="central" fill="#333" font-size="${Math.min(7, cellPx * 0.35)}">${esc(label)}</text>`);
        }
      }
    }
  }

  lines.push('</svg>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Scenario builder (mirrors export-svg.ts)
// ---------------------------------------------------------------------------

let _nodeId = 0;
let _edgeId = 0;
function resetIds() { _nodeId = 0; _edgeId = 0; }
function N(label: string, col: number, row: number, w = 5, h = 5): NodeDef {
  return { id: ++_nodeId, label, col, row, w, h };
}
function E(source: number, target: number): EdgeDef {
  return { id: ++_edgeId, source, target };
}

interface Scenario {
  id: string;
  title: string;
  nodes: NodeDef[];
  edges: EdgeDef[];
  padding?: number;
}

// ---------------------------------------------------------------------------
// Golden file directory
// ---------------------------------------------------------------------------

const GOLDEN_DIR = join(import.meta.dirname!, '..', 'docs', 'images');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('visual regression: SVG golden files', () => {
  /**
   * For each scenario, route it, render to SVG, and compare against the
   * golden file in docs/images/. If no golden exists, the test fails with
   * a message to generate it.
   */

  function testScenario(s: Scenario) {
    const goldenPath = join(GOLDEN_DIR, `${s.id}.svg`);

    it(`${s.id} matches golden SVG`, () => {
      expect(existsSync(goldenPath)).toBe(true);
      const golden = readFileSync(goldenPath, 'utf-8');

      const result = buildScenarioNegotiated(s.nodes, s.edges, s.padding ?? 2);
      const actual = gridToSvg(result.grid, s.nodes, result.connections);

      expect(actual).toBe(golden);
    });
  }

  function testScenarioStructural(s: Scenario) {
    it(`${s.id} produces valid routing`, () => {
      const result = buildScenarioNegotiated(s.nodes, s.edges, s.padding ?? 2);

      // All edges should route
      expect(result.paths?.size).toBe(s.edges.length);

      // No edge should pass through node cells
      for (const [, epath] of result.paths!) {
        for (const cell of epath.cells) {
          const gc = getCell(result.grid, cell.col, cell.row);
          if (gc?.type === 'node') {
            // Connection points are adjacent to nodes, not inside them
            // but the path start/end might touch a connection cell that overlaps
            // with the node boundary — this shouldn't happen for interior cells
            const isEndpoint = (cell === epath.cells[0]) || (cell === epath.cells[epath.cells.length - 1]);
            if (!isEndpoint) {
              expect(gc.type).not.toBe('node');
            }
          }
        }
      }

      // Connections should exist for each edge endpoint
      for (const e of s.edges) {
        const srcConn = result.connections.find(c => c.edgeId === e.id && c.nodeId === e.source);
        const tgtConn = result.connections.find(c => c.edgeId === e.id && c.nodeId === e.target);
        expect(srcConn).toBeDefined();
        expect(tgtConn).toBeDefined();
      }
    });
  }

  // --- Tier 1: Basic ---
  describe('basic', () => {
    resetIds();
    let a = N('A', 2, 3), b = N('B', 18, 3);
    testScenario({ id: 'horizontal', title: 'Horizontal', nodes: [a, b], edges: [E(a.id, b.id)] });

    resetIds();
    a = N('A', 6, 1); b = N('B', 6, 14);
    testScenario({ id: 'vertical', title: 'Vertical', nodes: [a, b], edges: [E(a.id, b.id)] });

    resetIds();
    a = N('A', 2, 1); b = N('B', 18, 12);
    testScenario({ id: 'diagonal-se', title: 'Diagonal SE', nodes: [a, b], edges: [E(a.id, b.id)] });
  });

  // --- Tier 2: Handle positioning ---
  describe('handle positioning', () => {
    resetIds();
    const a = N('A', 2, 1), b = N('B', 2, 10), c = N('C', 20, 5);
    testScenario({ id: '2-to-1', title: '2 into 1', nodes: [a, b, c], edges: [E(a.id, c.id), E(b.id, c.id)] });

    resetIds();
    const a2 = N('A', 2, 1), b2 = N('B', 2, 9), c2 = N('C', 2, 17), d2 = N('D', 20, 9);
    testScenario({ id: '3-to-1', title: '3 into 1', nodes: [a2, b2, c2, d2], edges: [E(a2.id, d2.id), E(b2.id, d2.id), E(c2.id, d2.id)] });
  });

  // --- Tier 3: Patterns ---
  describe('patterns', () => {
    resetIds();
    const cA = N('A', 1, 4), cB = N('B', 12, 4), cC = N('C', 23, 4), cD = N('D', 34, 4);
    testScenario({ id: 'chain', title: 'Chain', nodes: [cA, cB, cC, cD], edges: [E(cA.id, cB.id), E(cB.id, cC.id), E(cC.id, cD.id)] });

    resetIds();
    const dA = N('A', 12, 1), dB = N('B', 2, 10), dC = N('C', 22, 10), dD = N('D', 12, 18);
    testScenario({ id: 'diamond', title: 'Diamond', nodes: [dA, dB, dC, dD], edges: [E(dA.id, dB.id), E(dA.id, dC.id), E(dB.id, dD.id), E(dC.id, dD.id)] });
  });

  // --- Tier 4: Connection negotiation ---
  describe('connection negotiation', () => {
    resetIds();
    {
      const nA = N('A', 2, 8, 5, 5);
      const nB = N('B', 22, 8, 5, 5);
      const w1 = N('W1', 12, 1, 4, 6);
      const w2 = N('W2', 12, 7, 4, 6);
      const w3 = N('W3', 12, 13, 4, 6);
      const s: Scenario = { id: 'neg-wall', title: 'Wall Obstacle', nodes: [nA, nB, w1, w2, w3], edges: [E(nA.id, nB.id)] };
      testScenario(s);
      testScenarioStructural(s);
    }

    resetIds();
    {
      const nA = N('A', 2, 2, 6, 6);
      const nB = N('B', 22, 18, 6, 6);
      const s: Scenario = { id: 'neg-diagonal', title: 'Diagonal', nodes: [nA, nB], edges: [E(nA.id, nB.id)] };
      testScenario(s);
      testScenarioStructural(s);
    }

    resetIds();
    {
      const hub = N('Hub', 14, 12, 7, 7);
      const nN = N('N', 16, 1, 4, 4);
      const nNE = N('NE', 28, 3, 4, 4);
      const nE = N('E', 30, 13, 4, 4);
      const nSE = N('SE', 28, 24, 4, 4);
      const nS = N('S', 16, 26, 4, 4);
      const nSW = N('SW', 3, 24, 4, 4);
      const nW = N('W', 1, 13, 4, 4);
      const nNW = N('NW', 3, 3, 4, 4);
      const s: Scenario = {
        id: 'neg-compass', title: '8-Point Compass',
        nodes: [hub, nN, nNE, nE, nSE, nS, nSW, nW, nNW],
        edges: [
          E(nN.id, hub.id), E(nNE.id, hub.id), E(nE.id, hub.id), E(nSE.id, hub.id),
          E(nS.id, hub.id), E(nSW.id, hub.id), E(nW.id, hub.id), E(nNW.id, hub.id),
        ],
      };
      testScenario(s);
      testScenarioStructural(s);
    }

    resetIds();
    {
      const src = N('Src', 2, 12, 6, 11);
      const t1 = N('T1', 22, 1, 4, 4);
      const t2 = N('T2', 22, 7, 4, 4);
      const t3 = N('T3', 22, 13, 4, 4);
      const t4 = N('T4', 22, 19, 4, 4);
      const t5 = N('T5', 22, 25, 4, 4);
      const s: Scenario = {
        id: 'neg-congested', title: 'Congested Side (1→5)',
        nodes: [src, t1, t2, t3, t4, t5],
        edges: [E(src.id, t1.id), E(src.id, t2.id), E(src.id, t3.id), E(src.id, t4.id), E(src.id, t5.id)],
      };
      testScenario(s);
      testScenarioStructural(s);
    }

    resetIds();
    {
      const nA = N('A', 2, 2, 5, 5);
      const nB = N('B', 2, 20, 5, 5);
      const wall = N('Wall', 2, 10, 20, 4);
      const s: Scenario = { id: 'neg-l-shape', title: 'L-Shape', nodes: [nA, nB, wall], edges: [E(nA.id, nB.id)] };
      testScenario(s);
      testScenarioStructural(s);
    }
  });

  // --- Tier 5: Complex (structural only — skip SVG golden for large grids) ---
  describe('stress test structural', () => {
    resetIds();
    const hub = N('Hub', 12, 10);
    const sN = N('N', 12, 1), sNE = N('NE', 22, 4), sSE = N('SE', 22, 16), sSW = N('SW', 2, 16), sNW = N('NW', 2, 4);
    testScenarioStructural({
      id: 'star', title: 'Star',
      nodes: [hub, sN, sNE, sSE, sSW, sNW],
      edges: [E(sN.id, hub.id), E(sNE.id, hub.id), E(sSE.id, hub.id), E(sSW.id, hub.id), E(sNW.id, hub.id)],
    });
  });
});
