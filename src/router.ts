/**
 * Top-level router — orchestrates pathfinding for all edges and detects crossings.
 */

import type { NodeRect, RoutedEdge, CrossingPoint, RouteSegment, RouterOptions } from './types.js';
import { routeEdge } from './pathfinder.js';
import { findCrossings } from './crossings.js';
import { resolveOptions } from './types.js';

/**
 * Route all edges sequentially. Each routed edge marks its segments as occupied
 * so subsequent edges route around them. After routing, finds crossings pairwise.
 *
 * Edges may optionally specify sourceNodeIndex/targetNodeIndex to identify their
 * source and target nodes in nodeRects. This enables proper node avoidance —
 * edges avoid all nodes except their own source/target.
 */
export function routeAllEdges(
  edges: { id: string; sx: number; sy: number; tx: number; ty: number; sourceNodeIndex?: number; targetNodeIndex?: number }[],
  nodeRects: NodeRect[],
  options?: RouterOptions,
): RoutedEdge[] {
  if (edges.length === 0) return [];

  const opts = resolveOptions(options);
  const occupied = new Set<string>();
  const routed: Array<{ id: string; segments: RouteSegment[]; waypoints: { x: number; y: number }[] }> = [];

  for (const e of edges) {
    const srcRect = e.sourceNodeIndex != null ? nodeRects[e.sourceNodeIndex] : undefined;
    const tgtRect = e.targetNodeIndex != null ? nodeRects[e.targetNodeIndex] : undefined;
    const result = routeEdge(e.sx, e.sy, e.tx, e.ty, nodeRects, occupied, options, srcRect, tgtRect);
    routed.push({ id: e.id, segments: result.segments, waypoints: result.waypoints });
  }

  // Build RoutedEdge array with pairwise crossings
  return routed.map((r, i) => {
    const crossings: CrossingPoint[] = [];
    for (let j = 0; j < i; j++) {
      const found = findCrossings(routed[j]!.segments, r.segments, opts.gridSize);
      crossings.push(...found);
    }
    return {
      id: r.id,
      waypoints: r.waypoints,
      segments: r.segments,
      crossings,
    };
  });
}
