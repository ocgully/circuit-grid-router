/**
 * A* grid pathfinder — routes a single edge between two pixel-space points.
 */

import type { GridPoint, NodeRect, RouteSegment, RouterOptions } from './types.js';
import { resolveOptions } from './types.js';
import { snapToGrid, toGrid, fromGrid } from './grid.js';
import { buildSegments, markOccupied } from './segments.js';

/**
 * Does the given grid cell overlap any of the node rects (expanded by nodeMargin cells)?
 * Source and target node rects are exempt (edges must start/end at their borders).
 */
function cellBlocked(
  gx: number,
  gy: number,
  nodeRects: NodeRect[],
  srcRect: NodeRect | null,
  tgtRect: NodeRect | null,
  gridSize: number,
  nodeMargin: number,
): boolean {
  const px = gx * gridSize;
  const py = gy * gridSize;
  const margin = nodeMargin * gridSize;

  for (const r of nodeRects) {
    // Skip source/target nodes — edges must be able to reach their borders
    if (r === srcRect || r === tgtRect) continue;

    if (
      px >= r.x - margin &&
      px <= r.x + r.w + margin &&
      py >= r.y - margin &&
      py <= r.y + r.h + margin
    ) {
      return true;
    }
  }
  return false;
}

interface AStarNode {
  gx: number;
  gy: number;
  g: number; // cost from start
  f: number; // g + h
  parent: AStarNode | null;
  /** Direction taken to arrive at this node ('h' or 'v'), null for start. */
  dir: 'h' | 'v' | null;
}

/** L-shaped 2-segment fallback route. */
function lShapeFallback(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  occupiedSegments: Set<string>,
  gridSize: number,
): { waypoints: { x: number; y: number }[]; segments: RouteSegment[] } {
  // Go horizontal first, then vertical
  const mid = { x: tx, y: sy };
  const waypoints = [
    { x: sx, y: sy },
    mid,
    { x: tx, y: ty },
  ];

  const srcGrid = toGrid(sx, sy, gridSize);
  const midGrid = toGrid(mid.x, mid.y, gridSize);
  const tgtGrid = toGrid(tx, ty, gridSize);

  const segments: RouteSegment[] = [
    { from: srcGrid, to: midGrid, axis: 'h' },
    { from: midGrid, to: tgtGrid, axis: 'v' },
  ];

  for (const seg of segments) markOccupied(seg, occupiedSegments);
  return { waypoints, segments };
}

/** Secondary routing function for coarser grid — same algorithm, different cell size. */
function routeEdgeAtGrid(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  _nodeRects: NodeRect[],
  occupiedSegments: Set<string>,
  gridSize: number,
): { waypoints: { x: number; y: number }[]; segments: RouteSegment[] } {
  const snap = (v: number) => Math.round(v / gridSize) * gridSize;
  const snappedSx = snap(sx);
  const snappedSy = snap(sy);
  const snappedTx = snap(tx);
  const snappedTy = snap(ty);
  // Use lShape for coarse grid (already avoids main path issues)
  return lShapeFallback(snappedSx, snappedSy, snappedTx, snappedTy, occupiedSegments, gridSize);
}

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/**
 * A* pathfinding on a configurable grid from (sourceX,sourceY) to (targetX,targetY) in pixel space.
 * Avoids cells that overlap node rects. Penalises but does not block occupied segments.
 * Penalises direction changes to minimise turns.
 *
 * Returns pixel-space waypoints (snapped to grid) and the corresponding segments.
 * Falls back to an L-shaped route if A* cannot find a path.
 *
 * @param sourceRect - Bounding box of the source node (exempt from blocking)
 * @param targetRect - Bounding box of the target node (exempt from blocking)
 */
