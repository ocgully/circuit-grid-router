/**
 * WFC Approach 3: Full Grid WFC
 *
 * Treat the ENTIRE grid as a WFC problem. Nodes are pre-collapsed.
 * Connection points seed directional constraints. WFC propagates
 * from connections outward, and the solver finds valid tile assignments
 * that naturally form paths between connected nodes.
 *
 * Strategy:
 * 1. Pre-collapse all node cells (impassable)
 * 2. Pre-collapse corridor cells (blocked)
 * 3. Seed connection cells with directional tiles based on their side
 * 4. Add "attractor" weights biasing tiles toward forming paths between connections
 * 5. Run full WFC solve on the entire grid
 * 6. Verify connectivity — if paths don't connect, add path hints and re-solve
 */
import type { NodeDef, EdgeDef, ScenarioResult } from './grid2d.js';
export declare function buildScenarioWfcFull(nodes: NodeDef[], edges: EdgeDef[], padding?: number): ScenarioResult;
//# sourceMappingURL=wfc-full.d.ts.map