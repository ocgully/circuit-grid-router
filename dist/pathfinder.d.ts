/**
 * A* grid pathfinder — routes a single edge between two pixel-space points.
 */
import type { NodeRect, RouteSegment, RouterOptions } from './types.js';
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
export declare function routeEdge(sourceX: number, sourceY: number, targetX: number, targetY: number, nodeRects: NodeRect[], occupiedSegments: Set<string>, options?: RouterOptions, sourceRect?: NodeRect, targetRect?: NodeRect): {
    waypoints: {
        x: number;
        y: number;
    }[];
    segments: RouteSegment[];
};
//# sourceMappingURL=pathfinder.d.ts.map