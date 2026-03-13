/**
 * Crossing detection — find points where edges cross at perpendicular axes.
 */
import type { RouteSegment, CrossingPoint } from './types.js';
/**
 * Find all grid-pixel positions where segments from edge A cross segments from edge B
 * at perpendicular axes (H crosses V or V crosses H).
 */
export declare function findCrossings(segmentsA: RouteSegment[], segmentsB: RouteSegment[], gridSize?: number): CrossingPoint[];
//# sourceMappingURL=crossings.d.ts.map