/**
 * Negotiated Congestion Router — PathFinder-inspired edge routing.
 *
 * Instead of sequential A* with round-robin retry, this routes ALL edges
 * simultaneously, allowing overlaps, then iteratively rips up and reroutes
 * with escalating congestion costs until no cell is shared.
 *
 * Algorithm (based on PathFinder / Negotiated Congestion):
 * 1. Route all edges greedily (overlaps allowed, low penalties)
 * 2. Detect congested cells (shared by multiple edges in same direction)
 * 3. Accumulate history cost on congested cells
 * 4. Rip up ALL edges, re-route with updated costs
 * 5. Repeat until convergence (no sharing) or max iterations
 *
 * Cost function per cell:
 *   cost(c) = (base_cost + history_cost(c)) * present_congestion(c)
 *
 * This reuses the same grid model, connection computation, corridor blocking,
 * and direction tracking from grid2d.ts.
 */

import type {
  Grid2D, GridCell, CellType, NodeDef, EdgeDef, ConnectionPoint, ScenarioResult, EdgePath,
} from './grid2d.js';
import {
  createGrid, getCell, setCell, distributeConnections,
} from './grid2d.js';

// ---------------------------------------------------------------------------
// Types (re-declared to avoid exporting grid2d internals)
// ---------------------------------------------------------------------------

type Side = 'top' | 'bottom' | 'left' | 'right';
type MoveDir = 'h' | 'v' | 'd';

interface EdgeDirTracker {
  h: Set<string>;
  v: Set<string>;
  d: Set<string>;
}

// ---------------------------------------------------------------------------
// Infrastructure (mirrored from grid2d.ts — same logic)
// ---------------------------------------------------------------------------

function dirKey(col: number, row: number): string { return `${col}:${row}`; }
function createDirTracker(): EdgeDirTracker { return { h: new Set(), v: new Set(), d: new Set() }; }

function placeNode(grid: Grid2D, node: NodeDef): void {
  for (let r = node.row; r < node.row + node.h; r++) {
    for (let c = node.col; c < node.col + node.w; c++) {
      setCell(grid, c, r, 'node', node.id);
    }
  }
}

