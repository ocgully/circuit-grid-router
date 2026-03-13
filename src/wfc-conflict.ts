/**
 * WFC Approach 2: Conflict Resolution
 *
 * Use the existing A* router (buildScenario) to get initial paths,
 * then detect conflicts (overlaps, spacing violations) and use WFC
 * to locally re-route conflicting segments.
 *
 * Strategy:
 * 1. Run standard A* routing via buildScenario
 * 2. Detect conflict zones (cells where rules are violated)
 * 3. Clear conflicting edge segments in those zones
 * 4. Use WFC to re-collapse the cleared zones with proper constraints
 * 5. Repeat until no conflicts or max iterations
 */

import type { NodeDef, EdgeDef, ConnectionPoint, ScenarioResult, Grid2D, CellType } from './grid2d.js';
import { buildScenario as buildScenarioAStar, getCell, setCell, createGrid } from './grid2d.js';
import {
  type WfcGrid, type WfcCell, type TileType, type Dir,
  createWfcGrid, collapseCell, getWfcCell, propagate, solve,
  TILE_CONNECTIONS, DIR_OFFSET, OPPOSITE, ALL_DIRS, ROUTING_TILES,
  wfcToGrid2D,
} from './wfc-core.js';

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

interface Conflict {
  col: number;
  row: number;
  type: 'overlap' | 'spacing' | 'corridor';
  edgeIds: number[];
}

/**
 * Detect parallel edge overlaps — cells where two edges share the same
 * direction on the same cell (not a valid perpendicular jump).
 */
function detectOverlaps(grid: Grid2D): Conflict[] {
  const conflicts: Conflict[] = [];
  const edgeCells = new Map<string, number[]>();

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      if (cell.type === 'edge' || cell.type === 'jump') {
        const key = `${c}:${r}`;
        if (!edgeCells.has(key)) edgeCells.set(key, []);
        edgeCells.get(key)!.push(cell.id);
      }
    }
  }

  // Jump cells are expected (perpendicular crossings), but look for
  // cells that appear to have edges in the same axis
  for (const [key, ids] of edgeCells) {
    if (ids.length > 1) {
      const [c, r] = key.split(':').map(Number) as [number, number];
      conflicts.push({ col: c, row: r, type: 'overlap', edgeIds: ids });
    }
  }

  return conflicts;
}

/**
 * Detect spacing violations — edge cells with adjacent parallel edges.
 */
function detectSpacingViolations(grid: Grid2D): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      if (cell.type !== 'edge') continue;

      // Check horizontal neighbours for parallel horizontal edges
      for (const [dc, dr] of [[0, -1], [0, 1]] as [number, number][]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nr < 0 || nr >= grid.rows || nc < 0 || nc >= grid.cols) continue;
        const nCell = grid.cells[nr]![nc]!;
        if (nCell.type === 'edge' && nCell.id !== cell.id) {
          conflicts.push({ col: c, row: r, type: 'spacing', edgeIds: [cell.id, nCell.id] });
        }
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Zone extraction — expand conflict cells into a re-route zone
// ---------------------------------------------------------------------------

function expandZone(
  conflicts: Conflict[],
  grid: Grid2D,
  margin: number = 2,
): Set<string> {
  const zone = new Set<string>();

  for (const c of conflicts) {
    for (let dr = -margin; dr <= margin; dr++) {
      for (let dc = -margin; dc <= margin; dc++) {
        const nc = c.col + dc;
        const nr = c.row + dr;
        if (nc >= 0 && nc < grid.cols && nr >= 0 && nr < grid.rows) {
          const cell = grid.cells[nr]![nc]!;
          // Only include edge/empty cells in the zone (not nodes/connections/blocked)
          if (cell.type === 'edge' || cell.type === 'jump' || cell.type === 'empty') {
            zone.add(`${nc}:${nr}`);
          }
        }
      }
    }
  }

  return zone;
}

// ---------------------------------------------------------------------------
// WFC local re-routing
// ---------------------------------------------------------------------------

