/**
 * Crossing detection — find points where edges cross at perpendicular axes.
 */
import { DEFAULT_ROUTER_OPTIONS } from './types.js';
import { fromGrid } from './grid.js';
/**
 * Find all grid-pixel positions where segments from edge A cross segments from edge B
 * at perpendicular axes (H crosses V or V crosses H).
 */
export function findCrossings(segmentsA, segmentsB, gridSize = DEFAULT_ROUTER_OPTIONS.gridSize) {
    const crossings = [];
    for (const a of segmentsA) {
        for (const b of segmentsB) {
            if (a.axis === b.axis)
                continue; // Parallel - no crossing
            // One is H, one is V
            const h = a.axis === 'h' ? a : b;
            const v = a.axis === 'v' ? a : b;
            // H segment: fixed gy, gx range [minHx, maxHx]
            const hY = h.from.gy;
            const minHx = Math.min(h.from.gx, h.to.gx);
            const maxHx = Math.max(h.from.gx, h.to.gx);
            // V segment: fixed gx, gy range [minVy, maxVy]
            const vX = v.from.gx;
            const minVy = Math.min(v.from.gy, v.to.gy);
            const maxVy = Math.max(v.from.gy, v.to.gy);
            // Crossing exists if vX is within H range AND hY is within V range
            if (vX > minHx && vX < maxHx && hY > minVy && hY < maxVy) {
                const px = fromGrid(vX, hY, gridSize);
                // Crossing is on whichever segment is B (the later edge, drawn on top)
                crossings.push({ x: px.x, y: px.y, axis: b.axis });
            }
        }
    }
    return crossings;
}
//# sourceMappingURL=crossings.js.map