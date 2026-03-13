/**
 * Minimum node spacing enforcement — pushes overlapping nodes apart.
 */
import { resolveOptions } from './types.js';
import { snapToGrid } from './grid.js';
/** Maximum iterations for the spacing algorithm. */
const MAX_ITERATIONS = 50;
/**
 * Adjust node positions so that no two nodes overlap or are closer than minNodeSpacing.
 * Uses a simple iterative spread (not full force-directed layout).
 */
export function enforceMinSpacing(nodeRects, options) {
    if (nodeRects.length <= 1)
        return [...nodeRects];
    const opts = resolveOptions(options);
    const rects = nodeRects.map(r => ({ ...r }));
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let anyMoved = false;
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i];
                const b = rects[j];
                // Check overlap + spacing
                const overlapX = (a.x + a.w + opts.minNodeSpacing) - b.x;
                const overlapY = (a.y + a.h + opts.minNodeSpacing) - b.y;
                const overlapXb = (b.x + b.w + opts.minNodeSpacing) - a.x;
                const overlapYb = (b.y + b.h + opts.minNodeSpacing) - a.y;
                const overlapH = overlapX > 0 && overlapXb > 0;
                const overlapV = overlapY > 0 && overlapYb > 0;
                if (!overlapH || !overlapV)
                    continue; // No overlap
                // Push apart on the axis of least overlap
                const minOverlapH = Math.min(overlapX, overlapXb);
                const minOverlapV = Math.min(overlapY, overlapYb);
                if (minOverlapH <= minOverlapV) {
                    const push = snapToGrid(minOverlapH / 2 + opts.gridSize, opts.gridSize);
                    if (a.x < b.x) {
                        a.x -= push;
                        b.x += push;
                    }
                    else {
                        a.x += push;
                        b.x -= push;
                    }
                }
                else {
                    const push = snapToGrid(minOverlapV / 2 + opts.gridSize, opts.gridSize);
                    if (a.y < b.y) {
                        a.y -= push;
                        b.y += push;
                    }
                    else {
                        a.y += push;
                        b.y -= push;
                    }
                }
                anyMoved = true;
            }
        }
        if (!anyMoved)
            break;
    }
    return rects;
}
//# sourceMappingURL=spacing.js.map