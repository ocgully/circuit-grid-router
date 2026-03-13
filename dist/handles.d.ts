/**
 * Handle position computation — determines where edges connect on node sides.
 *
 * Key rule: edges MUST connect on grid lines.
 * - 1 edge on a side: centered on the side (snapped to grid)
 * - Odd n edges: one centered, then pairs at ±gridSize, ±2*gridSize, ...
 * - Even n edges: center is a gap, pairs at ±gridSize, ±2*gridSize, ...
 */
import type { NodeRect, HandlePosition, RouterOptions } from './types.js';
/**
 * Distribute `count` positions symmetrically around `sideCenter`, all on grid lines.
 *
 * - Odd count: one at center, pairs outward at ±gridSize intervals
 * - Even count: no position at center (gap), pairs outward at ±gridSize intervals
 *
 * Returns sorted array of pixel positions.
 */
export declare function distributeOnSide(count: number, sideCenter: number, gridSize: number): number[];
/**
 * For a given node, compute individual handle positions for each connected edge.
 * Distributes handles on the facing side, spaced gridSize apart.
 * Wraps to adjacent sides if a side runs out of slots.
 */
export declare function computeHandlePositions(nodeId: string, nodeRect: NodeRect, connectedEdges: {
    edgeId: string;
    direction: 'source' | 'target';
    otherNodeRect: NodeRect;
}[], options?: RouterOptions): HandlePosition[];
/**
 * Compute the actual pixel positions where an edge exits/enters nodes.
 * Uses direction logic to determine which side, then returns the center
 * of that side as the endpoint.
 *
 * @deprecated Use computeAllEndpoints for proper multi-edge distribution.
 */
export declare function computeEdgeEndpoints(sourceRect: NodeRect, targetRect: NodeRect, options?: RouterOptions): {
    sx: number;
    sy: number;
    tx: number;
    ty: number;
};
/** Edge specification for batch endpoint computation. */
export interface EdgeSpec {
    id: string;
    sourceId: string;
    targetId: string;
}
/** Positioned edge with endpoints on grid lines. */
export interface PositionedEdge {
    id: string;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
}
/**
 * Compute endpoints for ALL edges at once, distributing multiple edges on
 * the same node side symmetrically around center:
 *
 * - 1 edge: centered on the side
 * - 2 edges: straddling center (center is a gap)
 * - 3 edges: one centered, one on each side
 * - n edges: symmetric around center, all on grid lines
 *
 * Edges within a side group are sorted by the perpendicular position of
 * the other node so they don't cross unnecessarily near the node.
 */
export declare function computeAllEndpoints(edges: EdgeSpec[], nodeRects: Map<string, NodeRect>, options?: RouterOptions): PositionedEdge[];
//# sourceMappingURL=handles.d.ts.map