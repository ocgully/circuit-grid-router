/**
 * WFC Core — Wave Function Collapse solver for grid-based edge routing.
 *
 * Tile-based WFC where each cell holds a superposition of possible tile types.
 * Observation collapses the lowest-entropy cell; propagation removes
 * incompatible tiles from neighbours.
 */
/**
 * Each tile encodes which directions it connects:
 * - 'empty'    — no connections
 * - 'h'        — horizontal straight (left↔right)
 * - 'v'        — vertical straight (up↔down)
 * - 'ne'       — turn connecting south↔east (╚)
 * - 'nw'       — turn connecting south↔west (╝)
 * - 'se'       — turn connecting north↔east (╔)
 * - 'sw'       — turn connecting north↔west (╗)
 * - 'cross'    — perpendicular crossing / jump (all 4 dirs)
 * - 'node'     — pre-collapsed node bounding box
 * - 'blocked'  — pre-collapsed corridor reservation
 * - 'conn'     — pre-collapsed connection point
 */
export type TileType = 'empty' | 'h' | 'v' | 'ne' | 'nw' | 'se' | 'sw' | 'cross' | 'node' | 'blocked' | 'conn';
export declare const ROUTING_TILES: TileType[];
/** Direction labels. */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** Which directions each tile connects to. */
export declare const TILE_CONNECTIONS: Record<TileType, Set<Dir>>;
/** Opposite direction. */
export declare const OPPOSITE: Record<Dir, Dir>;
/** Direction offsets: [dcol, drow]. */
export declare const DIR_OFFSET: Record<Dir, [number, number]>;
export declare const ALL_DIRS: Dir[];
export interface WfcCell {
    /** Remaining possible tiles (superposition). Empty = contradiction. */
    options: Set<TileType>;
    /** Once collapsed, the chosen tile. null while in superposition. */
    collapsed: TileType | null;
    /** Edge ID this cell is assigned to (0 = none/multiple). */
    edgeId: number;
}
export interface WfcGrid {
    cols: number;
    rows: number;
    cells: WfcCell[][];
}
export declare function createWfcGrid(cols: number, rows: number): WfcGrid;
export declare function getWfcCell(grid: WfcGrid, col: number, row: number): WfcCell | null;
export declare function collapseCell(grid: WfcGrid, col: number, row: number, tile: TileType, edgeId?: number): void;
export declare function entropy(cell: WfcCell): number;
/** Find the uncollapsed cell with lowest entropy. Returns null if all collapsed or contradiction. */
export declare function findLowestEntropy(grid: WfcGrid): {
    col: number;
    row: number;
} | null;
/**
 * Propagate constraints from a changed cell outward (BFS).
 * Returns false if a contradiction is found.
 */
export declare function propagate(grid: WfcGrid, startCol: number, startRow: number): boolean;
/**
 * Observe one cell: find lowest entropy, collapse it, propagate.
 * Returns false if done or contradiction.
 */
export declare function observe(grid: WfcGrid, rng?: () => number): boolean;
export declare function solve(grid: WfcGrid, maxIterations?: number, rng?: () => number): boolean;
import type { Grid2D } from './grid2d.js';
export declare function wfcToGrid2D(wfc: WfcGrid): Grid2D;
//# sourceMappingURL=wfc-core.d.ts.map