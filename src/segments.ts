/**
 * Segment key generation, occupancy tracking, overlap detection, and segment building.
 */

import type { GridPoint, RouteSegment } from './types.js';

/** Deterministic key for a route segment — used for occupied tracking. */
export function segmentKey(seg: RouteSegment): string {
  // Normalise direction so (A->B) and (B->A) produce the same key
  const { from, to } = seg;
  if (seg.axis === 'h') {
    const minX = Math.min(from.gx, to.gx);
    const maxX = Math.max(from.gx, to.gx);
    return `h:${from.gy}:${minX}-${maxX}`;
  } else {
    const minY = Math.min(from.gy, to.gy);
    const maxY = Math.max(from.gy, to.gy);
    return `v:${from.gx}:${minY}-${maxY}`;
  }
}

/** Build all individual unit-segment keys that a longer segment occupies. */
export function segmentUnitKeys(seg: RouteSegment): string[] {
  const keys: string[] = [];
  if (seg.axis === 'h') {
    const minX = Math.min(seg.from.gx, seg.to.gx);
    const maxX = Math.max(seg.from.gx, seg.to.gx);
    for (let x = minX; x < maxX; x++) {
      keys.push(`h:${seg.from.gy}:${x}`);
    }
  } else {
    const minY = Math.min(seg.from.gy, seg.to.gy);
    const maxY = Math.max(seg.from.gy, seg.to.gy);
    for (let y = minY; y < maxY; y++) {
      keys.push(`v:${seg.from.gx}:${y}`);
    }
  }
  return keys;
}

/** Mark all unit segments of a segment as occupied. */
export function markOccupied(seg: RouteSegment, occupied: Set<string>): void {
  for (const k of segmentUnitKeys(seg)) {
    occupied.add(k);
  }
}

/** Is a unit segment already occupied? */
export function isOccupied(seg: RouteSegment, occupied: Set<string>): boolean {
  // A single-cell segment (from === to) has no unit segments, never occupied
  if (seg.from.gx === seg.to.gx && seg.from.gy === seg.to.gy) return false;
  const keys = segmentUnitKeys(seg);
  return keys.some(k => occupied.has(k));
}

/** Check if two segments share any occupied unit segments (i.e., overlap). */
export function segmentsOverlap(a: RouteSegment, b: RouteSegment): boolean {
  if (a.axis !== b.axis) return false;

  if (a.axis === 'h') {
    if (a.from.gy !== b.from.gy) return false;
    const minA = Math.min(a.from.gx, a.to.gx);
    const maxA = Math.max(a.from.gx, a.to.gx);
    const minB = Math.min(b.from.gx, b.to.gx);
    const maxB = Math.max(b.from.gx, b.to.gx);
    return minA < maxB && minB < maxA;
  } else {
    if (a.from.gx !== b.from.gx) return false;
    const minA = Math.min(a.from.gy, a.to.gy);
    const maxA = Math.max(a.from.gy, a.to.gy);
    const minB = Math.min(b.from.gy, b.to.gy);
    const maxB = Math.max(b.from.gy, b.to.gy);
    return minA < maxB && minB < maxA;
  }
}

/** Build RouteSegment array from an ordered list of grid points. */
export function buildSegments(gridPath: GridPoint[]): RouteSegment[] {
  if (gridPath.length < 2) return [];
  const segments: RouteSegment[] = [];

  let segStart = gridPath[0]!;
  let prevAxis: 'h' | 'v' | null = null;

  for (let i = 1; i < gridPath.length; i++) {
    const prev = gridPath[i - 1]!;
    const curr = gridPath[i]!;
    const axis: 'h' | 'v' = prev.gx !== curr.gx ? 'h' : 'v';

    if (prevAxis !== null && axis !== prevAxis) {
      // Direction changed - emit segment from segStart to prev
      segments.push({ from: segStart, to: prev, axis: prevAxis });
      segStart = prev;
    }
    prevAxis = axis;

    if (i === gridPath.length - 1) {
      segments.push({ from: segStart, to: curr, axis });
    }
  }

  return segments;
}
