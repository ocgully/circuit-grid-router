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
import type { NodeDef, EdgeDef, ScenarioResult } from './grid2d.js';
export declare function buildScenarioWfcConflict(nodes: NodeDef[], edges: EdgeDef[], padding?: number): ScenarioResult;
//# sourceMappingURL=wfc-conflict.d.ts.map