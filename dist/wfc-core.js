/**
 * WFC Core — Wave Function Collapse solver for grid-based edge routing.
 *
 * Tile-based WFC where each cell holds a superposition of possible tile types.
 * Observation collapses the lowest-entropy cell; propagation removes
 * incompatible tiles from neighbours.
 */
export const ROUTING_TILES = ['empty', 'h', 'v', 'ne', 'nw', 'se', 'sw', 'cross'];
/** Which directions each tile connects to. */
export const TILE_CONNECTIONS = {
    empty: new Set(),
    h: new Set(['left', 'right']),
    v: new Set(['up', 'down']),
    ne: new Set(['down', 'right']), // comes from below, exits right (or reverse)
    nw: new Set(['down', 'left']),
    se: new Set(['up', 'right']), // comes from above, exits right
    sw: new Set(['up', 'left']),
    cross: new Set(['up', 'down', 'left', 'right']),
    node: new Set(),
    blocked: new Set(),
    conn: new Set(['up', 'down', 'left', 'right']), // constrained later per-side
};
/** Opposite direction. */
export const OPPOSITE = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
};
/** Direction offsets: [dcol, drow]. */
export const DIR_OFFSET = {
    right: [1, 0],
    left: [-1, 0],
    down: [0, 1],
    up: [0, -1],
};
export const ALL_DIRS = ['up', 'down', 'left', 'right'];
export function createWfcGrid(cols, rows) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                options: new Set(ROUTING_TILES),
                collapsed: null,
                edgeId: 0,
            });
        }
        cells.push(row);
    }
    return { cols, rows, cells };
}
export function getWfcCell(grid, col, row) {
    if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols)
        return null;
    return grid.cells[row][col];
}
// ---------------------------------------------------------------------------
// Collapse a cell to a specific tile
// ---------------------------------------------------------------------------
export function collapseCell(grid, col, row, tile, edgeId = 0) {
    const cell = getWfcCell(grid, col, row);
    if (!cell)
        return;
    cell.options = new Set([tile]);
    cell.collapsed = tile;
    cell.edgeId = edgeId;
}
// ---------------------------------------------------------------------------
// Entropy — number of remaining options (lower = more constrained)
// ---------------------------------------------------------------------------
export function entropy(cell) {
    if (cell.collapsed !== null)
        return Infinity; // already done
    return cell.options.size;
}
/** Find the uncollapsed cell with lowest entropy. Returns null if all collapsed or contradiction. */
export function findLowestEntropy(grid) {
    let best = null;
    let bestEntropy = Infinity;
    for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
            const cell = grid.cells[r][c];
            if (cell.collapsed !== null)
                continue;
            const e = cell.options.size;
            if (e === 0)
                return null; // contradiction
            if (e < bestEntropy) {
                bestEntropy = e;
                best = { col: c, row: r };
            }
        }
    }
    return best;
}
// ---------------------------------------------------------------------------
// Constraint propagation
// ---------------------------------------------------------------------------
/**
 * Check if tile `t` at position (col,row) is compatible with neighbour in direction `dir`.
 * A tile is compatible if:
 * - It connects in `dir` AND the neighbour has at least one option connecting back
 * - OR it doesn't connect in `dir` AND the neighbour has at least one option not connecting back
 */
function tileCompatibleWithNeighbour(tile, dir, neighbour) {
    const connects = TILE_CONNECTIONS[tile].has(dir);
    const oppDir = OPPOSITE[dir];
    if (connects) {
        // We connect → neighbour must have at least one option that connects back
        for (const nTile of neighbour.options) {
            if (TILE_CONNECTIONS[nTile].has(oppDir))
                return true;
        }
        return false;
    }
    else {
        // We don't connect → neighbour must have at least one option that doesn't connect back
        for (const nTile of neighbour.options) {
            if (!TILE_CONNECTIONS[nTile].has(oppDir))
                return true;
        }
        return false;
    }
}
/**
 * Propagate constraints from a changed cell outward (BFS).
 * Returns false if a contradiction is found.
 */
