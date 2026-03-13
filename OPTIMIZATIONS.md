# Grid Router — Incremental Routing Optimizations

When integrating with an interactive canvas (e.g., ReactFlow), only one node moves at a time during drag operations. This constraint enables significant optimizations over full rerouting.

## What changes when one node moves

- The node's grid cells (old position cleared, new position stamped)
- Connection points on the moved node (positions shift with the node)
- Corridor blocking around those connections
- Edges connected to the moved node need new paths

## What stays the same

- All other nodes, their connections, their corridors
- Edges between two non-moving nodes (unless the moved node's new footprint blocks their path)

## Optimization strategies

### 1. Invalidation by connectivity

Only reroute edges connected to the moved node. Keep all other edge paths cached. Then check if any cached path now overlaps the node's new footprint — only reroute those too.

For a 50-node graph where the moved node has 4 connections, that's ~4 routes instead of 60+.

### 2. Grid delta instead of rebuild

Don't recreate the grid from scratch. Clear the old node footprint + old corridors, stamp the new position + new corridors. The rest of the grid is untouched.

### 3. Two-phase drag routing

While dragging, use a fast single-pass A* for affected edges (skip negotiation iterations, allow overlaps). On mouse-up, run the full negotiated congestion solve for clean results. The user sees "good enough" routes at interactive frame rates, then a polish step.

### 4. Spatial index for path intersection

Store each edge's path cells in a Set. When the node moves, check which cached paths intersect the new node footprint — O(node area) instead of checking every edge.

## Combined approach

The biggest win is **1 + 2 + 3** combined:

- **During drag**: incremental grid update + selective single-pass rerouting for connected + colliding edges
- **On drop**: full negotiated congestion solve for optimal results

This turns an O(all edges × negotiation iterations) problem into O(affected edges × 1 pass) per drag frame.
