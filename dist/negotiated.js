/**
 * Negotiated Congestion Router — PathFinder-inspired edge routing.
 *
 * Instead of sequential A* with round-robin retry, this routes ALL edges
 * simultaneously, allowing overlaps, then iteratively rips up and reroutes
 * with escalating congestion costs until no cell is shared.
 *
 * Algorithm (based on PathFinder / Negotiated Congestion):
 * 1. Route all edges greedily (overlaps allowed, low penalties)
 * 2. Detect congested cells (shared by multiple edges in same direction)
 * 3. Accumulate history cost on congested cells
 * 4. Rip up ALL edges, re-route with updated costs
 * 5. Repeat until convergence (no sharing) or max iterations
 *
 * Cost function per cell:
 *   cost(c) = (base_cost + history_cost(c)) * present_congestion(c)
 *
 * This reuses the same grid model, connection computation, corridor blocking,
 * and direction tracking from grid2d.ts.
 */
import { createGrid, getCell, setCell, distributeConnections, } from './grid2d.js';
// ---------------------------------------------------------------------------
// Infrastructure (mirrored from grid2d.ts — same logic)
// ---------------------------------------------------------------------------
function dirKey(col, row) { return `${col}:${row}`; }
function createDirTracker() { return { h: new Set(), v: new Set(), d: new Set() }; }
function placeNode(grid, node) {
    for (let r = node.row; r < node.row + node.h; r++) {
        for (let c = node.col; c < node.col + node.w; c++) {
            setCell(grid, c, r, 'node', node.id);
        }
    }
}
function facingSide(a, b) {
    const dx = (b.col + b.w / 2) - (a.col + a.w / 2);
    const dy = (b.row + b.h / 2) - (a.row + a.h / 2);
    if (Math.abs(dx) >= Math.abs(dy))
        return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'bottom' : 'top';
}
function sideAxis(side) {
    return (side === 'left' || side === 'right') ? 'h' : 'v';
}
function computeConnections(nodes, edges) {
    const nodeMap = new Map();
    for (const n of nodes)
        nodeMap.set(n.id, n);
    const sideGroups = new Map();
    for (const e of edges) {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt)
            continue;
        const srcSide = facingSide(src, tgt);
        const tgtSide = facingSide(tgt, src);
        const srcKey = `${e.source}:${srcSide}`;
        if (!sideGroups.has(srcKey))
            sideGroups.set(srcKey, []);
        sideGroups.get(srcKey).push({ edgeId: e.id, otherNode: tgt, otherNodeId: e.target });
        const tgtKey = `${e.target}:${tgtSide}`;
        if (!sideGroups.has(tgtKey))
            sideGroups.set(tgtKey, []);
        sideGroups.get(tgtKey).push({ edgeId: e.id, otherNode: src, otherNodeId: e.source });
    }
    const connections = [];
    for (const [key, entries] of sideGroups) {
        const colonIdx = key.lastIndexOf(':');
        const nodeId = parseInt(key.slice(0, colonIdx));
        const side = key.slice(colonIdx + 1);
        const node = nodeMap.get(nodeId);
        if (side === 'left' || side === 'right') {
            entries.sort((a, b) => (a.otherNode.row + a.otherNode.h / 2) - (b.otherNode.row + b.otherNode.h / 2));
        }
        else {
            entries.sort((a, b) => (a.otherNode.col + a.otherNode.w / 2) - (b.otherNode.col + b.otherNode.w / 2));
        }
        let fixedCoord, perpStart, perpLen;
        switch (side) {
            case 'right':
                fixedCoord = node.col + node.w;
                perpStart = node.row;
                perpLen = node.h;
                break;
            case 'left':
                fixedCoord = node.col - 1;
                perpStart = node.row;
                perpLen = node.h;
                break;
            case 'bottom':
                fixedCoord = node.row + node.h;
                perpStart = node.col;
                perpLen = node.w;
                break;
            case 'top':
                fixedCoord = node.row - 1;
                perpStart = node.col;
                perpLen = node.w;
                break;
        }
        const positions = distributeConnections(perpStart, perpLen, entries.length);
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const pos = positions[i];
            const otherLabel = nodeMap.get(entry.otherNodeId)?.label ?? '';
            if (side === 'left' || side === 'right') {
                connections.push({ nodeId, edgeId: entry.edgeId, col: fixedCoord, row: pos, side, otherNodeId: entry.otherNodeId, otherNodeLabel: otherLabel });
            }
            else {
                connections.push({ nodeId, edgeId: entry.edgeId, col: pos, row: fixedCoord, side, otherNodeId: entry.otherNodeId, otherNodeLabel: otherLabel });
            }
        }
    }
    return connections;
}
function blockConnectionCorridors(grid, connections) {
    const connSet = new Set();
    for (const cp of connections)
        connSet.add(`${cp.row}:${cp.col}`);
    for (const cp of connections) {
        const cells = [];
        if (cp.side === 'left' || cp.side === 'right') {
            const nodeDc = cp.side === 'right' ? -1 : 1;
            const outDc = -nodeDc;
            for (const dc of [nodeDc, 0, outDc]) {
                cells.push([cp.col + dc, cp.row - 1]);
                cells.push([cp.col + dc, cp.row + 1]);
            }
        }
        else {
            const nodeDr = cp.side === 'bottom' ? -1 : 1;
            const outDr = -nodeDr;
            for (const dr of [nodeDr, 0, outDr]) {
                cells.push([cp.col - 1, cp.row + dr]);
                cells.push([cp.col + 1, cp.row + dr]);
            }
        }
        for (const [bc, br] of cells) {
            if (connSet.has(`${br}:${bc}`))
                continue;
            const cell = getCell(grid, bc, br);
            if (!cell || cell.type === 'node' || cell.type === 'connection')
                continue;
            setCell(grid, bc, br, 'blocked', 0);
        }
    }
}
function congestionKey(col, row, axis) {
    return `${col}:${row}:${axis}`;
}
function createCongestion() {
    return { history: new Map(), present: new Map() };
}
function resetPresent(cong) {
    cong.present.clear();
}
function recordUsage(cong, col, row, axis, edgeId) {
    const k = congestionKey(col, row, axis);
    if (!cong.present.has(k))
        cong.present.set(k, new Set());
    cong.present.get(k).add(edgeId);
}
/** Count overused cells (used by >1 edge in same axis). */
function countOverused(cong) {
    let count = 0;
    for (const users of cong.present.values()) {
        if (users.size > 1)
            count++;
    }
    return count;
}
/** Update history costs: bump every overused cell. */
function updateHistory(cong, increment) {
    for (const [k, users] of cong.present) {
        if (users.size > 1) {
            cong.history.set(k, (cong.history.get(k) ?? 0) + increment);
        }
    }
}
/** Get present congestion multiplier for a cell+axis. */
function presentFactor(cong, col, row, axis, iteration) {
    const k = congestionKey(col, row, axis);
    const users = cong.present.get(k);
    if (!users || users.size <= 1)
        return 1;
    // Escalate with iteration: 1 + overuse * escalation^iteration
    const escalation = Math.min(Math.pow(1.3, iteration), 8);
    return 1 + (users.size - 1) * escalation;
}
/** Get history cost for a cell+axis. */
function historyCost(cong, col, row, axis) {
    return cong.history.get(congestionKey(col, row, axis)) ?? 0;
}
// ---------------------------------------------------------------------------
// Negotiated A* — routes one edge with congestion-aware costs
// ---------------------------------------------------------------------------
const DIRS = [
    { dc: 1, dr: 0 },
    { dc: -1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 0, dr: -1 },
    { dc: 1, dr: 1 },
    { dc: -1, dr: 1 },
    { dc: 1, dr: -1 },
    { dc: -1, dr: -1 },
];
const SQRT2 = Math.SQRT2;
const BACKTRACK_PENALTY = 50;
const TURN_BASE_PENALTY = 4;
const TURN_IMBALANCE_FACTOR = 0.5;
const JUMP_PENALTY = 6;
const DIAGONAL_EXTRA_COST = 1.4;
const DIAGONAL_ZIGZAG_PENALTY = 8;
const HISTORY_INCREMENT = 4;
/**
 * Negotiated A*: like the standard A* but uses congestion costs instead of
 * hard-blocking overlaps. Overlaps are allowed but expensive.
 */