export function propagate(grid, startCol, startRow) {
    const queue = [[startCol, startRow]];
    const visited = new Set();
    while (queue.length > 0) {
        const [col, row] = queue.shift();
        const key = `${col}:${row}`;
        if (visited.has(key))
            continue;
        visited.add(key);
        const cell = grid.cells[row][col];
        for (const dir of ALL_DIRS) {
            const [dc, dr] = DIR_OFFSET[dir];
            const nc = col + dc;
            const nr = row + dr;
            const neighbour = getWfcCell(grid, nc, nr);
            if (!neighbour || neighbour.collapsed !== null)
                continue;
            let changed = false;
            const toRemove = [];
            for (const nTile of neighbour.options) {
                // Check: is nTile still valid given current cell's options?
                const oppDir = OPPOSITE[dir];
                const nConnects = TILE_CONNECTIONS[nTile].has(oppDir);
                if (nConnects) {
                    // nTile connects toward us → we must have at least one option connecting toward neighbour
                    let anyMatch = false;
                    for (const ourTile of cell.options) {
                        if (TILE_CONNECTIONS[ourTile].has(dir)) {
                            anyMatch = true;
                            break;
                        }
                    }
                    if (!anyMatch)
                        toRemove.push(nTile);
                }
                else {
                    // nTile doesn't connect toward us → we must have at least one option NOT connecting toward neighbour
                    let anyMatch = false;
                    for (const ourTile of cell.options) {
                        if (!TILE_CONNECTIONS[ourTile].has(dir)) {
                            anyMatch = true;
                            break;
                        }
                    }
                    if (!anyMatch)
                        toRemove.push(nTile);
                }
            }
            for (const t of toRemove) {
                neighbour.options.delete(t);
                changed = true;
            }
            if (neighbour.options.size === 0)
                return false; // contradiction
            // Auto-collapse if only one option left
            if (neighbour.options.size === 1 && neighbour.collapsed === null) {
                const autoTile = [...neighbour.options][0];
                neighbour.collapsed = autoTile;
                // Stray routing tiles without edge ownership → force to empty
                if (neighbour.edgeId === 0 && autoTile !== 'empty' && autoTile !== 'node' && autoTile !== 'blocked' && autoTile !== 'conn') {
                    neighbour.collapsed = 'empty';
                    neighbour.options = new Set(['empty']);
                }
            }
            if (changed) {
                queue.push([nc, nr]);
            }
        }
    }
    return true;
}
// ---------------------------------------------------------------------------
// Observe — collapse lowest-entropy cell (weighted random)
// ---------------------------------------------------------------------------
/**
 * Observe one cell: find lowest entropy, collapse it, propagate.
 * Returns false if done or contradiction.
 */
export function observe(grid, rng = Math.random) {
    const target = findLowestEntropy(grid);
    if (!target)
        return false;
    const cell = grid.cells[target.row][target.col];
    const options = [...cell.options];
    // Weighted selection: prefer 'empty' to avoid unnecessary routing
    const weights = options.map(t => t === 'empty' ? 3 : 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * totalWeight;
    let chosen = options[0];
    for (let i = 0; i < options.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
            chosen = options[i];
            break;
        }
    }
    collapseCell(grid, target.col, target.row, chosen);
    return propagate(grid, target.col, target.row);
}
// ---------------------------------------------------------------------------
// Full solve — run observe until complete or contradiction
// ---------------------------------------------------------------------------
export function solve(grid, maxIterations = 100000, rng = Math.random) {
    for (let i = 0; i < maxIterations; i++) {
        if (!observe(grid, rng)) {
            // Check if fully collapsed or contradiction
            const target = findLowestEntropy(grid);
            return target === null; // null = all collapsed = success
        }
    }
    return false;
}
import { createGrid, setCell } from './grid2d.js';
export function wfcToGrid2D(wfc) {
    const grid = createGrid(wfc.cols, wfc.rows);
    for (let r = 0; r < wfc.rows; r++) {
        for (let c = 0; c < wfc.cols; c++) {
            const wCell = wfc.cells[r][c];
            const tile = wCell.collapsed ?? 'empty';
            let type;
            let id = wCell.edgeId;
            switch (tile) {
                case 'node':
                    type = 'node';
                    break;
                case 'blocked':
                    type = 'blocked';
                    break;
                case 'conn':
                    type = 'connection';
                    break;
                case 'cross':
                    type = 'jump';
                    break;
                case 'h':
                case 'v':
                case 'ne':
                case 'nw':
                case 'se':
                case 'sw':
                    // Routing tiles without an edge owner are stray — treat as empty
                    if (id === 0) {
                        type = 'empty';
                        break;
                    }
                    type = 'edge';
                    break;
                default:
                    type = 'empty';
                    id = 0;
            }
            setCell(grid, c, r, type, id);
        }
    }
    return grid;
}
//# sourceMappingURL=wfc-core.js.map