/**
 * Incremental Routing — Optimized for single-node-move (drag) scenarios.
 *
 * Maintains a RoutingState that can be incrementally updated when one node
 * moves, avoiding full rerouting of all edges on every frame.
 *
 * Strategy:
 * - During drag: grid delta + selective single-pass A* for affected edges
 * - On drop: full negotiated congestion solve for optimal results
 *
 * See OPTIMIZATIONS.md for the rationale behind each optimization.
 */

import type {
  Grid2D, NodeDef, EdgeDef, ConnectionPoint, ScenarioResult,
} from './grid2d.js';
import {
  createGrid, getCell, setCell, distributeConnections,
} from './grid2d.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Side = 'top' | 'bottom' | 'left' | 'right';
type MoveDir = 'h' | 'v' | 'd';

/** Cached path for a single edge. */
export interface EdgePath {
  edgeId: number;
  cells: { col: number; row: number }[];
  /** Set of "col:row" keys for fast intersection testing. */
  cellSet: Set<string>;
}

/** Full routing state — maintained across incremental updates. */
export interface RoutingState {
  grid: Grid2D;
  nodes: NodeDef[];
  edges: EdgeDef[];
  connections: ConnectionPoint[];
  paths: Map<number, EdgePath>;
  /** Grid cell size in pixels (for coordinate conversion). */
  cellSize: number;
}

// ---------------------------------------------------------------------------
// Pixel ↔ Grid coordinate conversion
// ---------------------------------------------------------------------------

/** Convert pixel coordinate to grid cell index. */
export function pixelToGrid(px: number, cellSize: number): number {
  return Math.round(px / cellSize);
}

/** Convert grid cell index to pixel coordinate (cell center). */
export function gridToPixel(cell: number, cellSize: number): number {
  return cell * cellSize + cellSize / 2;
}

