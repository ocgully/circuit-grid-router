/**
 * Grid2D — A true 2D cell array for orthogonal edge routing.
 *
 * Each cell has a type and an ID:
 * - 'empty'      (id=0)  — unoccupied, available for routing
 * - 'node'       (id=N)  — part of node N's bounding box
 * - 'blocked'    (id=0)  — corridor reservation, heavy routing penalty
 * - 'connection'  (id=N)  — connection point adjacent to node N
 * - 'edge'       (id=E)  — edge E passes through this cell
 * - 'jump'       (id=E)  — edge E crosses another edge here (perpendicular hop)
 *
 * Rules:
 * - Edges travel ONLY on grid cells (no cutting through cells)
 * - Edges cannot pass through node cells
 * - Edges cannot overlap other edges (same cell, same direction)
 * - Edges cannot pass through connection cells (except their own endpoints)
 * - Connection points are node-adjacent (within 1 cell of the node)
 * - Connection points are center-biased:
 *   - Odd count:  center occupied, pairs outward with 1 empty gap
 *   - Even count: center is empty gap, pairs outward
 * - Blocked cells are heavily penalized but passable (corridor reservations)
 * - Edges require empty cells on perpendicular sides (spacing)
 * - Edges can jump other edges perpendicularly
 */
export type CellType = 'empty' | 'node' | 'blocked' | 'connection' | 'edge' | 'jump';
export interface GridCell {
    type: CellType;
    id: number;
}
export interface Grid2D {
    cols: number;
    rows: number;
    cells: GridCell[][];
}
export interface NodeDef {
    id: number;
    label: string;
    col: number;
    row: number;
    w: number;
    h: number;
}
export interface EdgeDef {
    id: number;
    source: number;
    target: number;
}
export interface ConnectionPoint {
    nodeId: number;
    edgeId: number;
    col: number;
    row: number;
    side: 'top' | 'bottom' | 'left' | 'right';
    /** The ID of the OTHER node this connection links to. */
    otherNodeId: number;
    /** The label of the OTHER node this connection links to. */
    otherNodeLabel: string;
}
/** Cached path for a single edge (used by incremental routing). */
export interface EdgePath {
    edgeId: number;
    cells: {
        col: number;
        row: number;
    }[];
    /** Set of "col:row" keys for fast intersection testing. */
    cellSet: Set<string>;
}
export interface ScenarioResult {
    grid: Grid2D;
    nodes: NodeDef[];
    edges: EdgeDef[];
    connections: ConnectionPoint[];
    /** Routed paths per edge (edgeId → path). Present when routing was performed. */
    paths?: Map<number, EdgePath>;
    /** Number of negotiation rounds (rip-up and reroute cycles). */
    negotiations?: number;
    /** Time in milliseconds to generate the routing. */
    timeMs?: number;
}
export declare function createGrid(cols: number, rows: number): Grid2D;
export declare function getCell(grid: Grid2D, col: number, row: number): GridCell | null;
export declare function setCell(grid: Grid2D, col: number, row: number, type: CellType, id: number): void;
/**
 * Distribute `count` connection points along a side.
 * - Odd: center occupied, pairs outward with 1-cell gaps
 * - Even: center is gap, pairs outward
 *
 * Returns sorted positions in grid coordinates.
 */
export declare function distributeConnections(sideStart: number, sideLength: number, count: number): number[];
/**
 * Build a Grid2D from node and edge definitions.
 *
 * 1. Compute grid dimensions from node positions (with padding)
 * 2. Place nodes on the grid
 * 3. Compute and place connection points (center-biased)
 * 4. Block corridor cells around connections
 * 5. Route edges with retry (rotate order if edges need relaxed fallback)
 */
export declare function buildScenario(nodes: NodeDef[], edges: EdgeDef[], padding?: number): ScenarioResult;
//# sourceMappingURL=grid2d.d.ts.map