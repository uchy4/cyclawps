# Smart Guides Object Spacing


## Context and Problem Statement

We have a canvas with SVG objects rendered by a custom engine. Users need to arrange objects with equal spacing — for example, distributing shapes evenly across the canvas. Today there is no feedback during drag operations to indicate when objects are equally spaced.

**Example:** Given three squares A, B, and C on the canvas — if A and B are one inch apart, and the user drags C toward B, once C reaches a position where it is also one inch from B, the system should show guide lines in the gaps between A–B and B–C. It should also snap C to that exact position when the user is within a certain distance, so the user can release with confidence that the spacing is precise.

We need to implement two capabilities:

1. **Detection and Guide Display** — While the user drags an object, detect when any gap between the dragged object and a neighbor matches a gap between other objects on the canvas. When a match is found, render visual guide lines in the matching gaps.

2. **Snapping** — When the dragged object is close to a position that would produce a matching gap, snap it to that exact position.


## Decision Drivers

**Performance.** Detection runs on every pointer-move event during drag. It must not cause frame drops even on canvases with many objects.

**Familiarity.** Behavior should match what users expect from tools like Figma and Sketch.

**Simplicity.** The implementation should be straightforward and maintainable without introducing heavy abstractions.

**Adaptability.** The design should accommodate future extensions without requiring a rewrite.


## Gap Detection Algorithm

On each pointer-move event during drag, we need to: (a) compute the gaps between adjacent objects along each axis, and (b) check whether the gap between the dragged object and its neighbors matches any existing gap.


### Option 1: Brute-Force Pairwise Comparison

For each axis, compute the gap between every pair of object bounding boxes. Filter to adjacent pairs (no third object sits between them on that axis). Compare the dragged object's gap to neighbors against all existing gaps.

**Pros:**

- Simplest to implement. No data structures to build or maintain.
- Correct by construction.

**Cons:**

- O(n²) per axis per frame. At 200 objects, that is 40,000 pair checks per axis.
- Adjacency filtering (ensuring no object sits between a pair) adds complexity.


### Option 2: Axis-Sorted Sweep

Sort objects by their leading edge on each axis (left edge for X, top edge for Y). Sweep through the sorted list to identify adjacent pairs and their gaps. Adjacent pairs fall out naturally from the sorted order.

**Pros:**

- O(n log n) sort plus O(n) sweep. For 200 objects, this completes in well under 1ms.
- The sort can be cached at drag start and reused on every pointer-move event.
- Adjacent pairs are a direct byproduct of the sweep — cleaner than brute-force adjacency filtering.

**Cons:**

- Requires maintaining sorted arrays and updating them if the object set changes mid-drag.
- Slightly more code than brute force, though the sweep itself is straightforward.


### Option 3: Spatial Index (R-Tree)

Build an R-tree from all object bounding boxes. Query for neighbors of the dragged object, then check gap matches against a precomputed gap table.

**Pros:**

- O(log n) neighbor queries. Scales to thousands of objects.

**Cons:**

- Significant complexity for marginal gain. The sweep already handles 200 objects in sub-millisecond time.
- Introduces a dependency (e.g., rbush) into the codebase.
- Overkill for realistic canvas sizes.


### Decision

**Option 2 (Axis-Sorted Sweep)** is the recommended approach.

The sweep handles realistic object counts in sub-millisecond time, and caching the sorted arrays at drag start means the O(n log n) sort only runs once per drag operation. The sweep produces adjacent pairs directly, eliminating the need for brute-force adjacency filtering.


## Guide Rendering Strategy

Spacing guides are transient — they appear during drag and disappear on drag end. They must be drawn on top of all objects but must not affect object hit-testing or selection.


### Option 1: Inline Rendering on the Main Canvas

Draw spacing guides as part of the main canvas render loop, after all SVG objects are drawn.

**Pros:**

- No additional DOM elements. Guides are automatically synchronized with pan and zoom.
- Simplest integration if the render loop already supports a post-object decoration phase.

**Cons:**

- Clearing guides requires redrawing all objects, which is expensive.
- Hit-testing and export must explicitly exclude guide draw calls.


### Option 2: Dedicated Overlay Canvas Layer

Add a second `<canvas>` element positioned over the main canvas via CSS. Render all spacing guides on this overlay. Clear and redraw the overlay each frame independently.

**Pros:**

- Complete separation. Guide rendering cannot interfere with the main canvas.
- Clearing guides is a single `clearRect` — no need to redraw objects.
- Easy to toggle on/off.

**Cons:**