/**
 * Convert Grid2D cell type to WFC tile type for boundary cells.
 */
function gridCellToWfcTile(cell: { type: CellType; id: number }): TileType {
  switch (cell.type) {
    case 'node': return 'node';
    case 'blocked': return 'blocked';
    case 'connection': return 'conn';
    case 'edge': return 'h'; // simplified — we'd need direction info
    case 'jump': return 'cross';
    default: return 'empty';
  }
}

/**
 * Re-route a conflict zone using WFC.
 * Clears edge cells in the zone, sets up boundary constraints,
 * and uses WFC to find valid tile assignments.
 */
function rerouteZone(grid: Grid2D, zone: Set<string>, conflictEdgeIds: Set<number>): boolean {
  // Create a mini WFC grid for the zone
  // For simplicity, operate on the full grid but only allow changes in the zone

  // Clear edge cells in the zone
  for (const key of zone) {
    const [c, r] = key.split(':').map(Number) as [number, number];
    const cell = grid.cells[r]![c]!;
    if (cell.type === 'edge' || cell.type === 'jump') {
      grid.cells[r]![c] = { type: 'empty', id: 0 };
    }
  }

  // Create WFC grid matching full grid dimensions
  const wfc = createWfcGrid(grid.cols, grid.rows);

  // Pre-collapse all cells outside the zone based on current grid state
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const key = `${c}:${r}`;
      const cell = grid.cells[r]![c]!;

      if (!zone.has(key)) {
        // Outside zone: collapse to current state
        const tile = gridCellToWfcTile(cell);
        collapseCell(wfc, c, r, tile, cell.id);
      }
      // Inside zone: leave in superposition (all routing tiles available)
    }
  }

  // Propagate from all pre-collapsed cells
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (wfc.cells[r]![c]!.collapsed !== null) {
        propagate(wfc, c, r);
      }
    }
  }

  // Solve the zone
  const success = solve(wfc, zone.size * 100);

  if (success) {
    // Apply WFC results back to grid for zone cells only
    for (const key of zone) {
      const [c, r] = key.split(':').map(Number) as [number, number];
      const wCell = wfc.cells[r]![c]!;
      const tile = wCell.collapsed ?? 'empty';

      let type: CellType = 'empty';
      let id = 0;

      switch (tile) {
        case 'h': case 'v':
        case 'ne': case 'nw': case 'se': case 'sw':
          type = 'edge';
          id = wCell.edgeId || 1; // TODO: proper edge ID assignment
          break;
        case 'cross':
          type = 'jump';
          id = wCell.edgeId || 1;
          break;
        default:
          type = 'empty';
          id = 0;
      }

      setCell(grid, c, r, type, id);
    }
  }

  return success;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildScenarioWfcConflict(nodes: NodeDef[], edges: EdgeDef[], padding = 2): ScenarioResult {
  // Step 1: Get initial A* routing
  const result = buildScenarioAStar(nodes, edges, padding);

  // Step 2: Detect conflicts
  const overlaps = detectOverlaps(result.grid);
  const spacingIssues = detectSpacingViolations(result.grid);
  const allConflicts = [...overlaps, ...spacingIssues];

  if (allConflicts.length === 0) {
    // No conflicts — A* result is clean
    return result;
  }

  // Step 3: Expand conflict zones
  const zone = expandZone(allConflicts, result.grid);
  const conflictEdgeIds = new Set<number>();
  for (const c of allConflicts) {
    for (const id of c.edgeIds) conflictEdgeIds.add(id);
  }

  // Step 4: Re-route using WFC (up to 3 attempts)
  for (let attempt = 0; attempt < 3; attempt++) {
    const success = rerouteZone(result.grid, zone, conflictEdgeIds);
    if (success) {
      // Verify no new conflicts
      const newConflicts = detectOverlaps(result.grid);
      if (newConflicts.length === 0) break;
    }
  }

  return result;
}
