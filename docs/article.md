# Building a Circuit-Board Edge Router from Scratch

*How we built a grid-based orthogonal routing library that produces clean, non-overlapping paths for node-and-edge diagrams — with negotiated congestion, diagonal support, and real-time drag updates.*

## The Problem

Node-and-edge diagram editors (think Figma's connector lines, or circuit schematic tools) need to route edges between nodes without overlapping, crossing through nodes, or creating visual chaos. Most diagram libraries punt on this — they draw straight lines or simple Bezier curves and call it a day.

Let's be honest: Bezier curves are faster to compute. A simple cubic spline between two points is nearly free compared to grid-based A* pathfinding. If raw performance is all you care about, stop reading — Beziers win.

But here's the thing: **the cost isn't in the CPU, it's in your head.**

I built this library because I was tired of spending more time *managing my diagrams* than actually thinking about the systems they represent. Every node-and-edge tool I've used has the same problem — you place a few nodes, connect them, and suddenly you're playing a spatial puzzle game trying to reduce edge overlap. You drag Node C to the left because two connections are crossing. That fixes one overlap but creates another. You nudge Node D down. Better, but now you can't tell which edge goes where because three of them are stacked on top of each other, all the same color, all following the same lazy Bezier arc.

If you have any amount of OCD about your diagrams looking *right*, you know the feeling. You're not designing a system anymore — you're arranging furniture. And the tool isn't helping, because it treats edge routing as your problem to solve manually.

Circuit-board routing flips this. Edges route *themselves* around obstacles. They negotiate corridors so they don't overlap. When they must cross, they cross cleanly at marked jump points. Each edge has its own distinct path, and with per-edge coloring, you can trace any connection at a glance. **The diagram stays readable without you having to micromanage it.**

Is it slower than a Bezier? Yes. But good connections that stay out of your way are superior to fast connections that pile on top of each other — because then you don't need to spend your mindshare organizing nodes just to make the diagram legible.

![Star topology — 5 nodes routing to a central hub](images/star.svg)

## Why a Grid?

The first design decision was to route on a discrete grid rather than in continuous space. Grid routing gives us:

1. **Guaranteed non-overlap** — two edges can't occupy the same cell in the same direction
2. **Simple collision detection** — just check cell types
3. **Predictable visual output** — lines snap to grid, producing clean orthogonal paths
4. **Efficient pathfinding** — A* on a grid is well-understood and fast

The grid cell size is configurable (default 8px). Each cell has a type:

| Type | Purpose |
|------|---------|
| `empty` | Available for routing |
| `node` | Part of a node's bounding box |
| `connection` | Edge endpoint adjacent to a node |
| `edge` | An edge passes through here |
| `jump` | Two edges cross perpendicularly |
| `blocked` | Corridor reservation near connections |

## Connection Point Distribution

Before routing, we need to know *where* on each node side an edge connects. Naive approaches (always connect at center) break down when multiple edges share a side.

Our distribution algorithm is center-biased:
- **1 edge:** center of the side
- **2 edges:** one cell above center, one below (gap at center)
- **3 edges:** center occupied, pair spread outward with 1-cell gaps
- **N edges:** continue the pattern, always maintaining gaps

![3-edge distribution showing center-biased connection points](images/dist-3.svg)

Connection points are placed 1 cell outside the node boundary. The 3 cells surrounding each connection (forming a corridor) are marked as `blocked` — not impassable, but carrying a heavy routing penalty. This keeps edges from crowding the node boundary.

## The A* Pathfinder

Each edge is routed independently using A* with a **Chebyshev distance heuristic** (which accounts for diagonal movement). The cost model is carefully tuned:

**Step costs:**
- Cardinal (horizontal/vertical): 1.0
- Diagonal: √2 + 1.4 (the extra cost discourages unnecessary diagonals)

**Penalties:**
- **Turn penalty:** 4 + distance-from-midpoint × 0.5. This biases turns toward the midpoint of the total path, producing balanced L-shapes rather than hugging one node.
- **Backtrack penalty:** 50. Moving away from the target is almost never what you want.
- **Diagonal zigzag:** 8. Changing diagonal direction (e.g., up-right → down-right) produces ugly zigzag patterns.
- **Crossing penalty:** 6. Stepping on another edge's cell is allowed but costly.
- **Occupied segment penalty:** 100. Sharing a grid line with another edge in the same axis.

**Endpoint constraints:** Edges must approach connection points **head-on** (perpendicular to the node face). No diagonal arrivals.

![X crossing — two edges must cross, producing a jump point](images/x-cross.svg)

## Negotiated Congestion: The Key Innovation

Single-pass A* produces decent results, but when multiple edges compete for the same corridor, you get suboptimal paths. The solution: **negotiated congestion routing**, inspired by the PathFinder FPGA routing algorithm.

The idea is beautifully simple:

1. **Route all edges** simultaneously, allowing temporary overlaps
2. **Detect overused cells** — any cell shared by 2+ edges in the same direction
3. **Accumulate history costs** on overused cells (these never reset)
4. **Rip up all edges** and reroute with escalating costs:
   - `cost = (baseCost + historyCost) × presentFactor`
   - `presentFactor = 1.3^iteration` (capped at 8×)
5. **Repeat** until no cell is overused, or we hit 20 iterations

The escalating costs create a "negotiation" — edges that can easily take alternate routes do so, while edges that truly need a contested cell get priority through history accumulation.

In practice, most scenarios converge in 3-5 iterations.

## 8-Direction Movement

Pure orthogonal routing (4 directions) works but produces unnecessarily long paths when nodes are diagonally positioned. We support all 8 directions:

![Diagonal SE routing](images/diagonal-se.svg)

Diagonals are intentionally expensive (√2 + 1.4 step cost, plus an 8-point zigzag penalty for changing diagonal direction). This means the router prefers clean horizontal/vertical segments and only uses diagonals when they provide a meaningful shortcut.

**Corner-cutting prevention:** Diagonal moves are blocked when either adjacent cardinal cell contains a node or blocked cell. This prevents edges from clipping node corners.

## Incremental Routing for Interactive Drag

The full negotiated solve takes ~5ms for typical diagrams (10-20 nodes). That's fine for initial layout, but when a user drags a node, we need sub-millisecond updates.

Our incremental strategy:

### During Drag (every grid-snap)
1. Identify **affected edges**: those connected to the moved node, plus any whose cached path intersects the node's new footprint
2. Rebuild the grid with the node at its new position
3. Place **unaffected edge paths** back onto the grid (skip rerouting)
4. Route only affected edges with **fast single-pass A*** (no negotiation)

This typically reroutes 2-4 edges instead of all 20+.

### On Drop (mouse-up)
Run the full negotiated solve for optimal placement.

```
During drag:  O(affected edges) × O(A* single pass)
On drop:      O(all edges) × O(negotiation iterations)
```

### Binary Heap A*

The A* open set uses a binary heap (O(log n) insert/extract) instead of array sort (O(n log n) per step). On a 200×100 grid, this cuts pathfinding time by ~10x.

## Fan Out: Distributing Multiple Edges

When one node connects to many targets, the router must distribute connections across the source node's sides and route each edge to its destination without conflicts.

![Fan out — 1 source to 4 targets](images/fan-out.svg)

The connection distribution algorithm determines which side each edge exits from (based on relative target position), then spaces connections evenly on that side. The negotiated router ensures the resulting paths don't overlap.

## Crossing Detection

When two edges must cross (perpendicular intersection), the router detects the crossing point and marks the cell as a `jump`. The output includes:

- **Pixel coordinates** of the crossing
- **Axis** of the later edge ('h' or 'v')

Renderers can use this to draw humps, arcs, or gaps at crossing points — the standard circuit-board visual convention.

## The Diamond Test

The diamond pattern is a good stress test: 4 nodes, 4 edges, multiple routing conflicts.

![Diamond — 4 edges with competing paths](images/diamond.svg)

The negotiated router resolves this cleanly — each edge gets its own corridor, and the paths are balanced.

## Auto-Coarsening

For very large diagrams, the grid can exceed practical limits. When the cell count exceeds 50,000 (configurable), the router automatically doubles the cell size. A 520px-wide node that was 65 cells becomes 33 cells at 2x, reducing the grid to 1/4 the size.

## View-Layer Independence

The router outputs **coordinates only** — arrays of `{x, y}` waypoints, side+offset pairs for handles, and `{x, y, axis}` crossing points. No React, no SVG, no DOM.

This means you can use it with:
- **React + SVG** (draw `<path>` elements)
- **Canvas2D** (draw lines between waypoints)
- **Unity** (instantiate line renderers)
- **Terminal** (ASCII art, if you're into that)

The `waypointsToSvgPath()` helper is a convenience — it converts waypoints to an SVG `M/L` path string, but it's a one-liner you could write yourself.

## Scaling Up: 50 and 100 Nodes

Everything above works great for small diagrams. But how does it hold up when things get complicated?

### Mind Map (50 Nodes)

A central hub connected to 25 satellites, each with their own child nodes — 50 nodes total, 49 edges. The hub node needs connections on all four sides, and the negotiated router must distribute them without conflict.

![Mind Map — 50 nodes with a 25-connection central hub](images/mindmap.svg)

The connection distribution algorithm handles the hub's 25 connections by spreading them across all four sides, wrapping to adjacent sides when one fills up. The negotiated router resolves routing conflicts between the dense spokes radiating outward.

### Mega Grid (100 Nodes)

The ultimate stress test: a 10×10 grid of nodes with 180 edges (every node connects to its right and bottom neighbor). This creates dense parallel corridors, heavy crossing traffic, and pushes the auto-coarsening system.

![Mega Grid — 100 nodes, 180 edges](images/mega-grid.svg)

At 100 nodes on a 118×118 grid (~14,000 cells), the negotiated router converges in a handful of iterations. The auto-coarsening system keeps the grid manageable, and the binary heap A* ensures pathfinding stays fast even at this scale.

## Results

The test suite includes 30 scenarios across 8 tiers of complexity, from basic 2-node layouts to a 100-node stress test and a 50-node mind map with a 25-connection hub.

Key metrics:
- **113 tests** passing
- **Zero runtime dependencies**
- **~4,500 lines** of TypeScript
- Full negotiated solve: **<10ms** for 20-node diagrams
- Incremental drag update: **<1ms** for affected edges only

## Try It

```bash
npm install circuit-grid-router
```

```typescript
import { buildScenarioNegotiated } from 'circuit-grid-router';

const result = buildScenarioNegotiated(nodes, edges);
// result.grid — inspect the routed grid
// result.connections — where edges connect to nodes
```

For the full API, visual test harness, and 30 built-in scenarios, see the [README](../README.md).

---

*Built with TypeScript. Inspired by PathFinder (FPGA negotiated congestion routing). Licensed MIT.*