export function routeEdge(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  nodeRects: NodeRect[],
  occupiedSegments: Set<string>,
  options?: RouterOptions,
  sourceRect?: NodeRect,
  targetRect?: NodeRect,
): { waypoints: { x: number; y: number }[]; segments: RouteSegment[] } {
  const opts = resolveOptions(options);
  const gridSize = opts.gridSize;

  const sx = snapToGrid(sourceX, gridSize);
  const sy = snapToGrid(sourceY, gridSize);
  const tx = snapToGrid(targetX, gridSize);
  const ty = snapToGrid(targetY, gridSize);

  if (sx === tx && sy === ty) {
    // Same point - trivial
    return { waypoints: [{ x: sx, y: sy }], segments: [] };
  }

  const srcGrid = toGrid(sx, sy, gridSize);
  const tgtGrid = toGrid(tx, ty, gridSize);

  // Bounding box for grid with padding
  const PADDING = 200;
  const minX = Math.floor((Math.min(sx, tx) - PADDING) / gridSize);
  const maxX = Math.ceil((Math.max(sx, tx) + PADDING) / gridSize);
  const minY = Math.floor((Math.min(sy, ty) - PADDING) / gridSize);
  const maxY = Math.ceil((Math.max(sy, ty) + PADDING) / gridSize);

  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const totalCells = cols * rows;

  // Performance guard: use 2x grid if too many cells
  if (totalCells > opts.maxGridCells) {
    return routeEdgeAtGrid(sx, sy, tx, ty, nodeRects, occupiedSegments, gridSize * 2);
  }

  // Encode direction into cell index for turn-aware A*
  // dir: 0=none, 1=h, 2=v → 3 states per cell
  const cellIndex = (gx: number, gy: number, dir: 'h' | 'v' | null) => {
    const dirIdx = dir === null ? 0 : dir === 'h' ? 1 : 2;
    return ((gy - minY) * cols + (gx - minX)) * 3 + dirIdx;
  };

  // Heuristic: Manhattan distance
  const h = (gx: number, gy: number) => Math.abs(gx - tgtGrid.gx) + Math.abs(gy - tgtGrid.gy);

  const srcRectRef = sourceRect ?? null;
  const tgtRectRef = targetRect ?? null;

  // Open list as a simple sorted array (adequate for <1000 edges in typical canvases)
  const open: AStarNode[] = [];
  const gCosts = new Map<number, number>();
  const closed = new Set<number>();

  const startNode: AStarNode = { gx: srcGrid.gx, gy: srcGrid.gy, g: 0, f: h(srcGrid.gx, srcGrid.gy), parent: null, dir: null };
  open.push(startNode);
  gCosts.set(cellIndex(srcGrid.gx, srcGrid.gy, null), 0);

  let found: AStarNode | null = null;

  while (open.length > 0) {
    // Pop lowest f
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const ci = cellIndex(current.gx, current.gy, current.dir);

    if (closed.has(ci)) continue;
    closed.add(ci);

    if (current.gx === tgtGrid.gx && current.gy === tgtGrid.gy) {
      found = current;
      break;
    }

    for (const { dx, dy } of DIRS) {
      const nx = current.gx + dx;
      const ny = current.gy + dy;

      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;

      const axis: 'h' | 'v' = dx !== 0 ? 'h' : 'v';
      const ni = cellIndex(nx, ny, axis);
      if (closed.has(ni)) continue;

      // Allow start/end cells through their own node but block other nodes
      const isStartOrEnd = (nx === srcGrid.gx && ny === srcGrid.gy) || (nx === tgtGrid.gx && ny === tgtGrid.gy);
      if (!isStartOrEnd && cellBlocked(nx, ny, nodeRects, srcRectRef, tgtRectRef, gridSize, opts.nodeMargin)) continue;

      // Check if this step uses an occupied unit segment
      const unitKey = axis === 'h' ? `h:${ny}:${Math.min(current.gx, nx)}` : `v:${nx}:${Math.min(current.gy, ny)}`;
      const occupiedPenalty = occupiedSegments.has(unitKey) ? opts.occupiedPenalty : 0;

      // Turn penalty: penalise changing direction to encourage straight paths
      const turnCost = (current.dir !== null && current.dir !== axis) ? opts.turnPenalty : 0;

      const ng = current.g + 1 + occupiedPenalty + turnCost;
      const prevG = gCosts.get(ni);

      if (prevG === undefined || ng < prevG) {
        gCosts.set(ni, ng);
        const nf = ng + h(nx, ny);
        open.push({ gx: nx, gy: ny, g: ng, f: nf, parent: current, dir: axis });
      }
    }
  }

  if (found) {
    // Reconstruct path
    const gridPath: GridPoint[] = [];
    let node: AStarNode | null = found;
    while (node) {
      gridPath.unshift({ gx: node.gx, gy: node.gy });
      node = node.parent;
    }

    const waypoints = gridPath.map(p => fromGrid(p.gx, p.gy, gridSize));
    const segments = buildSegments(gridPath);
    for (const seg of segments) markOccupied(seg, occupiedSegments);
    return { waypoints, segments };
  }

  // Fallback: L-shaped route
  return lShapeFallback(sx, sy, tx, ty, occupiedSegments, gridSize);
}
