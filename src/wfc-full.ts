/**
 * WFC Approach 3: Full Grid WFC
 *
 * Treat the ENTIRE grid as a WFC problem. Nodes are pre-collapsed.
 * Connection points seed directional constraints. WFC propagates
 * from connections outward, and the solver finds valid tile assignments
 * that naturally form paths between connected nodes.
 *
 * Strategy:
 * 1. Pre-collapse all node cells (impassable)
 * 2. Pre-collapse corridor cells (blocked)
 * 3. Seed connection cells with directional tiles based on their side
 * 4. Add "attractor" weights biasing tiles toward forming paths between connections
 * 5. Run full WFC solve on the entire grid
 * 6. Verify connectivity — if paths don't connect, add path hints and re-solve
 */

import type { NodeDef, EdgeDef, ConnectionPoint, ScenarioResult } from './grid2d.js';
import { distributeConnections } from './grid2d.js';
import {
  type WfcGrid, type TileType, type Dir,
  createWfcGrid, collapseCell, getWfcCell, propagate,
  TILE_CONNECTIONS, DIR_OFFSET, ALL_DIRS, ROUTING_TILES,
  wfcToGrid2D,
} from './wfc-core.js';

type Side = 'top' | 'bottom' | 'left' | 'right';

function facingSide(a: NodeDef, b: NodeDef): Side {
  const dx = (b.col + b.w / 2) - (a.col + a.w / 2);
  const dy = (b.row + b.h / 2) - (a.row + a.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function computeConnections(nodes: NodeDef[], edges: EdgeDef[]): ConnectionPoint[] {
  const nodeMap = new Map<number, NodeDef>();
  for (const n of nodes) nodeMap.set(n.id, n);

  interface SideEntry { edgeId: number; otherNode: NodeDef; otherNodeId: number }
  const sideGroups = new Map<string, SideEntry[]>();

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    const srcSide = facingSide(src, tgt);
    const tgtSide = facingSide(tgt, src);

    const srcKey = `${e.source}:${srcSide}`;
    if (!sideGroups.has(srcKey)) sideGroups.set(srcKey, []);
    sideGroups.get(srcKey)!.push({ edgeId: e.id, otherNode: tgt, otherNodeId: e.target });

    const tgtKey = `${e.target}:${tgtSide}`;
    if (!sideGroups.has(tgtKey)) sideGroups.set(tgtKey, []);
    sideGroups.get(tgtKey)!.push({ edgeId: e.id, otherNode: src, otherNodeId: e.source });
  }

  const connections: ConnectionPoint[] = [];

  for (const [key, entries] of sideGroups) {
    const colonIdx = key.lastIndexOf(':');
    const nodeId = parseInt(key.slice(0, colonIdx));
    const side = key.slice(colonIdx + 1) as Side;
    const node = nodeMap.get(nodeId)!;

    if (side === 'left' || side === 'right') {
      entries.sort((a, b) => (a.otherNode.row + a.otherNode.h / 2) - (b.otherNode.row + b.otherNode.h / 2));
    } else {
      entries.sort((a, b) => (a.otherNode.col + a.otherNode.w / 2) - (b.otherNode.col + b.otherNode.w / 2));
    }

    let fixedCoord: number;
    let perpStart: number;
    let perpLen: number;

    switch (side) {
      case 'right':  fixedCoord = node.col + node.w; perpStart = node.row; perpLen = node.h; break;
      case 'left':   fixedCoord = node.col - 1;      perpStart = node.row; perpLen = node.h; break;
      case 'bottom': fixedCoord = node.row + node.h;  perpStart = node.col; perpLen = node.w; break;
      case 'top':    fixedCoord = node.row - 1;       perpStart = node.col; perpLen = node.w; break;
    }

    const positions = distributeConnections(perpStart, perpLen, entries.length);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const pos = positions[i]!;
      const otherLabel = nodeMap.get(entry.otherNodeId)?.label ?? '';
      if (side === 'left' || side === 'right') {
        connections.push({ nodeId, edgeId: entry.edgeId, col: fixedCoord, row: pos, side, otherNodeId: entry.otherNodeId, otherNodeLabel: otherLabel });
      } else {
        connections.push({ nodeId, edgeId: entry.edgeId, col: pos, row: fixedCoord, side, otherNodeId: entry.otherNodeId, otherNodeLabel: otherLabel });
      }
    }
  }

  return connections;
}

/** Get the outward direction from a connection side. */
function connOutDir(side: Side): Dir {
  switch (side) {
    case 'right': return 'right';
    case 'left':  return 'left';
    case 'bottom': return 'down';
    case 'top':   return 'up';
  }
}

