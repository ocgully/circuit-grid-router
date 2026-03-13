/**
 * Segment key generation, occupancy tracking, overlap detection, and segment building.
 */
import type { GridPoint, RouteSegment } from './types.js';
/** Deterministic key for a route segment — used for occupied tracking. */
export declare function segmentKey(seg: RouteSegment): string;
/** Build all individual unit-segment keys that a longer segment occupies. */
export declare function segmentUnitKeys(seg: RouteSegment): string[];
/** Mark all unit segments of a segment as occupied. */
export declare function markOccupied(seg: RouteSegment, occupied: Set<string>): void;
/** Is a unit segment already occupied? */
export declare function isOccupied(seg: RouteSegment, occupied: Set<string>): boolean;
/** Check if two segments share any occupied unit segments (i.e., overlap). */
export declare function segmentsOverlap(a: RouteSegment, b: RouteSegment): boolean;
/** Build RouteSegment array from an ordered list of grid points. */
export declare function buildSegments(gridPath: GridPoint[]): RouteSegment[];
//# sourceMappingURL=segments.d.ts.map