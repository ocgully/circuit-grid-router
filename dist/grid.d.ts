/**
 * Grid coordinate helpers — snap, convert between pixel and grid space.
 */
import type { GridPoint } from './types.js';
/** Round a pixel value to the nearest grid multiple. Never returns -0. */
export declare function snapToGrid(v: number, gridSize?: number): number;
/** Convert pixel coordinates to grid coordinates. */
export declare function toGrid(px: number, py: number, gridSize?: number): GridPoint;
/** Convert grid coordinates to pixel center of that cell. */
export declare function fromGrid(gx: number, gy: number, gridSize?: number): {
    x: number;
    y: number;
};
//# sourceMappingURL=grid.d.ts.map