function facingSide(a: NodeDef, b: NodeDef): Side {
  const dx = (b.col + b.w / 2) - (a.col + a.w / 2);
  const dy = (b.row + b.h / 2) - (a.row + a.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function sideAxis(side: Side): 'h' | 'v' {
  return (side === 'left' || side === 'right') ? 'h' : 'v';
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

    let fixedCoord: number, perpStart: number, perpLen: number;
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

function blockConnectionCorridors(grid: Grid2D, connections: ConnectionPoint[]): void {
  const connSet = new Set<string>();
  for (const cp of connections) connSet.add(`${cp.row}:${cp.col}`);

  for (const cp of connections) {
    const cells: [number, number][] = [];
    if (cp.side === 'left' || cp.side === 'right') {
      const nodeDc = cp.side === 'right' ? -1 : 1;
      const outDc = -nodeDc;
      for (const dc of [nodeDc, 0, outDc]) {
        cells.push([cp.col + dc, cp.row - 1]);
        cells.push([cp.col + dc, cp.row + 1]);
      }
    } else {
      const nodeDr = cp.side === 'bottom' ? -1 : 1;
      const outDr = -nodeDr;
      for (const dr of [nodeDr, 0, outDr]) {
        cells.push([cp.col - 1, cp.row + dr]);
        cells.push([cp.col + 1, cp.row + dr]);
      }
    }
    for (const [bc, br] of cells) {
      if (connSet.has(`${br}:${bc}`)) continue;
      const cell = getCell(grid, bc, br);
      if (!cell || cell.type === 'node' || cell.type === 'connection') continue;
      setCell(grid, bc, br, 'blocked', 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Congestion tracking
// ---------------------------------------------------------------------------

/** Per-cell congestion data. Keyed by "col:row:axis" */
interface CongestionMap {
  /** Accumulated history cost — never resets, grows each iteration a cell is overused. */
  history: Map<string, number>;
  /** Present occupancy — how many edges currently use this cell+axis. Reset each iteration. */
  present: Map<string, Set<number>>;
}

function congestionKey(col: number, row: number, axis: MoveDir): string {
  return `${col}:${row}:${axis}`;
}

function createCongestion(): CongestionMap {
  return { history: new Map(), present: new Map() };
}

function resetPresent(cong: CongestionMap): void {
  cong.present.clear();
}

function recordUsage(cong: CongestionMap, col: number, row: number, axis: MoveDir, edgeId: number): void {
  const k = congestionKey(col, row, axis);
  if (!cong.present.has(k)) cong.present.set(k, new Set());
  cong.present.get(k)!.add(edgeId);
}

/** Count overused cells (used by >1 edge in same axis). */
function countOverused(cong: CongestionMap): number {
  let count = 0;
  for (const users of cong.present.values()) {
    if (users.size > 1) count++;
  }
  return count;
}

/** Update history costs: bump every overused cell. */
function updateHistory(cong: CongestionMap, increment: number): void {
  for (const [k, users] of cong.present) {
    if (users.size > 1) {
      cong.history.set(k, (cong.history.get(k) ?? 0) + increment);
    }
  }
}

/** Get present congestion multiplier for a cell+axis. */
function presentFactor(cong: CongestionMap, col: number, row: number, axis: MoveDir, iteration: number): number {
  const k = congestionKey(col, row, axis);
  const users = cong.present.get(k);
  if (!users || users.size <= 1) return 1;
  // Escalate with iteration: 1 + overuse * escalation^iteration
  const escalation = Math.min(Math.pow(1.3, iteration), 8);
  return 1 + (users.size - 1) * escalation;
}

/** Get history cost for a cell+axis. */
function historyCost(cong: CongestionMap, col: number, row: number, axis: MoveDir): number {
  return cong.history.get(congestionKey(col, row, axis)) ?? 0;
}

// ---------------------------------------------------------------------------
// Negotiated A* — routes one edge with congestion-aware costs
// ---------------------------------------------------------------------------

const DIRS = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
  { dc: 1, dr: 1 },
  { dc: -1, dr: 1 },
  { dc: 1, dr: -1 },
  { dc: -1, dr: -1 },
];

const SQRT2 = Math.SQRT2;

interface AStarCell {
  col: number;
  row: number;
  g: number;
  f: number;
  dir: MoveDir | null;
  dc: number;
  dr: number;
  parent: AStarCell | null;
}

const BACKTRACK_PENALTY = 50;
const TURN_BASE_PENALTY = 4;
const TURN_IMBALANCE_FACTOR = 0.5;
const JUMP_PENALTY = 6;
const DIAGONAL_EXTRA_COST = 1.4;
const DIAGONAL_ZIGZAG_PENALTY = 8;
const HISTORY_INCREMENT = 4;

/**
 * Negotiated A*: like the standard A* but uses congestion costs instead of
 * hard-blocking overlaps. Overlaps are allowed but expensive.
 */
function negotiatedAstar(
  grid: Grid2D,
  sc: number, sr: number, sourceSide: Side,
  tc: number, tr: number, targetSide: Side,
  dirs: EdgeDirTracker,
  cong: CongestionMap,
  iteration: number,
  edgeId: number,
  maxItersOverride?: number,
): { col: number; row: number }[] | null {
  const stateKey = (c: number, r: number, d: MoveDir | null) => {
    const di = d === null ? 0 : d === 'h' ? 1 : d === 'v' ? 2 : 3;
    return r * grid.cols * 4 + c * 4 + di;
  };

  const heuristic = (c: number, r: number) => {
    const dx = Math.abs(c - tc);
    const dy = Math.abs(r - tr);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  const totalDist = Math.max(Math.abs(tc - sc), Math.abs(tr - sr));
  const halfDist = totalDist / 2;

  const requiredSourceAxis = sideAxis(sourceSide);
  const requiredTargetAxis = sideAxis(targetSide);

  const open: AStarCell[] = [];
  const gCosts = new Map<number, number>();
  const closed = new Set<number>();

  const start: AStarCell = { col: sc, row: sr, g: 0, f: heuristic(sc, sr), dir: null, dc: 0, dr: 0, parent: null };
  open.push(start);
  gCosts.set(stateKey(sc, sr, null), 0);

  let found: AStarCell | null = null;
  let iters = 0;
  const MAX_ITERS = maxItersOverride ?? grid.cols * grid.rows * 8;

  while (open.length > 0 && iters < MAX_ITERS) {
    iters++;
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const ci = stateKey(current.col, current.row, current.dir);
    if (closed.has(ci)) continue;
    closed.add(ci);

    if (current.col === tc && current.row === tr) { found = current; break; }

    for (const { dc, dr } of DIRS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;

      const isDiag = dc !== 0 && dr !== 0;
      const axis: MoveDir = isDiag ? 'd' : (dc !== 0 ? 'h' : 'v');
      const ni = stateKey(nc, nr, axis);
      if (closed.has(ni)) continue;

      const cell = grid.cells[nr]![nc]!;

      // --- Hard blocks (always enforced) ---
      if (cell.type === 'node' || cell.type === 'blocked') continue;

      // Diagonal: don't cut through node/blocked corners
      if (isDiag) {
        const adj1 = getCell(grid, nc, current.row);
        const adj2 = getCell(grid, current.col, nr);
        if (adj1 && (adj1.type === 'node' || adj1.type === 'blocked')) continue;
        if (adj2 && (adj2.type === 'node' || adj2.type === 'blocked')) continue;
      }

      // Head-on departure (no diagonal)
      if (current.col === sc && current.row === sr && current.dir === null) {
        if (axis !== requiredSourceAxis) continue;
      }
      // Head-on arrival (no diagonal)
      if (nc === tc && nr === tr) {
        if (axis !== requiredTargetAxis) continue;
      }

      // Connection cells: only our endpoints
      if (cell.type === 'connection') {
        const isOurs = (nc === sc && nr === sr) || (nc === tc && nr === tr);
        if (!isOurs) continue;
      }

      // --- Cost calculation ---
      let baseCost = isDiag ? SQRT2 + DIAGONAL_EXTRA_COST : 1;

      // Diagonal zigzag penalty: changing diagonal direction
      if (isDiag && current.dir === 'd') {
        if (current.dc !== dc || current.dr !== dr) {
          baseCost += DIAGONAL_ZIGZAG_PENALTY;
        }
      }

      // Backtrack penalty (Chebyshev distance)
      const currentDist = Math.max(Math.abs(current.col - tc), Math.abs(current.row - tr));
      const nextDist = Math.max(Math.abs(nc - tc), Math.abs(nr - tr));
      if (nextDist > currentDist) baseCost += BACKTRACK_PENALTY;

      // Turn penalty — midpoint biased
      if (current.dir !== null && current.dir !== axis) {
        const distFromSource = Math.max(Math.abs(current.col - sc), Math.abs(current.row - sr));
        const imbalance = Math.abs(distFromSource - halfDist);
        baseCost += TURN_BASE_PENALTY + Math.floor(imbalance * TURN_IMBALANCE_FACTOR);
      }

      // Jump penalty — crossing existing edge
      if (cell.type === 'edge' || cell.type === 'jump') {
        const k = dirKey(nc, nr);
        const sameDir = (axis === 'h' && dirs.h.has(k)) || (axis === 'v' && dirs.v.has(k)) || (axis === 'd' && dirs.d.has(k));
        if (sameDir) {
          baseCost += 50 + historyCost(cong, nc, nr, axis);
        } else if (dirs.h.has(k) || dirs.v.has(k) || dirs.d.has(k)) {
          baseCost += JUMP_PENALTY;
        } else {
          baseCost += 50;
        }
      }

      // Negotiated cost: (base + history) * present_congestion
      const hCost = historyCost(cong, nc, nr, axis);
      const pFactor = presentFactor(cong, nc, nr, axis, iteration);
      const totalCost = (baseCost + hCost) * pFactor;

      const ng = current.g + totalCost;
      const prevG = gCosts.get(ni);

      if (prevG === undefined || ng < prevG) {
        gCosts.set(ni, ng);
        open.push({ col: nc, row: nr, g: ng, f: ng + heuristic(nc, nr), dir: axis, dc, dr, parent: current });
      }
    }
  }

  if (!found) return null;

  const path: { col: number; row: number }[] = [];
  let node: AStarCell | null = found;
  while (node) {
    path.unshift({ col: node.col, row: node.row });
    node = node.parent;
  }
  return path;
}

// ---------------------------------------------------------------------------
// Path placement with direction + congestion tracking
// ---------------------------------------------------------------------------

function placeEdgePath(
  grid: Grid2D,
  edgeId: number,
  path: { col: number; row: number }[],
  dirs: EdgeDirTracker,
  cong: CongestionMap,
): void {
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;

    let dir: MoveDir | null = null;
    if (i > 0) {
      const prev = path[i - 1]!;
      const dcol = prev.col !== p.col;
      const drow = prev.row !== p.row;
      dir = (dcol && drow) ? 'd' : dcol ? 'h' : 'v';
    } else if (i < path.length - 1) {
      const next = path[i + 1]!;
      const dcol = next.col !== p.col;
      const drow = next.row !== p.row;
      dir = (dcol && drow) ? 'd' : dcol ? 'h' : 'v';
    }

    if (dir) {
      (dir === 'h' ? dirs.h : dir === 'v' ? dirs.v : dirs.d).add(dirKey(p.col, p.row));
      recordUsage(cong, p.col, p.row, dir, edgeId);
    }

    const cell = getCell(grid, p.col, p.row);
    if (!cell) continue;

    if (cell.type === 'edge' || cell.type === 'jump') {
      setCell(grid, p.col, p.row, 'jump', edgeId);
    } else if (cell.type === 'connection') {
      // Keep as connection
    } else {
      setCell(grid, p.col, p.row, 'edge', edgeId);
    }
  }
}

function pathToCellSet(path: { col: number; row: number }[]): Set<string> {
  const set = new Set<string>();
  for (const p of path) set.add(`${p.col}:${p.row}`);
  return set;
}

function clearEdgeCells(grid: Grid2D, dirs: EdgeDirTracker): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      if (cell.type === 'edge' || cell.type === 'jump') {
        grid.cells[r]![c] = { type: 'empty', id: 0 };
      }
    }
  }
  dirs.h.clear();
  dirs.v.clear();
  dirs.d.clear();
}

// ---------------------------------------------------------------------------
// Connection side negotiation — reassign sides when paths are poor
// ---------------------------------------------------------------------------

interface SideAssignment {
  srcSide: Side;
  tgtSide: Side;
}

/** Get the center connection position for a node on a given side. */
function sideCenterPosition(node: NodeDef, side: Side): { col: number; row: number } {
  switch (side) {
    case 'right':  return { col: node.col + node.w,                        row: node.row + Math.floor((node.h - 1) / 2) };
    case 'left':   return { col: node.col - 1,                             row: node.row + Math.floor((node.h - 1) / 2) };
    case 'bottom': return { col: node.col + Math.floor((node.w - 1) / 2),  row: node.row + node.h };
    case 'top':    return { col: node.col + Math.floor((node.w - 1) / 2),  row: node.row - 1 };
  }
}

/**
 * Compute connections using explicit side assignments (instead of facingSide).
 * Falls back to facingSide for edges without overrides.
 */
function computeConnectionsWithSides(
  nodes: NodeDef[],
  edges: EdgeDef[],
  sideAssignments: Map<number, SideAssignment>,
): ConnectionPoint[] {
  const nodeMap = new Map<number, NodeDef>();
  for (const n of nodes) nodeMap.set(n.id, n);

  interface SideEntry { edgeId: number; otherNode: NodeDef; otherNodeId: number }
  const sideGroups = new Map<string, SideEntry[]>();

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    const assignment = sideAssignments.get(e.id);
    const srcSide = assignment?.srcSide ?? facingSide(src, tgt);
    const tgtSide = assignment?.tgtSide ?? facingSide(tgt, src);

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

    let fixedCoord: number, perpStart: number, perpLen: number;
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

/** Clear connection and corridor-blocked cells from the grid (preserving nodes). */
function clearConnectionState(grid: Grid2D): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      if (cell.type === 'connection' || cell.type === 'blocked') {
        grid.cells[r]![c] = { type: 'empty', id: 0 };
      }
    }
  }
}

/** Place connections on the grid and block corridors. Returns edge→endpoint lookup. */
function placeConnectionState(
  grid: Grid2D,
  connections: ConnectionPoint[],
  edges: EdgeDef[],
): Map<number, { src: ConnectionPoint | null; tgt: ConnectionPoint | null }> {
  for (const cp of connections) {
    const cell = getCell(grid, cp.col, cp.row);
    if (cell && cell.type === 'empty') {
      setCell(grid, cp.col, cp.row, 'connection', cp.nodeId);
    }
  }
  blockConnectionCorridors(grid, connections);

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
  return connByEdge;
}

/** Iterations after which to attempt side reassignment. */
const REASSIGN_AFTER_ITERATIONS = [0, 3];

/** All four sides, used for exhaustive trial routing. */
const ALL_SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

/**
 * A* iteration budget for trial routes. Trial routes are probes to compare
 * side pairs — they don't need to find the globally optimal path, just a
 * reasonable one for length comparison. A tight budget keeps this fast even
 * for large grids (100+ nodes).
 */
const TRIAL_MAX_ITERS = 2000;

/**
 * For every edge, try all viable side pairs by actually routing each one.
 * No heuristics — the only way to know which side pair is best is to run
 * A* with real obstacles, congestion, and grid state.
 *
 * Trial routes use a capped iteration budget (TRIAL_MAX_ITERS) so probing
 * stays fast. If a trial exceeds the budget, it returns null (no path found
 * within budget) and that side pair is skipped.
 *
 * Returns true if any assignment changed.
 */
function negotiateSides(
  nodes: NodeDef[],
  edges: EdgeDef[],
  paths: Map<number, EdgePath>,
  sideAssignments: Map<number, SideAssignment>,
  grid: Grid2D,
  dirs: EdgeDirTracker,
  cong: CongestionMap,
  iteration: number,
): boolean {
  const nodeMap = new Map<number, NodeDef>();
  for (const n of nodes) nodeMap.set(n.id, n);

  let changed = false;

  for (const e of edges) {
    const path = paths.get(e.id);
    if (!path) continue;

    const assignment = sideAssignments.get(e.id);
    if (!assignment) continue;

    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    const actual = path.cells.length;
    let bestLen = actual;
    let bestSrcSide = assignment.srcSide;
    let bestTgtSide = assignment.tgtSide;

    // Try every side pair
    for (const ss of ALL_SIDES) {
      for (const ts of ALL_SIDES) {
        if (ss === assignment.srcSide && ts === assignment.tgtSide) continue;

        const sPos = sideCenterPosition(src, ss);
        const tPos = sideCenterPosition(tgt, ts);

        // Bounds check
        if (sPos.col < 0 || sPos.col >= grid.cols || sPos.row < 0 || sPos.row >= grid.rows) continue;
        if (tPos.col < 0 || tPos.col >= grid.cols || tPos.row < 0 || tPos.row >= grid.rows) continue;

        // Skip if endpoint lands on a node cell
        const sCellOrig = getCell(grid, sPos.col, sPos.row);
        const tCellOrig = getCell(grid, tPos.col, tPos.row);
        if (sCellOrig?.type === 'node' || tCellOrig?.type === 'node') continue;

        // Temporarily unblock candidate cells for trial
        const sWasBlocked = sCellOrig?.type === 'blocked';
        const tWasBlocked = tCellOrig?.type === 'blocked';
        if (sWasBlocked) setCell(grid, sPos.col, sPos.row, 'empty', 0);
        if (tWasBlocked) setCell(grid, tPos.col, tPos.row, 'empty', 0);

        const trial = negotiatedAstar(
          grid, sPos.col, sPos.row, ss, tPos.col, tPos.row, ts,
          dirs, cong, iteration, e.id, TRIAL_MAX_ITERS,
        );

        // Restore
        if (sWasBlocked) setCell(grid, sPos.col, sPos.row, 'blocked', 0);
        if (tWasBlocked) setCell(grid, tPos.col, tPos.row, 'blocked', 0);

        if (trial && trial.length < bestLen) {
          bestLen = trial.length;
          bestSrcSide = ss;
          bestTgtSide = ts;
        }
      }
    }

    if (bestSrcSide !== assignment.srcSide || bestTgtSide !== assignment.tgtSide) {
      sideAssignments.set(e.id, { srcSide: bestSrcSide, tgtSide: bestTgtSide });
      changed = true;
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Public API — Negotiated Congestion Router
// ---------------------------------------------------------------------------

const MAX_NEGOTIATION_ITERATIONS = 20;

export function buildScenarioNegotiated(
  nodes: NodeDef[],
  edges: EdgeDef[],
  padding: number = 2,
): ScenarioResult {
  // 1. Compute grid size
  let maxCol = 0;
  let maxRow = 0;
  for (const n of nodes) {
    maxCol = Math.max(maxCol, n.col + n.w);
    maxRow = Math.max(maxRow, n.row + n.h);
  }
  const cols = maxCol + padding + 1;
  const rows = maxRow + padding + 1;

  const grid = createGrid(cols, rows);

  // 2. Place nodes
  for (const n of nodes) placeNode(grid, n);

  // 3. Initial side assignments from facingSide
  const nodeMap = new Map<number, NodeDef>();
  for (const n of nodes) nodeMap.set(n.id, n);
  const sideAssignments = new Map<number, SideAssignment>();
  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    sideAssignments.set(e.id, { srcSide: facingSide(src, tgt), tgtSide: facingSide(tgt, src) });
  }

  // 4. Compute and place connections
  let connections = computeConnectionsWithSides(nodes, edges, sideAssignments);
  let connByEdge = placeConnectionState(grid, connections, edges);

  // 5. Negotiated routing loop with connection negotiation
  const t0 = performance.now();
  const dirs = createDirTracker();
  const cong = createCongestion();
  let finalNegotiations = 1;
  const paths = new Map<number, EdgePath>();

  for (let iteration = 0; iteration < MAX_NEGOTIATION_ITERATIONS; iteration++) {
    finalNegotiations = iteration + 1;

    // Clear previous routing
    clearEdgeCells(grid, dirs);
    resetPresent(cong);
    paths.clear();

    // Route ALL edges with current congestion costs
    for (const e of edges) {
      const ep = connByEdge.get(e.id);
      if (!ep?.src || !ep?.tgt) continue;

      const path = negotiatedAstar(
        grid,
        ep.src.col, ep.src.row, ep.src.side,
        ep.tgt.col, ep.tgt.row, ep.tgt.side,
        dirs, cong, iteration, e.id,
      );

      if (path) {
        placeEdgePath(grid, e.id, path, dirs, cong);
        paths.set(e.id, { edgeId: e.id, cells: path, cellSet: pathToCellSet(path) });
      }
    }

    // Connection negotiation: try alternative sides for poor paths
    if (REASSIGN_AFTER_ITERATIONS.includes(iteration)) {
      const sidesChanged = negotiateSides(
        nodes, edges, paths, sideAssignments,
        grid, dirs, cong, iteration,
      );
      if (sidesChanged) {
        // Rebuild connections with new side assignments
        clearEdgeCells(grid, dirs);
        clearConnectionState(grid);
        connections = computeConnectionsWithSides(nodes, edges, sideAssignments);
        connByEdge = placeConnectionState(grid, connections, edges);
        resetPresent(cong);
        paths.clear();
        // Don't break — re-route with updated connections in next iteration
        continue;
      }
    }

    // Check convergence: no cell shared by >1 edge in same direction
    const overused = countOverused(cong);
    if (overused === 0) break;

    // Update history costs for overused cells
    updateHistory(cong, HISTORY_INCREMENT);
  }

  return { grid, nodes, edges, connections, paths, negotiations: finalNegotiations, timeMs: performance.now() - t0 };
}
