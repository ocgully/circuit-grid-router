/**
 * @blitz/grid-router — Generic grid-based orthogonal edge routing library.
 *
 * View-layer independent: outputs coordinates (waypoints, crossing points,
 * handle positions) — no React, SVG, DOM, or Canvas dependencies.
 *
 * @example
 * ```ts
 * import { routeAllEdges, computeEdgeEndpoints } from '@blitz/grid-router';
 *
 * const edges = [{ id: 'e1', sx: 0, sy: 0, tx: 200, ty: 100 }];
 * const nodes = [{ x: 80, y: 20, w: 60, h: 40 }];
 * const routed = routeAllEdges(edges, nodes, { gridSize: 8 });
 * // routed[0].waypoints -> [{x,y}, {x,y}, ...]
 * // routed[0].crossings -> [{x, y, axis}, ...]
 * ```
 */

// Types
export type {
  GridPoint,
  RouteSegment,
  CrossingPoint,
  RoutedEdge,
  NodeRect,
  Side,
  HandlePosition,
  RouterOptions,
  ResolvedRouterOptions,
} from './types.js';

export { DEFAULT_ROUTER_OPTIONS, resolveOptions } from './types.js';

// Grid helpers
export { snapToGrid, toGrid, fromGrid } from './grid.js';

// Segments
export {
  segmentKey,
  segmentUnitKeys,
  markOccupied,
  isOccupied,
  segmentsOverlap,
  buildSegments,
} from './segments.js';

// Crossings
export { findCrossings } from './crossings.js';

// Handles & endpoints
export { computeHandlePositions, computeEdgeEndpoints, computeAllEndpoints, distributeOnSide } from './handles.js';
export type { EdgeSpec, PositionedEdge } from './handles.js';

// Spacing
export { enforceMinSpacing } from './spacing.js';

// Pathfinder
export { routeEdge } from './pathfinder.js';

// Router (top-level orchestrator)
export { routeAllEdges } from './router.js';

// Grid2D model
export {
  createGrid,
  getCell,
  setCell,
  distributeConnections,
  buildScenario,
} from './grid2d.js';
export type {
  CellType,
  GridCell,
  Grid2D,
  NodeDef,
  EdgeDef,
  EdgePath,
  ConnectionPoint,
  ScenarioResult,
} from './grid2d.js';

// Negotiated congestion router
export { buildScenarioNegotiated } from './negotiated.js';

// Incremental routing (optimized for single-node drag)
export {
  createRoutingState,
  moveNode,
  fullReroute,
  toScenarioResult,
  edgePathToSvgPoints,
  waypointsToSvgPath,
  findJumps,
  pixelToGrid,
  gridToPixel,
  pixelNodeToGrid,
} from './incremental.js';
export type { RoutingState } from './incremental.js';

// WFC approaches
export { buildScenarioWfcPath } from './wfc-path.js';
export { buildScenarioWfcConflict } from './wfc-conflict.js';
export { buildScenarioWfcFull } from './wfc-full.js';
