/**
 * Grid coordinate helpers — snap, convert between pixel and grid space.
 */
import { DEFAULT_ROUTER_OPTIONS } from './types.js';
/** Round a pixel value to the nearest grid multiple. Never returns -0. */
export function snapToGrid(v, gridSize = DEFAULT_ROUTER_OPTIONS.gridSize) {
    const result = Math.round(v / gridSize) * gridSize;
    // Avoid -0 in JavaScript (Math.round(-0.375) * 8 === -0)
    return result === 0 ? 0 : result;
}
/** Convert pixel coordinates to grid coordinates. */
export function toGrid(px, py, gridSize = DEFAULT_ROUTER_OPTIONS.gridSize) {
    return { gx: Math.round(px / gridSize), gy: Math.round(py / gridSize) };
}
/** Convert grid coordinates to pixel center of that cell. */
export function fromGrid(gx, gy, gridSize = DEFAULT_ROUTER_OPTIONS.gridSize) {
    return { x: gx * gridSize, y: gy * gridSize };
}
//# sourceMappingURL=grid.js.map