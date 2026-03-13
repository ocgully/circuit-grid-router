/**
 * Core types for the grid-based orthogonal edge router.
 *
 * All types are view-layer independent — no React, SVG, DOM, or Canvas references.
 * Outputs are coordinate-based: arrays of {x,y} points, side+offset pairs, etc.
 */

/** Coordinates in grid-cell space (not pixels). */
export interface GridPoint {
  gx: number;
  gy: number;
}

/** A single orthogonal segment between two grid points on one axis. */
export interface RouteSegment {
  from: GridPoint;
  to: GridPoint;
  axis: 'h' | 'v';
}

/** A point where two edges cross at perpendicular axes. */
export interface CrossingPoint {
  x: number;
  y: number;
  /** Axis of the later edge at the crossing point. */
  axis: 'h' | 'v';
}

/** A fully routed edge with waypoint coordinates and metadata. */
export interface RoutedEdge {
  id: string;
  /** Ordered pixel-space waypoints describing the edge path. */
  waypoints: { x: number; y: number }[];
  segments: RouteSegment[];
  crossings: CrossingPoint[];
}

/** Axis-aligned bounding box of a node in pixel space. */
export interface NodeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which side of a node a handle connects on. */
export type Side = 'top' | 'bottom' | 'left' | 'right';

/** Per-edge handle slot on a node side. offset is in pixels from node edge start. */
export interface HandlePosition {
  nodeId: string;
  edgeId: string;
  position: Side;
  offset: number;
}

/** Configuration options for the router. All values have sensible defaults. */
export interface RouterOptions {
  /** Grid cell size in pixels. Default 8. */
  gridSize?: number;
  /** Half-circle arc radius at crossings (informational — not used for rendering). Default 4. */
  humpRadius?: number;
  /** Minimum pixel gap between any two node bounding boxes. Default 48. */
  minNodeSpacing?: number;
  /** Performance guard: max grid cells before switching to coarser grid. Default 50000. */
  maxGridCells?: number;
  /** A* penalty for stepping through an occupied segment. Default 100. */
  occupiedPenalty?: number;
  /** A* penalty for changing direction (turning). Encourages straight paths. Default 3. */
  turnPenalty?: number;
  /** Number of grid cells of margin around nodes that edges must avoid. Default 3 (24px at 8px grid). */
  nodeMargin?: number;
}

/** Resolved router options with all defaults applied. */
export interface ResolvedRouterOptions {
  gridSize: number;
  humpRadius: number;
  minNodeSpacing: number;
  maxGridCells: number;
  occupiedPenalty: number;
  turnPenalty: number;
  nodeMargin: number;
}

/** Default router option values. */
export const DEFAULT_ROUTER_OPTIONS: ResolvedRouterOptions = {
  gridSize: 8,
  humpRadius: 4,
  minNodeSpacing: 48,
  maxGridCells: 50000,
  occupiedPenalty: 100,
  turnPenalty: 3,
  nodeMargin: 3,
};

/** Resolve partial options against defaults. */
export function resolveOptions(opts?: RouterOptions): ResolvedRouterOptions {
  return { ...DEFAULT_ROUTER_OPTIONS, ...opts };
}
