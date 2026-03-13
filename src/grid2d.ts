/**
 * Grid2D — A true 2D cell array for orthogonal edge routing.
 *
 * Each cell has a type and an ID:
 * - 'empty'      (id=0)  — unoccupied, available for routing
 * - 'node'       (id=N)  — part of node N's bounding box
 * - 'blocked'    (id=0)  — corridor reservation, heavy routing penalty
 * - 'connection'  (id=N)  — connection point adjacent to node N
 * - 'edge'       (id=E)  — edge E passes through this cell
 * - 'jump'       (id=E)  — edge E crosses another edge here (perpendicular hop)
 *
 * Rules:
 * - Edges travel ONLY on grid cells (no cutting through cells)
 * - Edges cannot pass through node cells
 * - Edges cannot overlap other edges (same cell, same direction)
 * - Edges cannot pass through connection cells (except their own endpoints)
 * - Connection points are node-adjacent (within 1 cell of the node)
 * - Connection points are center-biased:
 *   - Odd count:  center occupied, pairs outward with 1 empty gap
 *   - Even count: center is empty gap, pairs outward
 * - Blocked cells are heavily penalized but passable (corridor reservations)
 * - Edges require empty cells on perpendicular sides (spacing)
 * - Edges can jump other edges perpendicularly
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellType = 'empty' | 'node' | 'blocked' | 'connection' | 'edge' | 'jump';

export interface GridCell {
  type: CellType;
  id: number; // 0=unoccupied, nodeId for node/connection, edgeId for edge/jump
}

export interface Grid2D {
  cols: number;
  rows: number;
  cells: GridCell[][]; // cells[row][col]
}

export interface NodeDef {
  id: number;
  label: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface EdgeDef {
  id: number;
  source: number; // node ID
  target: number; // node ID
}

export interface ConnectionPoint {
  nodeId: number;
  edgeId: number;
  col: number;
  row: number;
  side: 'top' | 'bottom' | 'left' | 'right';
  /** The ID of the OTHER node this connection links to. */
  otherNodeId: number;
  /** The label of the OTHER node this connection links to. */
  otherNodeLabel: string;
}

/** Cached path for a single edge (used by incremental routing). */
export interface EdgePath {
  edgeId: number;
  cells: { col: number; row: number }[];
  /** Set of "col:row" keys for fast intersection testing. */
  cellSet: Set<string>;
}

export interface ScenarioResult {
  grid: Grid2D;
  nodes: NodeDef[];
  edges: EdgeDef[];
  connections: ConnectionPoint[];
  /** Routed paths per edge (edgeId → path). Present when routing was performed. */
  paths?: Map<number, EdgePath>;
  /** Number of negotiation rounds (rip-up and reroute cycles). */
  negotiations?: number;
  /** Time in milliseconds to generate the routing. */
  timeMs?: number;
}

// ---------------------------------------------------------------------------
// Grid creation & cell ops
// ---------------------------------------------------------------------------

export function createGrid(cols: number, rows: number): Grid2D {
  const cells: GridCell[][] = [];
  for (let r = 0; r < rows; r++) {
    cells.push(Array.from({ length: cols }, (): GridCell => ({ type: 'empty', id: 0 })));
  }
  return { cols, rows, cells };
}

export function getCell(grid: Grid2D, col: number, row: number): GridCell | null {
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return null;
  return grid.cells[row]![col]!;
}

export function setCell(grid: Grid2D, col: number, row: number, type: CellType, id: number): void {
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return;
  grid.cells[row]![col] = { type, id };
}

// ---------------------------------------------------------------------------
// Node placement
// ---------------------------------------------------------------------------