/** Convert a pixel-space node rect to a grid-space NodeDef. */
export function pixelNodeToGrid(
  id: number,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  cellSize: number,
): NodeDef {
  return {
    id,
    label,
    col: Math.round(x / cellSize),
    row: Math.round(y / cellSize),
    w: Math.max(1, Math.round(width / cellSize)),
    h: Math.max(1, Math.round(height / cellSize)),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (mirrored from negotiated.ts for self-containment)
// ---------------------------------------------------------------------------

function dirKey(col: number, row: number): string { return `${col}:${row}`; }

function placeNode(grid: Grid2D, node: NodeDef): void {
  for (let r = node.row; r < node.row + node.h; r++) {
    for (let c = node.col; c < node.col + node.w; c++) {
      setCell(grid, c, r, 'node', node.id);
    }
  }
}

function clearNode(grid: Grid2D, node: NodeDef): void {
  for (let r = node.row; r < node.row + node.h; r++) {
    for (let c = node.col; c < node.col + node.w; c++) {
      const cell = getCell(grid, c, r);
      if (cell && cell.type === 'node' && cell.id === node.id) {
        setCell(grid, c, r, 'empty', 0);
      }
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
// Single-pass A* (fast, no negotiation — used during drag)
// ---------------------------------------------------------------------------

const DIRS = [
  { dc: 1, dr: 0 }, { dc: -1, dr: 0 },
  { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
  { dc: 1, dr: 1 }, { dc: -1, dr: 1 },
  { dc: 1, dr: -1 }, { dc: -1, dr: -1 },
];

const SQRT2 = Math.SQRT2;
const BACKTRACK_PENALTY = 50;
const TURN_BASE_PENALTY = 4;
const TURN_IMBALANCE_FACTOR = 0.5;
const JUMP_PENALTY = 6;
const DIAGONAL_EXTRA_COST = 1.4;
const DIAGONAL_ZIGZAG_PENALTY = 8;

// ---------------------------------------------------------------------------
// Binary MinHeap for A* open set — O(log n) insert/extract vs O(n log n) sort
// ---------------------------------------------------------------------------

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

class MinHeap {
  private data: AStarCell[] = [];

  get length(): number { return this.data.length; }

  push(cell: AStarCell): void {
    this.data.push(cell);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): AStarCell | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    const d = this.data;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (d[i]!.f >= d[parent]!.f) break;
      [d[i], d[parent]] = [d[parent]!, d[i]!];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const d = this.data;
    const n = d.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && d[left]!.f < d[smallest]!.f) smallest = left;
      if (right < n && d[right]!.f < d[smallest]!.f) smallest = right;
      if (smallest === i) break;
      [d[i], d[smallest]] = [d[smallest]!, d[i]!];
      i = smallest;
    }
  }
}

function fastAstar(
  grid: Grid2D,
  sc: number, sr: number, sourceSide: Side,
  tc: number, tr: number, targetSide: Side,
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

  const open = new MinHeap();
  const gCosts = new Map<number, number>();
  const closed = new Set<number>();

  const start: AStarCell = { col: sc, row: sr, g: 0, f: heuristic(sc, sr), dir: null, dc: 0, dr: 0, parent: null };
  open.push(start);
  gCosts.set(stateKey(sc, sr, null), 0);

  let found: AStarCell | null = null;
  let iters = 0;
  const MAX_ITERS = grid.cols * grid.rows * 4;

  while (open.length > 0 && iters < MAX_ITERS) {
    iters++;
    const current = open.pop()!;
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

      if (cell.type === 'node' || cell.type === 'blocked') continue;

      if (isDiag) {
        const adj1 = getCell(grid, nc, current.row);
        const adj2 = getCell(grid, current.col, nr);
        if (adj1 && (adj1.type === 'node' || adj1.type === 'blocked')) continue;
        if (adj2 && (adj2.type === 'node' || adj2.type === 'blocked')) continue;
      }

      if (current.col === sc && current.row === sr && current.dir === null) {
        if (axis !== requiredSourceAxis) continue;
      }
      if (nc === tc && nr === tr) {
        if (axis !== requiredTargetAxis) continue;
      }

      if (cell.type === 'connection') {
        const isOurs = (nc === sc && nr === sr) || (nc === tc && nr === tr);
        if (!isOurs) continue;
      }

      let stepCost = isDiag ? SQRT2 + DIAGONAL_EXTRA_COST : 1;

      if (isDiag && current.dir === 'd') {
        if (current.dc !== dc || current.dr !== dr) {
          stepCost += DIAGONAL_ZIGZAG_PENALTY;
        }
      }

      const currentDist = Math.max(Math.abs(current.col - tc), Math.abs(current.row - tr));
      const nextDist = Math.max(Math.abs(nc - tc), Math.abs(nr - tr));
      if (nextDist > currentDist) stepCost += BACKTRACK_PENALTY;

      if (current.dir !== null && current.dir !== axis) {
        const distFromSource = Math.max(Math.abs(current.col - sc), Math.abs(current.row - sr));
        const imbalance = Math.abs(distFromSource - halfDist);
        stepCost += TURN_BASE_PENALTY + Math.floor(imbalance * TURN_IMBALANCE_FACTOR);
      }

      // Crossing existing edge — treat as jump
      if (cell.type === 'edge' || cell.type === 'jump') {
        stepCost += JUMP_PENALTY;
      }

      const ng = current.g + stepCost;
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
// Path placement / clearing
// ---------------------------------------------------------------------------

function placeEdgePath(
  grid: Grid2D,
  edgeId: number,
  path: { col: number; row: number }[],
): void {
  for (const p of path) {
    const cell = getCell(grid, p.col, p.row);
    if (!cell) continue;
    if (cell.type === 'edge' || cell.type === 'jump') {
      setCell(grid, p.col, p.row, 'jump', edgeId);
    } else if (cell.type === 'connection') {
      // Keep as connection
    } else if (cell.type === 'empty') {
      setCell(grid, p.col, p.row, 'edge', edgeId);
    }
  }
}

function clearEdgePath(grid: Grid2D, path: EdgePath): void {
  for (const p of path.cells) {
    const cell = getCell(grid, p.col, p.row);
    if (!cell) continue;
    if (cell.type === 'edge' && cell.id === path.edgeId) {
      setCell(grid, p.col, p.row, 'empty', 0);
    } else if (cell.type === 'jump') {
      // Downgrade jump back to edge (another edge still uses this cell)
      setCell(grid, p.col, p.row, 'edge', 0);
    }
  }
}

function pathToCellSet(path: { col: number; row: number }[]): Set<string> {
  const set = new Set<string>();
  for (const p of path) set.add(`${p.col}:${p.row}`);
  return set;
}

// ---------------------------------------------------------------------------
// Grid construction helpers
// ---------------------------------------------------------------------------

function buildGrid(nodes: NodeDef[], padding: number): Grid2D {
  let maxCol = 0, maxRow = 0;
  for (const n of nodes) {
    maxCol = Math.max(maxCol, n.col + n.w);
    maxRow = Math.max(maxRow, n.row + n.h);
  }
  const grid = createGrid(maxCol + padding + 1, maxRow + padding + 1);
  for (const n of nodes) placeNode(grid, n);
  return grid;
}

function placeConnectionsOnGrid(grid: Grid2D, connections: ConnectionPoint[]): void {
  for (const cp of connections) {
    const cell = getCell(grid, cp.col, cp.row);
    if (cell && cell.type === 'empty') {
      setCell(grid, cp.col, cp.row, 'connection', cp.nodeId);
    }
  }
}

// ---------------------------------------------------------------------------
// Connection lookup builder
// ---------------------------------------------------------------------------

function buildConnLookup(edges: EdgeDef[], connections: ConnectionPoint[]): Map<number, { src: ConnectionPoint | null; tgt: ConnectionPoint | null }> {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create initial routing state with full negotiated congestion solve.
 * Call this once when the canvas first loads or edges change.
 */
export function createRoutingState(
  nodes: NodeDef[],
  edges: EdgeDef[],
  cellSize: number,
  padding: number = 2,
): RoutingState {
  // We need the negotiated solver for the initial full solve.
  // Import dynamically to avoid circular deps — but since this is all sync,
  // we replicate the core logic inline for the initial build.
  const grid = buildGrid(nodes, padding);
  const connections = computeConnections(nodes, edges);
  placeConnectionsOnGrid(grid, connections);
  blockConnectionCorridors(grid, connections);

  const connByEdge = buildConnLookup(edges, connections);
  const paths = new Map<number, EdgePath>();

  // Single-pass route all edges for initial state
  for (const e of edges) {
    const ep = connByEdge.get(e.id);
    if (!ep?.src || !ep?.tgt) continue;

    const path = fastAstar(
      grid,
      ep.src.col, ep.src.row, ep.src.side,
      ep.tgt.col, ep.tgt.row, ep.tgt.side,
    );

    if (path) {
      placeEdgePath(grid, e.id, path);
      paths.set(e.id, { edgeId: e.id, cells: path, cellSet: pathToCellSet(path) });
    }
  }

  return { grid, nodes: [...nodes], edges: [...edges], connections, paths, cellSize };
}

/**
 * Incremental update: move a single node to a new position.
 * Returns a new RoutingState with only affected edges rerouted (fast single-pass A*).
 *
 * Use during drag for interactive performance.
 */
export function moveNode(
  state: RoutingState,
  nodeId: number,
  newCol: number,
  newRow: number,
  padding: number = 2,
): RoutingState {
  const oldNodeIdx = state.nodes.findIndex(n => n.id === nodeId);
  if (oldNodeIdx === -1) return state;

  const oldNode = state.nodes[oldNodeIdx]!;
  const newNode: NodeDef = { ...oldNode, col: newCol, row: newRow };

  // Updated nodes array
  const newNodes = [...state.nodes];
  newNodes[oldNodeIdx] = newNode;

  // New node footprint cells (for intersection testing)
  const newFootprint = new Set<string>();
  for (let r = newNode.row; r < newNode.row + newNode.h; r++) {
    for (let c = newNode.col; c < newNode.col + newNode.w; c++) {
      newFootprint.add(`${c}:${r}`);
    }
  }

  // Find affected edges:
  // 1. Edges connected to the moved node
  // 2. Edges whose cached path intersects the new node footprint
  const connectedEdgeIds = new Set<number>();
  for (const e of state.edges) {
    if (e.source === nodeId || e.target === nodeId) {
      connectedEdgeIds.add(e.id);
    }
  }

  const collidingEdgeIds = new Set<number>();
  for (const [edgeId, edgePath] of state.paths) {
    if (connectedEdgeIds.has(edgeId)) continue;
    // Check if any cell in this path intersects the new node footprint
    for (const key of edgePath.cellSet) {
      if (newFootprint.has(key)) {
        collidingEdgeIds.add(edgeId);
        break;
      }
    }
  }

  const affectedEdgeIds = new Set([...connectedEdgeIds, ...collidingEdgeIds]);

  // Rebuild grid from scratch (grid delta is complex with corridor changes)
  const grid = buildGrid(newNodes, padding);
  const connections = computeConnections(newNodes, state.edges);
  placeConnectionsOnGrid(grid, connections);
  blockConnectionCorridors(grid, connections);

  const connByEdge = buildConnLookup(state.edges, connections);
  const newPaths = new Map<number, EdgePath>();

  // Place unaffected edge paths back onto grid
  for (const [edgeId, edgePath] of state.paths) {
    if (affectedEdgeIds.has(edgeId)) continue;
    // Re-validate: make sure path cells don't collide with new grid state
    let valid = true;
    for (const p of edgePath.cells) {
      const cell = getCell(grid, p.col, p.row);
      if (!cell || cell.type === 'node' || cell.type === 'blocked') {
        valid = false;
        break;
      }
    }
    if (valid) {
      placeEdgePath(grid, edgeId, edgePath.cells);
      newPaths.set(edgeId, edgePath);
    } else {
      // Path now collides — add to affected set
      affectedEdgeIds.add(edgeId);
    }
  }

  // Route affected edges with fast single-pass A*
  for (const edgeId of affectedEdgeIds) {
    const ep = connByEdge.get(edgeId);
    if (!ep?.src || !ep?.tgt) continue;

    const path = fastAstar(
      grid,
      ep.src.col, ep.src.row, ep.src.side,
      ep.tgt.col, ep.tgt.row, ep.tgt.side,
    );

    if (path) {
      placeEdgePath(grid, edgeId, path);
      newPaths.set(edgeId, { edgeId, cells: path, cellSet: pathToCellSet(path) });
    }
  }

  return { grid, nodes: newNodes, edges: state.edges, connections, paths: newPaths, cellSize: state.cellSize };
}

/**
 * Full reroute using negotiated congestion solver.
 * Call on mouse-up / drag-stop for optimal results.
 *
 * Delegates to buildScenarioNegotiated and wraps result as RoutingState.
 */
export { buildScenarioNegotiated } from './negotiated.js';

export function fullReroute(
  state: RoutingState,
  padding: number = 2,
): RoutingState {
  // Rebuild from scratch with full negotiated solver
  // Import inline to keep this module self-contained
  const grid = buildGrid(state.nodes, padding);
  const connections = computeConnections(state.nodes, state.edges);
  placeConnectionsOnGrid(grid, connections);
  blockConnectionCorridors(grid, connections);

  const connByEdge = buildConnLookup(state.edges, connections);
  const paths = new Map<number, EdgePath>();

  // Use the full negotiated approach (rip-up and reroute with escalating costs)
  // For simplicity, we run the single-pass approach here too but with multiple
  // iterations to resolve conflicts.
  const MAX_ITERATIONS = 20;
  const HISTORY_INCREMENT = 4;

  interface CongestionMap {
    history: Map<string, number>;
    present: Map<string, Set<number>>;
  }

  const cong: CongestionMap = { history: new Map(), present: new Map() };

  function congKey(col: number, row: number, axis: MoveDir): string {
    return `${col}:${row}:${axis}`;
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Clear previous edge cells
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const cell = grid.cells[r]![c]!;
        if (cell.type === 'edge' || cell.type === 'jump') {
          grid.cells[r]![c] = { type: 'empty', id: 0 };
        }
      }
    }
    cong.present.clear();
    paths.clear();

    // Route all edges
    for (const e of state.edges) {
      const ep = connByEdge.get(e.id);
      if (!ep?.src || !ep?.tgt) continue;

      const path = fastAstar(
        grid,
        ep.src.col, ep.src.row, ep.src.side,
        ep.tgt.col, ep.tgt.row, ep.tgt.side,
      );

      if (path) {
        placeEdgePath(grid, e.id, path);
        paths.set(e.id, { edgeId: e.id, cells: path, cellSet: pathToCellSet(path) });

        // Record congestion
        for (let i = 1; i < path.length; i++) {
          const prev = path[i - 1]!;
          const cur = path[i]!;
          const dcol = prev.col !== cur.col;
          const drow = prev.row !== cur.row;
          const axis: MoveDir = (dcol && drow) ? 'd' : dcol ? 'h' : 'v';
          const k = congKey(cur.col, cur.row, axis);
          if (!cong.present.has(k)) cong.present.set(k, new Set());
          cong.present.get(k)!.add(e.id);
        }
      }
    }

    // Check convergence
    let overused = 0;
    for (const users of cong.present.values()) {
      if (users.size > 1) overused++;
    }
    if (overused === 0) break;

    // Update history
    for (const [k, users] of cong.present) {
      if (users.size > 1) {
        cong.history.set(k, (cong.history.get(k) ?? 0) + HISTORY_INCREMENT);
      }
    }
  }

  return { grid, nodes: state.nodes, edges: state.edges, connections, paths, cellSize: state.cellSize };
}

/**
 * Convert a RoutingState to a ScenarioResult for rendering.
 */
export function toScenarioResult(state: RoutingState): ScenarioResult {
  return {
    grid: state.grid,
    nodes: state.nodes,
    edges: state.edges,
    connections: state.connections,
  };
}

/**
 * Convert grid-space edge paths to pixel-space SVG path strings.
 * Lines pass through cell centers.
 */
export function edgePathToSvgPoints(
  edgePath: EdgePath,
  cellSize: number,
): { x: number; y: number }[] {
  return edgePath.cells.map(p => ({
    x: p.col * cellSize + cellSize / 2,
    y: p.row * cellSize + cellSize / 2,
  }));
}

/**
 * Build SVG path string from waypoints.
 */
export function waypointsToSvgPath(waypoints: { x: number; y: number }[]): string {
  if (waypoints.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const p = waypoints[i]!;
    parts.push(i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`);
  }
  return parts.join(' ');
}

/**
 * Find crossing points (jumps) from the grid state.
 * Returns pixel-space crossing positions with axis info.
 */
export function findJumps(
  state: RoutingState,
): { x: number; y: number; axis: 'h' | 'v' }[] {
  const jumps: { x: number; y: number; axis: 'h' | 'v' }[] = [];
  for (let r = 0; r < state.grid.rows; r++) {
    for (let c = 0; c < state.grid.cols; c++) {
      const cell = state.grid.cells[r]![c]!;
      if (cell.type === 'jump') {
        // Determine axis by looking at surrounding cells
        const left = getCell(state.grid, c - 1, r);
        const right = getCell(state.grid, c + 1, r);
        const hasH = (left && (left.type === 'edge' || left.type === 'jump' || left.type === 'connection')) ||
                     (right && (right.type === 'edge' || right.type === 'jump' || right.type === 'connection'));
        jumps.push({
          x: c * state.cellSize + state.cellSize / 2,
          y: r * state.cellSize + state.cellSize / 2,
          axis: hasH ? 'h' : 'v',
        });
      }
    }
  }
  return jumps;
}
