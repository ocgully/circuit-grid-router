/**
 * Incremental Routing — Optimized for single-node-move (drag) scenarios.
 *
 * Maintains a RoutingState that can be incrementally updated when one node
 * moves, avoiding full rerouting of all edges on every frame.
 *
 * Strategy:
 * - Initial load + drop: full negotiated congestion solve (buildScenarioNegotiated)
 * - During drag: grid delta + selective single-pass A* for affected edges only
 */
import type { Grid2D, NodeDef, EdgeDef, ConnectionPoint, ScenarioResult, EdgePath } from './grid2d.js';
export type { EdgePath } from './grid2d.js';
/**
 * Tracks which direction edges occupy each cell.
 * Used to prevent same-direction overlap (two horizontal edges in same cell).
 */
interface EdgeDirTracker {
    h: Set<string>;
    v: Set<string>;
    d: Set<string>;
}
/** Full routing state — maintained across incremental updates. */
export interface RoutingState {
    grid: Grid2D;
    nodes: NodeDef[];
    edges: EdgeDef[];
    connections: ConnectionPoint[];
    paths: Map<number, EdgePath>;
    /** Direction tracker for same-axis overlap prevention. */
    dirs: EdgeDirTracker;
    /** Grid cell size in pixels (for coordinate conversion). */
    cellSize: number;
}
/** Convert pixel coordinate to grid cell index. */
export declare function pixelToGrid(px: number, cellSize: number): number;
/** Convert grid cell index to pixel coordinate (cell center). */
export declare function gridToPixel(cell: number, cellSize: number): number;
/** Convert a pixel-space node rect to a grid-space NodeDef. */
export declare function pixelNodeToGrid(id: number, label: string, x: number, y: number, width: number, height: number, cellSize: number): NodeDef;
/**
 * Create initial routing state with full negotiated congestion solve.
 * Uses buildScenarioNegotiated for optimal, overlap-free routing.
 */
export declare function createRoutingState(nodes: NodeDef[], edges: EdgeDef[], cellSize: number, padding?: number): RoutingState;
/**
 * Incremental update: move a single node to a new position.
 * Returns a new RoutingState with only affected edges rerouted (fast single-pass A*).
 * Uses direction tracking to prevent same-axis overlap.
 */
export declare function moveNode(state: RoutingState, nodeId: number, newCol: number, newRow: number, padding?: number): RoutingState;
/**
 * Full reroute using negotiated congestion solver.
 * Call on mouse-up / drag-stop for optimal results.
 * Delegates to buildScenarioNegotiated for proper direction tracking + congestion resolution.
 */
export { buildScenarioNegotiated } from './negotiated.js';
export declare function fullReroute(state: RoutingState, padding?: number): RoutingState;
/**
 * Convert a RoutingState to a ScenarioResult for rendering.
 */
export declare function toScenarioResult(state: RoutingState): ScenarioResult;
/**
 * Convert grid-space edge paths to pixel-space SVG path strings.
 * Lines pass through cell centers.
 */
export declare function edgePathToSvgPoints(edgePath: EdgePath, cellSize: number): {
    x: number;
    y: number;
}[];
/**
 * Build SVG path string from waypoints.
 */
export declare function waypointsToSvgPath(waypoints: {
    x: number;
    y: number;
}[]): string;
/**
 * Find crossing points (jumps) from the grid state.
 * Returns pixel-space crossing positions with axis info.
 */
export declare function findJumps(state: RoutingState): {
    x: number;
    y: number;
    axis: 'h' | 'v';
}[];
//# sourceMappingURL=incremental.d.ts.map