/**
 * Grid coordinate helpers — snap, convert between pixel and grid space.
 */

import type { GridPoint } from './types.js';
import { DEFAULT_ROUTER_OPTIONS } from './types.js';

/** Round a pixel value to the nearest grid multiple. Never returns -0. */
export function snapToGrid(v: number, gridSize: number = DEFAULT_ROUTER_OPTIONS.gridSize): number {
  const result = Math.round(v / gridSize) * gridSize;
  // Avoid -0 in JavaScript (Math.round(-0.375) * 8 === -0)
  return result === 0 ? 0 : result;
}

/** Convert pixel coordinates to grid coordinates. */
export function toGrid(px: number, py: number, gridSize: number = DEFAULT_ROUTER_OPTIONS.gridSize): GridPoint {
  return { gx: Math.round(px / gridSize), gy: Math.round(py / gridSize) };
}

/** Convert grid coordinates to pixel center of that cell. */
export function fromGrid(gx: number, gy: number, gridSize: number = DEFAULT_ROUTER_OPTIONS.gridSize): { x: number; y: number } {
  return { x: gx * gridSize, y: gy * gridSize };
}
