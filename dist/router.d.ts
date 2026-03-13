/**
 * Top-level router — orchestrates pathfinding for all edges and detects crossings.
 */
import type { NodeRect, RoutedEdge, RouterOptions } from './types.js';
/**
 * Route all edges sequentially. Each routed edge marks its segments as occupied
 * so subsequent edges route around them. After routing, finds crossings pairwise.
 *
 * Edges may optionally specify sourceNodeIndex/targetNodeIndex to identify their
 * source and target nodes in nodeRects. This enables proper node avoidance —
 * edges avoid all nodes except their own source/target.
 */
export declare function routeAllEdges(edges: {
    id: string;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    sourceNodeIndex?: number;
    targetNodeIndex?: number;
}[], nodeRects: NodeRect[], options?: RouterOptions): RoutedEdge[];
//# sourceMappingURL=router.d.ts.map