- Two canvases must stay in sync for pan, zoom, and resize.
- Adds a compositing layer (though the overlay is lightweight).
- Pointer events must pass through the overlay (`pointer-events: none`).


### Option 3: DOM/SVG Overlay

Render guides as absolutely-positioned SVG or HTML elements layered on top of the canvas.

**Pros:**

- Easy to style with CSS (dashed lines, colors).
- Naturally excluded from canvas export and hit-testing.

**Cons:**

- DOM updates on every pointer-move event risk layout thrashing.
- Keeping SVG coordinates synchronized with canvas pan/zoom requires continuous transform recalculation.
- Poor performance at high guide counts or high drag velocity.


### Decision

**Option 2 (Dedicated Overlay Canvas Layer)** is the recommended approach.

An overlay canvas provides clean separation without the performance risks of DOM rendering or the entanglement of inline rendering. Setting `pointer-events: none` on the overlay ensures input events pass through transparently, and the independent `clearRect` cycle means guide rendering is fully decoupled from main canvas redraws.


## Snap Behavior

Snap behavior is critical to the feel of the feature. If snapping is too aggressive, it fights the user. If too subtle, users don't notice it.


### Option 1: Hard Snap

When the dragged object's position would produce a gap within a threshold of a matching gap, instantly move the object to the exact matching-gap position.

**Pros:**

- Simplest to implement — a conditional check and position override.
- Unambiguous feedback: the object is either snapped or not.

**Cons:**

- Feels abrupt. The object jumps a few pixels, which is visually jarring.
- Near the threshold boundary, rapid small jumps create a flickering effect.


### Option 2: Magnetic/Weighted Snap

As the dragged object approaches the matching-gap position, apply an increasing bias toward the snap point. The rendered position is a weighted blend between the raw pointer position and the snap target.

**Pros:**

- Smooth, fluid feel. No abrupt jumps.

**Cons:**

- No clean "locked" state — the object is always slightly offset from the true snap position unless the pointer lands exactly on it.
- The blended position can feel sluggish if the weighting curve is not well-tuned.


### Option 3: Hybrid — Magnetic Pull with Hard Lock

Divide the snap threshold into two zones:

- **Outer zone (e.g., 12px):** Apply a gentle magnetic bias toward the snap point.
- **Inner zone (e.g., 5px):** Hard-lock to the exact snap position until the pointer exits the outer zone.

**Pros:**

- Best of both worlds. Smooth approach, precise lock.
- Matches the feel of Figma's snapping.
- The two-zone model provides natural hysteresis that prevents flickering.

**Cons:**

- Most complex. Requires two thresholds, a weighting function, and hysteresis logic.
- More parameters to tune (outer radius, inner radius, magnetic strength).


### Decision

**Option 3 (Hybrid — Magnetic Pull with Hard Lock)** is the recommended approach.

The hybrid approach delivers the polished experience users expect. Defining thresholds in screen pixels (independent of zoom) ensures consistent feel at all zoom levels.

Recommended defaults:

- Outer zone: 12 screen pixels
- Inner zone: 5 screen pixels
- Magnetic curve: quadratic ease-in
- Hysteresis: exit outer zone to unlock


## High-Level Implementation

### Components

**GapDetector** — Pure function. Takes an array of object bounding boxes and the dragged object's current bounding box. Maintains two sorted arrays (X-axis, Y-axis). Sweeps each axis to find adjacent pairs and their gaps. Returns matched gaps and candidate snap positions.

**GuideRenderer** — Owns the overlay canvas element. Receives matched-gap data and draws dashed guide lines spanning each matching gap. Clears and redraws each frame.

**SnapResolver** — Takes raw pointer position and snap candidates from GapDetector. Converts distances from canvas units to screen pixels using current zoom. Applies the two-zone hybrid snap logic. Returns the final snapped position.

**SpacingController** — Orchestrates the feature during drag. Hooks into the existing drag event lifecycle:

1. **Drag Start** — Collect bounding boxes of all objects. Build sorted arrays. Initialize overlay canvas.
2. **Pointer Move** — Compute dragged object's candidate bounding box. Run GapDetector. Feed results to SnapResolver for final position. Feed matched gaps to GuideRenderer for drawing.
3. **Drag End** — Clear guides, reset state.

### Data Flow

```
Pointer Move Event
       │
       ▼
SpacingController
       │
       ├──▶ GapDetector (sorted sweep → matched gaps + snap candidates)
       │
       ├──▶ SnapResolver (raw position + candidates → snapped position)
       │
       └──▶ GuideRenderer (matched gaps → overlay canvas draw)
       │
       ▼
Return snapped position to drag system
```
