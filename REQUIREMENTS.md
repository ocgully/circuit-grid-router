# Grid Router — Requirements

**Purpose:** Generic grid-based orthogonal edge routing library for node-and-edge diagrams. Portable across renderers (SVG, Canvas2D, Unity, etc.)

## Core Requirements

### Grid System
- GRID-01: The system SHALL route all edges on a configurable N-pixel grid with support for 8-direction movement (see DIAG-*)
- GRID-02: When a value is snapped to the grid, the system SHALL round to the nearest grid multiple
- GRID-03: The system SHALL support configurable grid size (default 8px)
- GRID-04: The grid SHALL support a 'blocked' cell type for corridor reservations (heavy penalty, not hard wall)

### Pathfinding
- PATH-01: The system SHALL use A* pathfinding with Chebyshev distance heuristic (supports diagonal movement)
- PATH-02: The system SHALL avoid routing through node bounding boxes (with 1-cell margin)
- PATH-03: When A* fails to find a path, the system SHALL fall back to an L-shaped route (a path is always guaranteed)
- PATH-04: When the grid exceeds the configurable max cell count, the system SHALL use a coarser grid
- PATH-05: The source and target cells SHALL NOT be blocked even if inside a node rect
- PATH-06: Turn penalties SHALL be biased toward the midpoint of the total path distance to produce balanced segment lengths
- PATH-07: Moving away from the target SHALL incur a heavy backtrack penalty
- PATH-08: The system SHALL always produce a path for every edge (no edge left unrouted)

### Segment Exclusivity
- SEG-01: No two edges SHALL share the same grid line segment in the same axis
- SEG-02: The system SHALL track occupied segments and penalize (not block) reuse during A*
- SEG-03: The occupied penalty SHALL be configurable (default 100)

### Crossing Detection
- CROSS-01: When two edges cross at perpendicular axes (H meets V), the system SHALL detect the crossing point
- CROSS-02: Crossing points SHALL include the pixel coordinates and the axis of the later edge
- CROSS-03: Parallel segments on the same grid line SHALL NOT produce crossings

### Handle Positions
- HANDLE-01: The system SHALL compute which side of a node each edge should connect to based on relative node positions
- HANDLE-02: Handle positions SHALL bias towards the center of the node side
- HANDLE-03: When multiple edges connect to the same side, handles SHALL be spaced evenly starting from center, each on a unique grid line
- HANDLE-04: When a side runs out of grid-aligned slots, overflow handles SHALL wrap to adjacent sides

### Edge Endpoints
- ENDPT-01: Edge start/end positions SHALL be on the node border (not center)
- ENDPT-02: The exit side SHALL face the target node; the entry side SHALL face the source node

### Connection Points (Grid2D)
- CONN-01: Connection points SHALL be node-adjacent (within 1 cell of the node bounding box)
- CONN-02: Connection points SHALL be center-biased: odd counts occupy center with pairs outward; even counts leave center as gap
- CONN-03: Adjacent connection points SHALL have exactly 1 empty cell gap between them
- CONN-04: Edges SHALL approach connection points head-on (perpendicular to the node face), enforced by A* direction checks at endpoints
- CONN-05: The 3 cells directly above and 3 cells directly below each connection (or left/right for top/bottom faces) SHALL be marked as blocked corridors with heavy routing penalty
- CONN-06: Connection cells SHALL identify the OTHER node the edge connects to (for display purposes)

### Edge Spacing (Grid2D)
- ~~ESPACE-01: REMOVED — visual spacing is baked into line rendering (line width < cell width)~~
- ~~ESPACE-02: REMOVED — see ESPACE-01~~
- ESPACE-03: Perpendicular crossings (jumps) at distance 1 SHALL remain allowed

### Edge Bundling (Grid2D)
- ~~BUNDLE-01 through BUNDLE-04: REMOVED — buffer enforcement removed; bundling bonus no longer needed~~

### Diagonal Travel
- DIAG-01: The router SHALL support 8-direction movement (cardinal + diagonal)
- DIAG-02: Diagonal steps SHALL cost SQRT2 + 1.4 (extra cost to prefer straight lines)
- DIAG-03: Changing diagonal direction (e.g. up-right → down-right) SHALL incur a zigzag penalty of 8
- DIAG-04: Diagonal moves SHALL NOT cut through node/blocked cell corners
- DIAG-05: Edges SHALL approach connection points head-on only (no diagonal at endpoints)

### Negotiated Congestion
- NEG-01: The router SHALL route all edges simultaneously, allowing temporary overlaps
- NEG-02: The router SHALL iteratively rip up and reroute with escalating congestion costs
- NEG-03: Per-cell cost SHALL be: (base_cost + history_cost) * present_congestion_factor
- NEG-04: History cost SHALL accumulate on overused cells and never reset
- NEG-05: Present congestion factor SHALL escalate exponentially with iteration (1.3^n, capped at 8x)
- NEG-06: The router SHALL converge when no cell is shared by multiple edges in the same direction
- NEG-07: Maximum negotiation iterations SHALL be 20

### Incremental Routing (Single-Node Drag)
- INCR-01: The system SHALL support incremental updates when a single node moves
- INCR-02: Only edges connected to the moved node SHALL be rerouted during drag
- INCR-03: Cached edge paths that intersect the new node footprint SHALL also be rerouted
- INCR-04: Unaffected edge paths SHALL be preserved without recomputation
- INCR-05: During drag, the system SHALL use fast single-pass A* (no negotiation)
- INCR-06: On drag-stop, the system SHALL perform a full negotiated reroute for optimal results
- INCR-07: The system SHALL provide pixel-to-grid and grid-to-pixel coordinate conversion
- INCR-08: Edge paths SHALL be convertible to SVG path strings (lines through cell centers)
- INCR-09: The system SHALL detect jump/crossing points from the grid state

### Node Spacing
- SPACE-01: The system SHALL enforce configurable minimum spacing between nodes
- SPACE-02: Spacing enforcement SHALL push overlapping nodes apart on the axis of least overlap
- SPACE-03: Adjusted positions SHALL be snapped to the grid

### View Layer Independence
- VIEW-01: The library SHALL NOT depend on any rendering framework (React, DOM, SVG, Canvas, Unity)
- VIEW-02: All outputs SHALL be coordinate-based (arrays of {x,y} points, side+offset pairs)
- VIEW-03: The library SHALL NOT generate SVG path strings, DOM elements, or framework-specific constructs
- VIEW-04: Consumers are responsible for converting coordinates to their rendering format

### Performance
- PERF-01: The system SHALL support configurable max grid cell count (default 50000)
- PERF-02: When exceeded, the system SHALL automatically use 2x grid size
