/**
 * Handle position computation — determines where edges connect on node sides.
 *
 * Key rule: edges MUST connect on grid lines.
 * - 1 edge on a side: centered on the side (snapped to grid)
 * - Odd n edges: one centered, then pairs at ±gridSize, ±2*gridSize, ...
 * - Even n edges: center is a gap, pairs at ±gridSize, ±2*gridSize, ...
 */
import { resolveOptions } from './types.js';
import { snapToGrid } from './grid.js';
/** Return the side of `rect` that faces `otherRect` most directly. */
function facingSide(rect, otherRect) {
    const srcCx = rect.x + rect.w / 2;
    const srcCy = rect.y + rect.h / 2;
    const tgtCx = otherRect.x + otherRect.w / 2;
    const tgtCy = otherRect.y + otherRect.h / 2;
    const dx = tgtCx - srcCx;
    const dy = tgtCy - srcCy;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? 'right' : 'left';
    }
    else {
        return dy >= 0 ? 'bottom' : 'top';
    }
}
/** Length of a side in pixels. */
function sideLength(rect, side) {
    return side === 'top' || side === 'bottom' ? rect.w : rect.h;
}
/**
 * Distribute `count` positions symmetrically around `sideCenter`, all on grid lines.
 *
 * - Odd count: one at center, pairs outward at ±gridSize intervals
 * - Even count: no position at center (gap), pairs outward at ±gridSize intervals
 *
 * Returns sorted array of pixel positions.
 */
export function distributeOnSide(count, sideCenter, gridSize) {
    if (count === 0)
        return [];
    const center = snapToGrid(sideCenter, gridSize);
    if (count % 2 === 1) {
        // Odd: center is occupied, pairs outward
        const positions = [center];
        for (let k = 1; k <= Math.floor(count / 2); k++) {
            positions.push(center - k * gridSize);
            positions.push(center + k * gridSize);
        }
        return positions.sort((a, b) => a - b);
    }
    else {
        // Even: center is a gap, pairs straddling center
        const positions = [];
        for (let k = 0; k < count / 2; k++) {
            positions.push(center - (k + 1) * gridSize);
            positions.push(center + (k + 1) * gridSize);
        }
        return positions.sort((a, b) => a - b);
    }
}
const SIDE_ORDER = ['top', 'right', 'bottom', 'left'];
/**
 * For a given node, compute individual handle positions for each connected edge.
 * Distributes handles on the facing side, spaced gridSize apart.
 * Wraps to adjacent sides if a side runs out of slots.
 */
export function computeHandlePositions(nodeId, nodeRect, connectedEdges, options) {
    if (connectedEdges.length === 0)
        return [];
    const opts = resolveOptions(options);
    // Group edges by preferred side
    const sideGroups = new Map();
    for (const e of connectedEdges) {
        const side = facingSide(nodeRect, e.otherNodeRect);
        if (!sideGroups.has(side))
            sideGroups.set(side, []);
        sideGroups.get(side).push(e);
    }
    const result = [];
    for (const [side, edges] of sideGroups) {
        const len = sideLength(nodeRect, side);
        const slots = Math.max(1, Math.floor(len / opts.gridSize) - 1);
        const needSlots = edges.length;
        const usableSlots = slots;
        // Distribute offsets evenly across side
        for (let i = 0; i < needSlots; i++) {
            let assignedSide = side;
            let offset;
            if (i < usableSlots) {
                // Fits on the preferred side
                const step = len / (Math.min(needSlots, usableSlots) + 1);
                offset = snapToGrid(step * (i + 1), opts.gridSize);
            }
            else {
                // Overflow: wrap to adjacent sides
                const sideIdx = SIDE_ORDER.indexOf(side);
                const overflowIdx = i - usableSlots;
                const wrapSideIdx = (sideIdx + 1 + Math.floor(overflowIdx / 2) * (overflowIdx % 2 === 0 ? 1 : -1 + SIDE_ORDER.length)) % SIDE_ORDER.length;
                assignedSide = SIDE_ORDER[wrapSideIdx] ?? side;
                const wrapLen = sideLength(nodeRect, assignedSide);
                offset = snapToGrid(wrapLen / 2, opts.gridSize);
            }
            result.push({
                nodeId,
                edgeId: edges[i].edgeId,
                position: assignedSide,
                offset,
            });
        }
    }
    return result;
}
/**
 * Compute the actual pixel positions where an edge exits/enters nodes.
 * Uses direction logic to determine which side, then returns the center
 * of that side as the endpoint.
 *
 * @deprecated Use computeAllEndpoints for proper multi-edge distribution.
 */