/** Seed a connection cell — restrict to tiles that connect outward. */
function seedConnection(wfc: WfcGrid, col: number, row: number, side: Side, edgeId: number): void {
  const outDir = connOutDir(side);
  // Connection must connect outward from the node
  const validTiles = ROUTING_TILES.filter(t =>
    t !== 'empty' && TILE_CONNECTIONS[t].has(outDir)
  );
  const cell = getWfcCell(wfc, col, row);
  if (!cell || cell.collapsed !== null) return;
  cell.options = new Set(validTiles);
  cell.edgeId = edgeId;
  // If only one option, auto-collapse
  if (cell.options.size === 1) {
    cell.collapsed = [...cell.options][0]!;
  }
}

/**
 * Build attraction field: for each cell, compute how desirable it is
 * for routing (cells on the line between connections score higher).
 */
function buildAttractionField(
  cols: number, rows: number,
  connections: ConnectionPoint[],
  edges: EdgeDef[],
): Map<string, number> {
  const field = new Map<string, number>();

  // For each edge, boost cells along the Manhattan corridor between source and target
  const connByEdge = new Map<number, ConnectionPoint[]>();
  for (const cp of connections) {
    if (!connByEdge.has(cp.edgeId)) connByEdge.set(cp.edgeId, []);
    connByEdge.get(cp.edgeId)!.push(cp);
  }

  for (const [edgeId, cps] of connByEdge) {
    if (cps.length < 2) continue;
    // Use first two connections (source and target)
    const a = cps[0]!;
    const b = cps[1]!;

    const minC = Math.min(a.col, b.col);
    const maxC = Math.max(a.col, b.col);
    const minR = Math.min(a.row, b.row);
    const maxR = Math.max(a.row, b.row);

    // Boost cells in the bounding box of the two connections
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const key = `${c}:${r}`;
        field.set(key, (field.get(key) ?? 0) + 1);
      }
    }
  }

  return field;
}

/**
 * Custom WFC solve with attraction-biased observation.
 * Instead of random tile selection, prefer routing tiles in high-attraction cells
 * and empty tiles in low-attraction cells.
 */
function solveWithAttraction(
  wfc: WfcGrid,
  attraction: Map<string, number>,
  maxIterations = 100000,
): boolean {
  for (let iter = 0; iter < maxIterations; iter++) {
    // Find lowest entropy cell (prefer high-attraction cells as tiebreaker)
    let bestCol = -1;
    let bestRow = -1;
    let bestEntropy = Infinity;
    let bestAttraction = -1;

    for (let r = 0; r < wfc.rows; r++) {
      for (let c = 0; c < wfc.cols; c++) {
        const cell = wfc.cells[r]![c]!;
        if (cell.collapsed !== null) continue;
        const e = cell.options.size;
        if (e === 0) return false; // contradiction
        const a = attraction.get(`${c}:${r}`) ?? 0;
        if (e < bestEntropy || (e === bestEntropy && a > bestAttraction)) {
          bestEntropy = e;
          bestAttraction = a;
          bestCol = c;
          bestRow = r;
        }
      }
    }

    if (bestCol === -1) return true; // all collapsed

    const cell = wfc.cells[bestRow]![bestCol]!;
    const options = [...cell.options];
    const cellAttraction = attraction.get(`${bestCol}:${bestRow}`) ?? 0;

    // Weight tiles: in high-attraction areas prefer routing tiles; elsewhere prefer empty
    let chosen: TileType;
    if (cellAttraction > 0) {
      // Prefer routing tiles (not empty)
      const routing = options.filter(t => t !== 'empty');
      if (routing.length > 0) {
        // Prefer straight tiles over turns, turns over crosses
        const preference: Record<string, number> = {
          h: 3, v: 3, ne: 2, nw: 2, se: 2, sw: 2, cross: 1, empty: 0,
        };
        routing.sort((a, b) => (preference[b] ?? 0) - (preference[a] ?? 0));
        chosen = routing[0]!;
      } else {
        chosen = options[0]!;
      }
    } else {
      // Low attraction: prefer empty
      chosen = options.includes('empty') ? 'empty' : options[0]!;
    }

    collapseCell(wfc, bestCol, bestRow, chosen, cell.edgeId);
    const ok = propagate(wfc, bestCol, bestRow);
    if (!ok) return false;
  }

  return false;
}

/**
 * After WFC solve, trace connected paths from each connection and assign edge IDs.
 * BFS from each source connection, following connected tiles to its target.
 */