function negotiatedAstar(grid, sc, sr, sourceSide, tc, tr, targetSide, dirs, cong, iteration, edgeId) {
    const stateKey = (c, r, d) => {
        const di = d === null ? 0 : d === 'h' ? 1 : d === 'v' ? 2 : 3;
        return r * grid.cols * 4 + c * 4 + di;
    };
    const heuristic = (c, r) => {
        const dx = Math.abs(c - tc);
        const dy = Math.abs(r - tr);
        return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };
    const totalDist = Math.max(Math.abs(tc - sc), Math.abs(tr - sr));
    const halfDist = totalDist / 2;
    const requiredSourceAxis = sideAxis(sourceSide);
    const requiredTargetAxis = sideAxis(targetSide);
    const open = [];
    const gCosts = new Map();
    const closed = new Set();
    const start = { col: sc, row: sr, g: 0, f: heuristic(sc, sr), dir: null, dc: 0, dr: 0, parent: null };
    open.push(start);
    gCosts.set(stateKey(sc, sr, null), 0);
    let found = null;
    let iters = 0;
    const MAX_ITERS = grid.cols * grid.rows * 8;
    while (open.length > 0 && iters < MAX_ITERS) {
        iters++;
        open.sort((a, b) => a.f - b.f);
        const current = open.shift();
        const ci = stateKey(current.col, current.row, current.dir);
        if (closed.has(ci))
            continue;
        closed.add(ci);
        if (current.col === tc && current.row === tr) {
            found = current;
            break;
        }
        for (const { dc, dr } of DIRS) {
            const nc = current.col + dc;
            const nr = current.row + dr;
            if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows)
                continue;
            const isDiag = dc !== 0 && dr !== 0;
            const axis = isDiag ? 'd' : (dc !== 0 ? 'h' : 'v');
            const ni = stateKey(nc, nr, axis);
            if (closed.has(ni))
                continue;
            const cell = grid.cells[nr][nc];
            // --- Hard blocks (always enforced) ---
            if (cell.type === 'node' || cell.type === 'blocked')
                continue;
            // Diagonal: don't cut through node/blocked corners
            if (isDiag) {
                const adj1 = getCell(grid, nc, current.row);
                const adj2 = getCell(grid, current.col, nr);
                if (adj1 && (adj1.type === 'node' || adj1.type === 'blocked'))
                    continue;
                if (adj2 && (adj2.type === 'node' || adj2.type === 'blocked'))
                    continue;
            }
            // Head-on departure (no diagonal)
            if (current.col === sc && current.row === sr && current.dir === null) {
                if (axis !== requiredSourceAxis)
                    continue;
            }
            // Head-on arrival (no diagonal)
            if (nc === tc && nr === tr) {
                if (axis !== requiredTargetAxis)
                    continue;
            }
            // Connection cells: only our endpoints
            if (cell.type === 'connection') {
                const isOurs = (nc === sc && nr === sr) || (nc === tc && nr === tr);
                if (!isOurs)
                    continue;
            }
            // --- Cost calculation ---
            let baseCost = isDiag ? SQRT2 + DIAGONAL_EXTRA_COST : 1;
            // Diagonal zigzag penalty: changing diagonal direction
            if (isDiag && current.dir === 'd') {
                if (current.dc !== dc || current.dr !== dr) {
                    baseCost += DIAGONAL_ZIGZAG_PENALTY;
                }
            }
            // Backtrack penalty (Chebyshev distance)
            const currentDist = Math.max(Math.abs(current.col - tc), Math.abs(current.row - tr));
            const nextDist = Math.max(Math.abs(nc - tc), Math.abs(nr - tr));
            if (nextDist > currentDist)
                baseCost += BACKTRACK_PENALTY;
            // Turn penalty — midpoint biased
            if (current.dir !== null && current.dir !== axis) {
                const distFromSource = Math.max(Math.abs(current.col - sc), Math.abs(current.row - sr));
                const imbalance = Math.abs(distFromSource - halfDist);
                baseCost += TURN_BASE_PENALTY + Math.floor(imbalance * TURN_IMBALANCE_FACTOR);
            }
            // Jump penalty — crossing existing edge
            if (cell.type === 'edge' || cell.type === 'jump') {
                const k = dirKey(nc, nr);
                const sameDir = (axis === 'h' && dirs.h.has(k)) || (axis === 'v' && dirs.v.has(k)) || (axis === 'd' && dirs.d.has(k));
                if (sameDir) {
                    baseCost += 50 + historyCost(cong, nc, nr, axis);
                }
                else if (dirs.h.has(k) || dirs.v.has(k) || dirs.d.has(k)) {
                    baseCost += JUMP_PENALTY;
                }
                else {
                    baseCost += 50;
                }
            }
            // Negotiated cost: (base + history) * present_congestion
            const hCost = historyCost(cong, nc, nr, axis);
            const pFactor = presentFactor(cong, nc, nr, axis, iteration);
            const totalCost = (baseCost + hCost) * pFactor;
            const ng = current.g + totalCost;
            const prevG = gCosts.get(ni);
            if (prevG === undefined || ng < prevG) {
                gCosts.set(ni, ng);
                open.push({ col: nc, row: nr, g: ng, f: ng + heuristic(nc, nr), dir: axis, dc, dr, parent: current });
            }
        }
    }
    if (!found)
        return null;
    const path = [];
    let node = found;
    while (node) {
        path.unshift({ col: node.col, row: node.row });
        node = node.parent;
    }
    return path;
}
// ---------------------------------------------------------------------------
// Path placement with direction + congestion tracking
// ---------------------------------------------------------------------------
function placeEdgePath(grid, edgeId, path, dirs, cong) {
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        let dir = null;
        if (i > 0) {
            const prev = path[i - 1];
            const dcol = prev.col !== p.col;
            const drow = prev.row !== p.row;
            dir = (dcol && drow) ? 'd' : dcol ? 'h' : 'v';
        }
        else if (i < path.length - 1) {
            const next = path[i + 1];
            const dcol = next.col !== p.col;
            const drow = next.row !== p.row;
            dir = (dcol && drow) ? 'd' : dcol ? 'h' : 'v';
        }
        if (dir) {
            (dir === 'h' ? dirs.h : dir === 'v' ? dirs.v : dirs.d).add(dirKey(p.col, p.row));
            recordUsage(cong, p.col, p.row, dir, edgeId);
        }
        const cell = getCell(grid, p.col, p.row);
        if (!cell)
            continue;
        if (cell.type === 'edge' || cell.type === 'jump') {
            setCell(grid, p.col, p.row, 'jump', edgeId);
        }
        else if (cell.type === 'connection') {
            // Keep as connection
        }
        else {
            setCell(grid, p.col, p.row, 'edge', edgeId);
        }
    }
}
function clearEdgeCells(grid, dirs) {
    for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
            const cell = grid.cells[r][c];
            if (cell.type === 'edge' || cell.type === 'jump') {
                grid.cells[r][c] = { type: 'empty', id: 0 };
            }
        }
    }
    dirs.h.clear();
    dirs.v.clear();
    dirs.d.clear();
}
// ---------------------------------------------------------------------------
// Public API — Negotiated Congestion Router
// ---------------------------------------------------------------------------
const MAX_NEGOTIATION_ITERATIONS = 20;
export function buildScenarioNegotiated(nodes, edges, padding = 2) {
    // 1. Compute grid size
    let maxCol = 0;
    let maxRow = 0;
    for (const n of nodes) {
        maxCol = Math.max(maxCol, n.col + n.w);
        maxRow = Math.max(maxRow, n.row + n.h);
    }
    const cols = maxCol + padding + 1;
    const rows = maxRow + padding + 1;
    const grid = createGrid(cols, rows);
    // 2. Place nodes
    for (const n of nodes)
        placeNode(grid, n);
    // 3. Connections
    const connections = computeConnections(nodes, edges);
    for (const cp of connections) {
        const cell = getCell(grid, cp.col, cp.row);
        if (cell && cell.type === 'empty') {
            setCell(grid, cp.col, cp.row, 'connection', cp.nodeId);
        }
    }
    // 4. Corridor blocking
    blockConnectionCorridors(grid, connections);
    // 5. Connection lookup
    const connByEdge = new Map();
    for (const e of edges)
        connByEdge.set(e.id, { src: null, tgt: null });
    for (const cp of connections) {
        const entry = connByEdge.get(cp.edgeId);
        if (!entry)
            continue;
        const edge = edges.find(ed => ed.id === cp.edgeId);
        if (!edge)
            continue;
        if (cp.nodeId === edge.source)
            entry.src = cp;
        else if (cp.nodeId === edge.target)
            entry.tgt = cp;
    }
    // 6. Negotiated routing loop
    const t0 = performance.now();
    const dirs = createDirTracker();
    const cong = createCongestion();
    let finalNegotiations = 1;
    for (let iteration = 0; iteration < MAX_NEGOTIATION_ITERATIONS; iteration++) {
        finalNegotiations = iteration + 1;
        // Clear previous routing
        clearEdgeCells(grid, dirs);
        resetPresent(cong);
        // Route ALL edges with current congestion costs
        for (const e of edges) {
            const ep = connByEdge.get(e.id);
            if (!ep?.src || !ep?.tgt)
                continue;
            const path = negotiatedAstar(grid, ep.src.col, ep.src.row, ep.src.side, ep.tgt.col, ep.tgt.row, ep.tgt.side, dirs, cong, iteration, e.id);
            if (path) {
                placeEdgePath(grid, e.id, path, dirs, cong);
            }
        }
        // Check convergence: no cell shared by >1 edge in same direction
        const overused = countOverused(cong);
        if (overused === 0)
            break;
        // Update history costs for overused cells
        updateHistory(cong, HISTORY_INCREMENT);
    }
    return { grid, nodes, edges, connections, negotiations: finalNegotiations, timeMs: performance.now() - t0 };
}
//# sourceMappingURL=negotiated.js.map