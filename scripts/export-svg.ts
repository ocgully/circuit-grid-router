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