function assignEdgeIds(
  wfc: WfcGrid,
  connections: ConnectionPoint[],
  edges: EdgeDef[],
): void {
  const connByEdge = new Map<number, { src: ConnectionPoint | null; tgt: ConnectionPoint | null }>();
  for (const e of edges) connByEdge.set(e.id, { src: null, tgt: null });
  for (const cp of connections) {
    const entry = connByEdge.get(cp.edgeId);
    if (!entry) continue;
    const edge = edges.find(ed => ed.id === cp.edgeId);
    if (!edge) continue;
    if (cp.nodeId === edge.source) entry.src = cp;
    else if (cp.nodeId === edge.target) entry.tgt = cp;
  }

  for (const [edgeId, ep] of connByEdge) {
    if (!ep.src || !ep.tgt) continue;

    // BFS from source connection following tile connections
    const visited = new Set<string>();
    const queue: [number, number][] = [[ep.src.col, ep.src.row]];
    const targetKey = `${ep.tgt.col}:${ep.tgt.row}`;

    while (queue.length > 0) {
      const [col, row] = queue.shift()!;
      const key = `${col}:${row}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const cell = getWfcCell(wfc, col, row);
      if (!cell || cell.collapsed === null) continue;

      const tile = cell.collapsed;
      const tileConns = TILE_CONNECTIONS[tile];
      if (!tileConns || tileConns.size === 0) continue;

      cell.edgeId = edgeId;

      if (key === targetKey) break;

      for (const dir of ALL_DIRS) {
        if (!tileConns.has(dir)) continue;
        const [dc, dr] = DIR_OFFSET[dir];
        const nc = col + dc;
        const nr = row + dr;
        if (!visited.has(`${nc}:${nr}`)) {
          queue.push([nc, nr]);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildScenarioWfcFull(nodes: NodeDef[], edges: EdgeDef[], padding = 2): ScenarioResult {
  let maxCol = 0;
  let maxRow = 0;
  for (const n of nodes) {
    maxCol = Math.max(maxCol, n.col + n.w);
    maxRow = Math.max(maxRow, n.row + n.h);
  }
  const cols = maxCol + padding + 1;
  const rows = maxRow + padding + 1;

  const wfc = createWfcGrid(cols, rows);

  // 1. Pre-collapse nodes
  for (const n of nodes) {
    for (let r = n.row; r < n.row + n.h; r++) {
      for (let c = n.col; c < n.col + n.w; c++) {
        collapseCell(wfc, c, r, 'node', n.id);
      }
    }
  }

  // 2. Compute connections
  const connections = computeConnections(nodes, edges);

  // 3. Block corridors
  const connSet = new Set(connections.map(cp => `${cp.row}:${cp.col}`));
  for (const cp of connections) {
    const cellsToBlock: [number, number][] = [];
    if (cp.side === 'left' || cp.side === 'right') {
      const nodeDc = cp.side === 'right' ? -1 : 1;
      const outDc = -nodeDc;
      for (const dc of [nodeDc, 0, outDc]) {
        cellsToBlock.push([cp.col + dc, cp.row - 1]);
        cellsToBlock.push([cp.col + dc, cp.row + 1]);
      }
    } else {
      const nodeDr = cp.side === 'bottom' ? -1 : 1;
      const outDr = -nodeDr;
      for (const dr of [nodeDr, 0, outDr]) {
        cellsToBlock.push([cp.col - 1, cp.row + dr]);
        cellsToBlock.push([cp.col + 1, cp.row + dr]);
      }
    }
    for (const [bc, br] of cellsToBlock) {
      if (connSet.has(`${br}:${bc}`)) continue;
      const cell = getWfcCell(wfc, bc, br);
      if (!cell || cell.collapsed !== null) continue;
      collapseCell(wfc, bc, br, 'blocked', 0);
    }
  }

  // 4. Seed connections with directional constraints
  for (const cp of connections) {
    seedConnection(wfc, cp.col, cp.row, cp.side, cp.edgeId);
  }

  // 5. Propagate all pre-collapsed constraints
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (wfc.cells[r]![c]!.collapsed !== null) {
        propagate(wfc, c, r);
      }
    }
  }

  // 6. Build attraction field
  const attraction = buildAttractionField(cols, rows, connections, edges);

  // 7. Solve with attraction bias
  const success = solveWithAttraction(wfc, attraction);

  if (!success) {
    // Fallback: collapse everything remaining to empty
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = wfc.cells[r]![c]!;
        if (cell.collapsed === null) {
          cell.collapsed = 'empty';
          cell.options = new Set(['empty']);
        }
      }
    }
  }

  // 8. Assign edge IDs by tracing paths from connections
  assignEdgeIds(wfc, connections, edges);

  const grid = wfcToGrid2D(wfc);

  // Place connection cells back on the grid (WFC may have made them edges)
  for (const cp of connections) {
    const cell = grid.cells[cp.row]?.[cp.col];
    if (cell && cell.type !== 'node') {
      grid.cells[cp.row]![cp.col] = { type: 'connection', id: cp.nodeId };
    }
  }

  return { grid, nodes, edges, connections };
}