function placeNode(grid: Grid2D, node: NodeDef): void {
  for (let r = node.row; r < node.row + node.h; r++) {
    for (let c = node.col; c < node.col + node.w; c++) {
      setCell(grid, c, r, 'node', node.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Facing side determination
// ---------------------------------------------------------------------------

type Side = 'top' | 'bottom' | 'left' | 'right';

function facingSide(a: NodeDef, b: NodeDef): Side {
  const aCx = a.col + a.w / 2;
  const aCy = a.row + a.h / 2;
  const bCx = b.col + b.w / 2;
  const bCy = b.row + b.h / 2;
  const dx = bCx - aCx;
  const dy = bCy - aCy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

// ---------------------------------------------------------------------------
// Connection point distribution (proportional spread)
// ---------------------------------------------------------------------------

/**
 * Distribute `count` connection points evenly along a node side.
 *
 * - 1 connection: centered on the side.
 * - 2+ connections: spread proportionally across the side with 1-cell margins
 *   on each end and a minimum 2-cell gap between positions. This places each
 *   connection close to its corresponding target (when entries are sorted by
 *   target position), minimizing path lengths and avoiding unnecessary crossings.
 *
 * Returns sorted positions in grid coordinates.
 */
export function distributeConnections(
  sideStart: number,
  sideLength: number,
  count: number,
): number[] {
  if (count === 0) return [];
  if (count === 1) return [sideStart + Math.floor((sideLength - 1) / 2)];

  // Spread evenly across the side with 1-cell margin on each end
  const margin = 1;
  const first = sideStart + margin;
  const last = sideStart + sideLength - 1 - margin;
  const span = last - first;

  if (span <= 0 || count > sideLength) {
    // Side too small — fall back to tight center-biased packing
    const center = sideStart + Math.floor((sideLength - 1) / 2);
    const positions: number[] = [];
    for (let i = 0; i < count; i++) {
      positions.push(center - Math.floor(count / 2) + i);
    }
    return positions;
  }

  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    positions.push(first + Math.round(t * span));
  }

  // Enforce minimum 2-cell gap between adjacent positions
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! - positions[i - 1]! < 2) {
      positions[i] = positions[i - 1]! + 2;
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Connection point computation for all edges
// ---------------------------------------------------------------------------

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
      case 'right':
        fixedCoord = node.col + node.w;
        perpStart = node.row;
        perpLen = node.h;
        break;
      case 'left':
        fixedCoord = node.col - 1;
        perpStart = node.row;
        perpLen = node.h;
        break;
      case 'bottom':
        fixedCoord = node.row + node.h;
        perpStart = node.col;
        perpLen = node.w;
        break;
      case 'top':
        fixedCoord = node.row - 1;
        perpStart = node.col;
        perpLen = node.w;
        break;
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

// ---------------------------------------------------------------------------
// Connection corridor blocking (CONN-04, CONN-05)
// ---------------------------------------------------------------------------

/**
 * Block the corridor cells around each connection point.
 * Discourages edges from approaching connections from the side.
 *
 * For a left/right connection at (col, row), blocks the 3 cells directly
 * above and the 3 cells directly below.
 * For a top/bottom connection, same pattern rotated.
 *
 * Blocked cells are a heavy penalty (not hard walls) so crossings
 * can still occur when geometrically necessary.
 */
function blockConnectionCorridors(grid: Grid2D, connections: ConnectionPoint[]): void {
  const connSet = new Set<string>();
  for (const cp of connections) connSet.add(`${cp.row}:${cp.col}`);

  for (const cp of connections) {
    const cells: [number, number][] = [];

    // Block cells on all 3 columns/rows: node-side, at-connection, and outward.
    // This protects the approach lane so other edges can't block it.
    // The approach cell itself (directly outward) stays open for the owning edge.
    if (cp.side === 'left' || cp.side === 'right') {
      const nodeDc = cp.side === 'right' ? -1 : 1;
      const outDc = -nodeDc; // opposite of node side
      for (const dc of [nodeDc, 0, outDc]) {
        cells.push([cp.col + dc, cp.row - 1]); // above
        cells.push([cp.col + dc, cp.row + 1]); // below
      }
    } else {
      const nodeDr = cp.side === 'bottom' ? -1 : 1;
      const outDr = -nodeDr;
      for (const dr of [nodeDr, 0, outDr]) {
        cells.push([cp.col - 1, cp.row + dr]); // left
        cells.push([cp.col + 1, cp.row + dr]); // right
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
// A* edge routing on the grid
// ---------------------------------------------------------------------------

type MoveDir = 'h' | 'v' | 'd'; // horizontal, vertical, diagonal

interface AStarCell {
  col: number;
  row: number;
  g: number;
  f: number;
  dir: MoveDir | null;
  dc: number;  // step direction that reached this cell
  dr: number;
  parent: AStarCell | null;
}

const DIRS = [
  { dc: 1, dr: 0 },   // right
  { dc: -1, dr: 0 },  // left
  { dc: 0, dr: 1 },   // down
  { dc: 0, dr: -1 },  // up
  { dc: 1, dr: 1 },   // down-right
  { dc: -1, dr: 1 },  // down-left
  { dc: 1, dr: -1 },  // up-right
  { dc: -1, dr: -1 }, // up-left
];

const SQRT2 = Math.SQRT2;

/** Required axis for head-on approach to a connection side. */
function sideAxis(side: Side): 'h' | 'v' {
  return (side === 'left' || side === 'right') ? 'h' : 'v';
}

/** Penalty constants */
const BACKTRACK_PENALTY = 50;
const TURN_BASE_PENALTY = 4;
const TURN_IMBALANCE_FACTOR = 0.5;
const JUMP_PENALTY = 6;
const DIAGONAL_EXTRA_COST = 1.4;     // diagonals are more expensive than straight
const DIAGONAL_ZIGZAG_PENALTY = 8;   // changing diagonal direction (up-right → down-right)

/**
 * Tracks which direction edges occupy each cell.
 * Used for accurate perpendicular jump detection — no neighbor inference needed.
 */
interface EdgeDirTracker {
  h: Set<string>; // cells with horizontal edge segments
  v: Set<string>; // cells with vertical edge segments
  d: Set<string>; // cells with diagonal edge segments
}

function dirKey(col: number, row: number): string {
  return `${col}:${row}`;
}

function createDirTracker(): EdgeDirTracker {
  return { h: new Set(), v: new Set(), d: new Set() };
}

function clearDirTracker(dirs: EdgeDirTracker): void {
  dirs.h.clear();
  dirs.v.clear();
  dirs.d.clear();
}

/**
 * Core A* router. When `relaxed` is true, drops the parallel edge gap
 * constraint to guarantee a path in tight scenarios. All other hard rules
 * (no node penetration, no edge overlap, no connection penetration,
 * head-on approach) are always enforced.
 */
function astarRoute(
  grid: Grid2D,
  sc: number, sr: number, sourceSide: Side,
  tc: number, tr: number, targetSide: Side,
  dirs: EdgeDirTracker,
  relaxed: boolean,
): { col: number; row: number }[] | null {
  const key = (c: number, r: number, d: MoveDir | null) => {
    const di = d === null ? 0 : d === 'h' ? 1 : d === 'v' ? 2 : 3;
    return r * grid.cols * 4 + c * 4 + di;
  };

  // Chebyshev distance — accounts for diagonal moves
  const heuristic = (c: number, r: number) => {
    const dx = Math.abs(c - tc);
    const dy = Math.abs(r - tr);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  const totalDist = Math.abs(tc - sc) + Math.abs(tr - sr);
  const halfDist = totalDist / 2;

  const requiredSourceAxis = sideAxis(sourceSide);
  const requiredTargetAxis = sideAxis(targetSide);

  const open: AStarCell[] = [];
  const gCosts = new Map<number, number>();
  const closed = new Set<number>();

  const start: AStarCell = { col: sc, row: sr, g: 0, f: heuristic(sc, sr), dir: null, dc: 0, dr: 0, parent: null };
  open.push(start);
  gCosts.set(key(sc, sr, null), 0);

  let found: AStarCell | null = null;
  let iterations = 0;
  const MAX_ITERATIONS = grid.cols * grid.rows * 8;

  while (open.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const ci = key(current.col, current.row, current.dir);

    if (closed.has(ci)) continue;
    closed.add(ci);

    if (current.col === tc && current.row === tr) {
      found = current;
      break;
    }

    for (const { dc, dr } of DIRS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;

      const isDiag = dc !== 0 && dr !== 0;
      const axis: MoveDir = isDiag ? 'd' : (dc !== 0 ? 'h' : 'v');
      const ni = key(nc, nr, axis);
      if (closed.has(ni)) continue;

      const cell = grid.cells[nr]![nc]!;

      // --- Hard blocks (always enforced, even in relaxed mode) ---

      // Never enter node or blocked (corridor) cells
      if (cell.type === 'node' || cell.type === 'blocked') continue;

      // Diagonal moves must not cut through node corners
      if (isDiag) {
        const adj1 = getCell(grid, nc, current.row);
        const adj2 = getCell(grid, current.col, nr);
        if (adj1 && (adj1.type === 'node' || adj1.type === 'blocked')) continue;
        if (adj2 && (adj2.type === 'node' || adj2.type === 'blocked')) continue;
      }

      // Edge/jump cells: only allow crossing if different direction.
      // Uses explicit direction tracking — no neighbor guessing.
      if (cell.type === 'edge' || cell.type === 'jump') {
        const k = dirKey(nc, nr);
        // Block if same direction exists (parallel overlap)
        if (axis === 'h' && dirs.h.has(k)) continue;
        if (axis === 'v' && dirs.v.has(k)) continue;
        if (axis === 'd' && dirs.d.has(k)) continue;
        // Block if no direction recorded (shouldn't happen, but be safe)
        if (!dirs.h.has(k) && !dirs.v.has(k) && !dirs.d.has(k)) continue;
      }

      // CONN-04: Enforce head-on departure from source (no diagonal)
      if (current.col === sc && current.row === sr && current.dir === null) {
        if (axis !== requiredSourceAxis) continue;
      }

      // CONN-04: Enforce head-on arrival at target (no diagonal)
      if (nc === tc && nr === tr) {
        if (axis !== requiredTargetAxis) continue;
      }

      // Never enter connection cells unless they're our endpoints
      if (cell.type === 'connection') {
        const isOurEndpoint = (nc === sc && nr === sr) || (nc === tc && nr === tr);
        if (!isOurEndpoint) continue;
      }

      // --- Cost calculation ---
      let stepCost = isDiag ? SQRT2 + DIAGONAL_EXTRA_COST : 1;

      // Diagonal zigzag penalty: changing diagonal direction (e.g. up-right → down-right)
      if (isDiag && current.dir === 'd') {
        if (current.dc !== dc || current.dr !== dr) {
          stepCost += DIAGONAL_ZIGZAG_PENALTY;
        }
      }

      // Backtrack penalty (use Chebyshev distance)
      const currentDist = Math.max(Math.abs(current.col - tc), Math.abs(current.row - tr));
      const nextDist = Math.max(Math.abs(nc - tc), Math.abs(nr - tr));
      if (nextDist > currentDist) {
        stepCost += BACKTRACK_PENALTY;
      }

      // Turn penalty — biased toward midpoint for balanced segment lengths
      if (current.dir !== null && current.dir !== axis) {
        const distFromSource = Math.abs(current.col - sc) + Math.abs(current.row - sr);
        const imbalance = Math.abs(distFromSource - halfDist);
        stepCost += TURN_BASE_PENALTY + Math.floor(imbalance * TURN_IMBALANCE_FACTOR);
      }

      // Jump penalty — crossing existing edges perpendicularly
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

/**
 * Place an edge path on the grid and record direction in tracker.
 */
function placeEdgePath(
  grid: Grid2D,
  edgeId: number,
  path: { col: number; row: number }[],
  dirs: EdgeDirTracker,
): void {
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;

    // Determine segment direction from neighbors in the path
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

    // Record direction
    if (dir) {
      (dir === 'h' ? dirs.h : dir === 'v' ? dirs.v : dirs.d).add(dirKey(p.col, p.row));
    }

    // Place on grid
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

// ---------------------------------------------------------------------------
// Build a complete scenario
// ---------------------------------------------------------------------------

/**
 * Clear all edge and jump cells from the grid, resetting them to empty.
 */
function clearEdgeCells(grid: Grid2D, dirs: EdgeDirTracker): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      if (cell.type === 'edge' || cell.type === 'jump') {
        grid.cells[r]![c] = { type: 'empty', id: 0 };
      }
    }
  }
  clearDirTracker(dirs);
}

/**
 * Route all edges, trying strict then relaxed. Returns count of relaxed fallbacks.
 */
function routeEdgesInOrder(
  grid: Grid2D,
  order: EdgeDef[],
  connByEdge: Map<number, { src: ConnectionPoint | null; tgt: ConnectionPoint | null }>,
  dirs: EdgeDirTracker,
): number {
  let relaxedCount = 0;

  for (const e of order) {
    const ep = connByEdge.get(e.id);
    if (!ep?.src || !ep?.tgt) continue;

    const strict = astarRoute(grid, ep.src.col, ep.src.row, ep.src.side, ep.tgt.col, ep.tgt.row, ep.tgt.side, dirs, false);
    if (strict) {
      placeEdgePath(grid, e.id, strict, dirs);
    } else {
      const relaxed = astarRoute(grid, ep.src.col, ep.src.row, ep.src.side, ep.tgt.col, ep.tgt.row, ep.tgt.side, dirs, true);
      if (relaxed) {
        placeEdgePath(grid, e.id, relaxed, dirs);
      }
      relaxedCount++;
    }
  }

  return relaxedCount;
}

/**
 * Build a Grid2D from node and edge definitions.
 *
 * 1. Compute grid dimensions from node positions (with padding)
 * 2. Place nodes on the grid
 * 3. Compute and place connection points (center-biased)
 * 4. Block corridor cells around connections
 * 5. Route edges with retry (rotate order if edges need relaxed fallback)
 */
export function buildScenario(nodes: NodeDef[], edges: EdgeDef[], padding: number = 2): ScenarioResult {
  const t0 = performance.now();
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

  // 3. Compute and place connection points
  const connections = computeConnections(nodes, edges);
  for (const cp of connections) {
    const cell = getCell(grid, cp.col, cp.row);
    if (cell && cell.type === 'empty') {
      setCell(grid, cp.col, cp.row, 'connection', cp.nodeId);
    }
  }

  // 4. Block corridor cells around connections (CONN-04, CONN-05)
  blockConnectionCorridors(grid, connections);

  // 5. Build connection lookup: edgeId → { src, tgt }
  const connByEdge = new Map<number, { src: ConnectionPoint | null; tgt: ConnectionPoint | null }>();
  for (const e of edges) {
    connByEdge.set(e.id, { src: null, tgt: null });
  }
  for (const cp of connections) {
    const entry = connByEdge.get(cp.edgeId);
    if (!entry) continue;
    const edge = edges.find(e => e.id === cp.edgeId);
    if (!edge) continue;
    if (cp.nodeId === edge.source) entry.src = cp;
    else if (cp.nodeId === edge.target) entry.tgt = cp;
  }

  // 6. Route edges with round-robin retry for best quality
  const dirs = createDirTracker();
  const maxAttempts = Math.min(edges.length, 4);
  let bestRelaxedCount = edges.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const offset = attempt % edges.length;
    const order = [...edges.slice(offset), ...edges.slice(0, offset)];

    const relaxedCount = routeEdgesInOrder(grid, order, connByEdge, dirs);

    if (relaxedCount === 0) break;

    if (relaxedCount < bestRelaxedCount) {
      bestRelaxedCount = relaxedCount;
      if (attempt < maxAttempts - 1) {
        clearEdgeCells(grid, dirs);
        continue;
      }
    } else if (attempt < maxAttempts - 1) {
      clearEdgeCells(grid, dirs);
    }
  }

  return { grid, nodes, edges, connections, timeMs: performance.now() - t0 };
}