export function computeEdgeEndpoints(sourceRect, targetRect, options) {
    const opts = resolveOptions(options);
    const srcCx = sourceRect.x + sourceRect.w / 2;
    const srcCy = sourceRect.y + sourceRect.h / 2;
    const tgtCx = targetRect.x + targetRect.w / 2;
    const tgtCy = targetRect.y + targetRect.h / 2;
    const dx = tgtCx - srcCx;
    const dy = tgtCy - srcCy;
    let sx, sy, tx, ty;
    // Source exit point
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx >= 0) {
            sx = snapToGrid(sourceRect.x + sourceRect.w, opts.gridSize);
            sy = snapToGrid(srcCy, opts.gridSize);
        }
        else {
            sx = snapToGrid(sourceRect.x, opts.gridSize);
            sy = snapToGrid(srcCy, opts.gridSize);
        }
    }
    else {
        if (dy >= 0) {
            sx = snapToGrid(srcCx, opts.gridSize);
            sy = snapToGrid(sourceRect.y + sourceRect.h, opts.gridSize);
        }
        else {
            sx = snapToGrid(srcCx, opts.gridSize);
            sy = snapToGrid(sourceRect.y, opts.gridSize);
        }
    }
    // Target entry point
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx >= 0) {
            tx = snapToGrid(targetRect.x, opts.gridSize);
            ty = snapToGrid(tgtCy, opts.gridSize);
        }
        else {
            tx = snapToGrid(targetRect.x + targetRect.w, opts.gridSize);
            ty = snapToGrid(tgtCy, opts.gridSize);
        }
    }
    else {
        if (dy >= 0) {
            tx = snapToGrid(tgtCx, opts.gridSize);
            ty = snapToGrid(targetRect.y, opts.gridSize);
        }
        else {
            tx = snapToGrid(tgtCx, opts.gridSize);
            ty = snapToGrid(targetRect.y + targetRect.h, opts.gridSize);
        }
    }
    return { sx, sy, tx, ty };
}
/**
 * Compute endpoints for ALL edges at once, distributing multiple edges on
 * the same node side symmetrically around center:
 *
 * - 1 edge: centered on the side
 * - 2 edges: straddling center (center is a gap)
 * - 3 edges: one centered, one on each side
 * - n edges: symmetric around center, all on grid lines
 *
 * Edges within a side group are sorted by the perpendicular position of
 * the other node so they don't cross unnecessarily near the node.
 */
export function computeAllEndpoints(edges, nodeRects, options) {
    const opts = resolveOptions(options);
    const sideGroups = new Map();
    for (const e of edges) {
        const srcRect = nodeRects.get(e.sourceId);
        const tgtRect = nodeRects.get(e.targetId);
        if (!srcRect || !tgtRect)
            continue;
        const srcSide = facingSide(srcRect, tgtRect);
        const tgtSide = facingSide(tgtRect, srcRect);
        const tgtCx = tgtRect.x + tgtRect.w / 2;
        const tgtCy = tgtRect.y + tgtRect.h / 2;
        const srcCx = srcRect.x + srcRect.w / 2;
        const srcCy = srcRect.y + srcRect.h / 2;
        // Source side: sort by target's perpendicular coordinate
        const srcKey = `${e.sourceId}:${srcSide}`;
        if (!sideGroups.has(srcKey))
            sideGroups.set(srcKey, []);
        sideGroups.get(srcKey).push({
            edgeId: e.id,
            role: 'source',
            sortKey: (srcSide === 'left' || srcSide === 'right') ? tgtCy : tgtCx,
        });
        // Target side: sort by source's perpendicular coordinate
        const tgtKey = `${e.targetId}:${tgtSide}`;
        if (!sideGroups.has(tgtKey))
            sideGroups.set(tgtKey, []);
        sideGroups.get(tgtKey).push({
            edgeId: e.id,
            role: 'target',
            sortKey: (tgtSide === 'left' || tgtSide === 'right') ? srcCy : srcCx,
        });
    }
    // Map: edgeId:role → {x, y}
    const positionMap = new Map();
    for (const [groupKey, entries] of sideGroups) {
        const sepIdx = groupKey.lastIndexOf(':');
        const nodeId = groupKey.slice(0, sepIdx);
        const side = groupKey.slice(sepIdx + 1);
        const rect = nodeRects.get(nodeId);
        if (!rect)
            continue;
        // Sort edges by perpendicular position of other node (natural visual order)
        entries.sort((a, b) => a.sortKey - b.sortKey);
        // Fixed coordinate (on the node border, snapped to grid)
        let fixedCoord;
        let sideCenter;
        switch (side) {
            case 'top':
                fixedCoord = snapToGrid(rect.y, opts.gridSize);
                sideCenter = rect.x + rect.w / 2;
                break;
            case 'bottom':
                fixedCoord = snapToGrid(rect.y + rect.h, opts.gridSize);
                sideCenter = rect.x + rect.w / 2;
                break;
            case 'left':
                fixedCoord = snapToGrid(rect.x, opts.gridSize);
                sideCenter = rect.y + rect.h / 2;
                break;
            case 'right':
                fixedCoord = snapToGrid(rect.x + rect.w, opts.gridSize);
                sideCenter = rect.y + rect.h / 2;
                break;
        }
        // Distribute positions symmetrically
        const positions = distributeOnSide(entries.length, sideCenter, opts.gridSize);
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const pos = positions[i];
            const key = `${entry.edgeId}:${entry.role}`;
            if (side === 'top' || side === 'bottom') {
                positionMap.set(key, { x: pos, y: fixedCoord });
            }
            else {
                positionMap.set(key, { x: fixedCoord, y: pos });
            }
        }
    }
    // Build result
    return edges.map(e => {
        const src = positionMap.get(`${e.id}:source`);
        const tgt = positionMap.get(`${e.id}:target`);
        return {
            id: e.id,
            sx: src?.x ?? 0,
            sy: src?.y ?? 0,
            tx: tgt?.x ?? 0,
            ty: tgt?.y ?? 0,
        };
    });
}
//# sourceMappingURL=handles.js.map