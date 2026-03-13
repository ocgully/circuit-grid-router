/**
 * Core types for the grid-based orthogonal edge router.
 *
 * All types are view-layer independent — no React, SVG, DOM, or Canvas references.
 * Outputs are coordinate-based: arrays of {x,y} points, side+offset pairs, etc.
 */
/** Default router option values. */
export const DEFAULT_ROUTER_OPTIONS = {
    gridSize: 8,
    humpRadius: 4,
    minNodeSpacing: 48,
    maxGridCells: 50000,
    occupiedPenalty: 100,
    turnPenalty: 3,
    nodeMargin: 3,
};
/** Resolve partial options against defaults. */
export function resolveOptions(opts) {
    return { ...DEFAULT_ROUTER_OPTIONS, ...opts };
}
//# sourceMappingURL=types.js.map