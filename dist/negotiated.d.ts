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
import type { NodeDef, EdgeDef, ScenarioResult } from './grid2d.js';
export declare function buildScenarioNegotiated(nodes: NodeDef[], edges: EdgeDef[], padding?: number): ScenarioResult;
//# sourceMappingURL=negotiated.d.ts.map