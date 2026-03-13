#!/usr/bin/env npx tsx
/**
 * export-svg.ts — Generate SVG images from grid-router scenarios.
 *
 * Usage:
 *   npx tsx scripts/export-svg.ts          # exports all scenarios to docs/images/
 *   npx tsx scripts/export-svg.ts star     # exports only the "star" scenario
 *
 * Each SVG shows the Grid2D cell map: nodes, edges, connections, jumps,
 * blocked corridors — the same visualization as the browser test harness.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildScenarioNegotiated,
  type NodeDef,
  type EdgeDef,
  type Grid2D,
  type ConnectionPoint,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Color palette (matches GridView.tsx)
// ---------------------------------------------------------------------------

const NODE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const EDGE_COLORS = [
  '#93c5fd', '#fca5a5', '#6ee7b7', '#fcd34d',
  '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74',
];

function nodeColor(id: number): string { return NODE_COLORS[(id - 1) % NODE_COLORS.length]; }
function edgeColor(id: number): string { return EDGE_COLORS[(id - 1) % EDGE_COLORS.length]; }

// ---------------------------------------------------------------------------
// SVG renderer
// ---------------------------------------------------------------------------

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

  // Node label lookup
  const nodeLabels = new Map<number, string>();
  for (const n of nodes) nodeLabels.set(n.id, n.label);

  // Connection lookup for labels
  const connMap = new Map<string, ConnectionPoint>();
  for (const cp of connections) connMap.set(`${cp.col}:${cp.row}`, cp);

  // Label placement (center of each node)
  const nodeLabelCells = new Map<string, string>();
  for (const n of nodes) {
    const cx = n.col + Math.floor(n.w / 2);
    const cy = n.row + Math.floor(n.h / 2);
    nodeLabelCells.set(`${cx}:${cy}`, n.label);
  }

  // Draw cells
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

      // Labels
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Scenario definitions (same as GridRouterTestPage)
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

function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  // Tier 1: Basic
  resetIds();
  let a = N('A', 2, 3), b = N('B', 18, 3);
  scenarios.push({ id: 'horizontal', title: 'Horizontal', nodes: [a, b], edges: [E(a.id, b.id)] });

  resetIds();
  a = N('A', 6, 1); b = N('B', 6, 14);
  scenarios.push({ id: 'vertical', title: 'Vertical', nodes: [a, b], edges: [E(a.id, b.id)] });

  resetIds();
  a = N('A', 2, 1); b = N('B', 18, 12);
  scenarios.push({ id: 'diagonal-se', title: 'Diagonal SE', nodes: [a, b], edges: [E(a.id, b.id)] });

  // Tier 2: Handle positioning
  resetIds();
  a = N('A', 2, 1); b = N('B', 2, 10); const c = N('C', 20, 5);
  scenarios.push({ id: '2-to-1', title: '2 into 1', nodes: [a, b, c], edges: [E(a.id, c.id), E(b.id, c.id)] });

  resetIds();
  a = N('A', 2, 1); b = N('B', 2, 9); const c2 = N('C', 2, 17); const d = N('D', 20, 9);
  scenarios.push({ id: '3-to-1', title: '3 into 1', nodes: [a, b, c2, d], edges: [E(a.id, d.id), E(b.id, d.id), E(c2.id, d.id)] });

  resetIds();
  const src = N('Src', 2, 7);
  const t1 = N('T1', 20, 1), t2 = N('T2', 20, 8), t3 = N('T3', 20, 15), t4 = N('T4', 20, 22);
  scenarios.push({ id: 'fan-out', title: 'Fan Out (1→4)', nodes: [src, t1, t2, t3, t4], edges: [E(src.id, t1.id), E(src.id, t2.id), E(src.id, t3.id), E(src.id, t4.id)] });

  // Tier 3: Crossings
  resetIds();
  const xA = N('A', 2, 2), xB = N('B', 20, 14), xC = N('C', 2, 14), xD = N('D', 20, 2);
  scenarios.push({ id: 'x-cross', title: 'X Crossing', nodes: [xA, xB, xC, xD], edges: [E(xA.id, xB.id), E(xC.id, xD.id)] });

  // Tier 4: Patterns
  resetIds();
  const cA = N('A', 1, 4), cB = N('B', 12, 4), cC = N('C', 23, 4), cD = N('D', 34, 4);
  scenarios.push({ id: 'chain', title: 'Chain A→B→C→D', nodes: [cA, cB, cC, cD], edges: [E(cA.id, cB.id), E(cB.id, cC.id), E(cC.id, cD.id)] });

  resetIds();
  const diaA = N('A', 12, 1), diaB = N('B', 2, 10), diaC = N('C', 22, 10), diaD = N('D', 12, 18);
  scenarios.push({ id: 'diamond', title: 'Diamond', nodes: [diaA, diaB, diaC, diaD], edges: [E(diaA.id, diaB.id), E(diaA.id, diaC.id), E(diaB.id, diaD.id), E(diaC.id, diaD.id)] });

  // Tier 5: Complex
  resetIds();
  const hub = N('Hub', 12, 10);
  const sN = N('N', 12, 1), sNE = N('NE', 22, 4), sSE = N('SE', 22, 16), sSW = N('SW', 2, 16), sNW = N('NW', 2, 4);
  scenarios.push({ id: 'star', title: 'Star (5→hub)', nodes: [hub, sN, sNE, sSE, sSW, sNW], edges: [E(sN.id, hub.id), E(sNE.id, hub.id), E(sSE.id, hub.id), E(sSW.id, hub.id), E(sNW.id, hub.id)] });

  // Tier 6: Distribution
  resetIds();
  const dA = N('A', 2, 4, 5, 7);
  const dB1 = N('B1', 18, 1), dB2 = N('B2', 18, 6), dB3 = N('B3', 18, 13);
  scenarios.push({ id: 'dist-3', title: '3-Edge Distribution', nodes: [dA, dB1, dB2, dB3], edges: [E(dA.id, dB1.id), E(dA.id, dB2.id), E(dA.id, dB3.id)] });

  // Tier 7: Connection Negotiation
  // These scenarios demonstrate side reassignment — the solver picks non-obvious
  // connection sides when they produce shorter or less congested paths.

  resetIds();
  {
    // Obstacle wall blocks direct horizontal path → solver should route around
    // and potentially reassign connection sides to top/bottom
    const nA = N('A', 2, 8, 5, 5);
    const nB = N('B', 22, 8, 5, 5);
    const w1 = N('W1', 12, 1, 4, 6);
    const w2 = N('W2', 12, 7, 4, 6);
    const w3 = N('W3', 12, 13, 4, 6);
    scenarios.push({
      id: 'neg-wall',
      title: 'Negotiated: Wall Obstacle',
      nodes: [nA, nB, w1, w2, w3],
      edges: [E(nA.id, nB.id)],
    });
  }

  resetIds();
  {
    // Diagonal layout: A top-left, B bottom-right — facingSide picks 'right'
    // but bottom/right combo may produce shorter diagonal path
    const nA = N('A', 2, 2, 6, 6);
    const nB = N('B', 22, 18, 6, 6);
    scenarios.push({
      id: 'neg-diagonal',
      title: 'Negotiated: Diagonal',
      nodes: [nA, nB],
      edges: [E(nA.id, nB.id)],
    });
  }

  resetIds();
  {
    // Hub with spokes in all directions — forces multiple side assignments
    const hub = N('Hub', 14, 12, 7, 7);
    const nN = N('N', 16, 1, 4, 4);
    const nNE = N('NE', 28, 3, 4, 4);
    const nE = N('E', 30, 13, 4, 4);
    const nSE = N('SE', 28, 24, 4, 4);
    const nS = N('S', 16, 26, 4, 4);
    const nSW = N('SW', 3, 24, 4, 4);
    const nW = N('W', 1, 13, 4, 4);
    const nNW = N('NW', 3, 3, 4, 4);
    scenarios.push({
      id: 'neg-compass',
      title: 'Negotiated: 8-Point Compass',
      nodes: [hub, nN, nNE, nE, nSE, nS, nSW, nW, nNW],
      edges: [
        E(nN.id, hub.id), E(nNE.id, hub.id), E(nE.id, hub.id), E(nSE.id, hub.id),
        E(nS.id, hub.id), E(nSW.id, hub.id), E(nW.id, hub.id), E(nNW.id, hub.id),
      ],
    });
  }

  resetIds();
  {
    // Congested side: 5 targets all on the right side of source — forces
    // some connections to negotiate to top/bottom sides
    const src = N('Src', 2, 12, 6, 8);
    const t1 = N('T1', 22, 1, 4, 4);
    const t2 = N('T2', 22, 7, 4, 4);
    const t3 = N('T3', 22, 13, 4, 4);
    const t4 = N('T4', 22, 19, 4, 4);
    const t5 = N('T5', 22, 25, 4, 4);
    scenarios.push({
      id: 'neg-congested',
      title: 'Negotiated: Congested Side (1→5)',
      nodes: [src, t1, t2, t3, t4, t5],
      edges: [E(src.id, t1.id), E(src.id, t2.id), E(src.id, t3.id), E(src.id, t4.id), E(src.id, t5.id)],
    });
  }

  resetIds();
  {
    // Two nodes with obstacle forcing L-shaped path — tests that
    // solver picks the side facing the gap, not the blocked side
    const nA = N('A', 2, 2, 5, 5);
    const nB = N('B', 2, 20, 5, 5);
    const wall = N('Wall', 2, 10, 20, 4);
    scenarios.push({
      id: 'neg-l-shape',
      title: 'Negotiated: L-Shape (obstacle between)',
      nodes: [nA, nB, wall],
      edges: [E(nA.id, nB.id)],
    });
  }

  // Tier 8: 100-node mega-grid (10x10)
  {
    resetIds();
    const GW = 10, GH = 10, NW = 4, NH = 4, GX = 8, GY = 8;
    const grid: NodeDef[][] = [];
    const allN: NodeDef[] = [];
    for (let gy = 0; gy < GH; gy++) {
      const row: NodeDef[] = [];
      for (let gx = 0; gx < GW; gx++) {
        const n = N(`${gy * GW + gx + 1}`, 2 + gx * (NW + GX), 2 + gy * (NH + GY), NW, NH);
        row.push(n); allN.push(n);
      }
      grid.push(row);
    }
    const allE: EdgeDef[] = [];
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW - 1; gx++) allE.push(E(grid[gy]![gx]!.id, grid[gy]![gx + 1]!.id));
    for (let gy = 0; gy < GH - 1; gy++) for (let gx = 0; gx < GW; gx++) allE.push(E(grid[gy]![gx]!.id, grid[gy + 1]![gx]!.id));
    for (let gy = 0; gy < GH - 1; gy += 2) for (let gx = 0; gx < GW - 1; gx += 2) allE.push(E(grid[gy]![gx]!.id, grid[gy + 1]![gx + 1]!.id));
    allE.push(E(grid[0]![0]!.id, grid[9]![9]!.id));
    allE.push(E(grid[0]![9]!.id, grid[9]![0]!.id));
    allE.push(E(grid[0]![5]!.id, grid[9]![5]!.id));
    allE.push(E(grid[5]![0]!.id, grid[5]![9]!.id));
    allE.push(E(grid[2]![2]!.id, grid[7]![7]!.id));
    allE.push(E(grid[2]![7]!.id, grid[7]![2]!.id));
    scenarios.push({ id: 'mega-grid', title: `100 Nodes (${allN.length}N / ${allE.length}E)`, nodes: allN, edges: allE, padding: 3 });
  }

  // Tier 8: 50-node mind map with 25-connection HUB
  {
    resetIds();
    const allN: NodeDef[] = [];
    const allE: EdgeDef[] = [];
    const hub = N('HUB', 50, 37, 21, 17); allN.push(hub);

    // Cluster A — Planning
    const a1 = N('Plan', 8, 6, 5, 4), a2 = N('Goals', 20, 4, 5, 4), a3 = N('Tasks', 20, 14, 5, 4), a4 = N('Sched', 8, 16, 5, 4), a5 = N('Deps', 34, 9, 5, 4);
    allN.push(a1, a2, a3, a4, a5);
    allE.push(E(a1.id, a2.id), E(a2.id, a3.id), E(a3.id, a4.id), E(a1.id, a4.id), E(a3.id, a5.id), E(a5.id, hub.id), E(a2.id, hub.id));

    // Cluster B — Design
    const b1 = N('UI', 88, 4, 5, 4), b2 = N('UX', 100, 10, 5, 4), b3 = N('Proto', 88, 18, 5, 4), b4 = N('Style', 78, 10, 5, 4);
    allN.push(b1, b2, b3, b4);
    allE.push(E(b1.id, b2.id), E(b2.id, b3.id), E(b4.id, b1.id), E(b4.id, b3.id), E(b4.id, hub.id), E(b1.id, hub.id));

    // Cluster C — Data
    const c1 = N('DB', 12, 62, 5, 4), c2 = N('Cache', 4, 74, 5, 4), c3 = N('Queue', 20, 74, 5, 4), c4 = N('ETL', 12, 84, 5, 4), c5 = N('Lake', 30, 68, 5, 4);
    allN.push(c1, c2, c3, c4, c5);
    allE.push(E(c1.id, c2.id), E(c1.id, c3.id), E(c2.id, c4.id), E(c3.id, c4.id), E(c3.id, c5.id), E(c1.id, hub.id), E(c5.id, hub.id));

    // Cluster D — Infra
    const d1 = N('K8s', 90, 70, 5, 4), d2 = N('CI', 104, 64, 5, 4), d3 = N('CD', 104, 78, 5, 4), d4 = N('Mon', 90, 84, 5, 4);
    allN.push(d1, d2, d3, d4);
    allE.push(E(d1.id, d2.id), E(d2.id, d3.id), E(d3.id, d4.id), E(d1.id, d4.id), E(d1.id, hub.id), E(d2.id, hub.id));

    // Cluster E — API
    const e1 = N('REST', 112, 36, 5, 4), e2 = N('GQL', 112, 48, 5, 4), e3 = N('gRPC', 100, 42, 5, 4);
    allN.push(e1, e2, e3);
    allE.push(E(e1.id, e2.id), E(e2.id, e3.id), E(e3.id, e1.id), E(e3.id, hub.id));

    // Islands
    const i1a = N('Docs', 52, 4, 5, 4), i1b = N('Wiki', 64, 4, 5, 4);
    allN.push(i1a, i1b);
    allE.push(E(i1a.id, i1b.id), E(i1a.id, hub.id));

    const i2a = N('Auth', 48, 82, 5, 4), i2b = N('SSO', 60, 86, 5, 4), i2c = N('RBAC', 72, 82, 5, 4);
    allN.push(i2a, i2b, i2c);
    allE.push(E(i2a.id, i2b.id), E(i2b.id, i2c.id), E(i2a.id, hub.id), E(i2c.id, hub.id));

    // Scattered singles → hub
    const scattered: [string, number, number][] = [
      ['Log', 36, 20], ['Trace', 42, 26], ['Metr', 76, 20], ['Alert', 84, 26],
      ['Slack', 34, 42], ['Email', 34, 58], ['Notif', 84, 42], ['Audit', 84, 58],
      ['Sec', 48, 16], ['Perf', 70, 16], ['Test', 48, 62], ['Lint', 70, 62], ['Build', 36, 32],
    ];
    for (const [label, col, row] of scattered) { const n = N(label, col, row, 5, 4); allN.push(n); allE.push(E(n.id, hub.id)); }

    // Cross-cluster links
    allE.push(E(a3.id, c1.id), E(b3.id, e1.id), E(d2.id, e1.id), E(c5.id, d1.id), E(i2c.id, e3.id));

    scenarios.push({ id: 'mindmap', title: `Mind Map (${allN.length}N / ${allE.length}E)`, nodes: allN, edges: allE, padding: 3 });
  }

  return scenarios;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const outDir = join(import.meta.dirname!, '..', 'docs', 'images');
mkdirSync(outDir, { recursive: true });

const filter = process.argv[2];
const scenarios = buildScenarios();

let exported = 0;
for (const s of scenarios) {
  if (filter && s.id !== filter) continue;

  const result = buildScenarioNegotiated(s.nodes, s.edges, s.padding ?? 2);
  const svg = gridToSvg(result.grid, s.nodes, result.connections);
  const path = join(outDir, `${s.id}.svg`);
  writeFileSync(path, svg);
  console.log(`  ${s.id}.svg (${result.grid.cols}x${result.grid.rows} grid)`);
  exported++;
}

console.log(`\nExported ${exported} SVG images to docs/images/`);
