import { describe, it, expect } from 'vitest';
import { enforceMinSpacing } from '../src/spacing.js';
import type { NodeRect } from '../src/types.js';
import { DEFAULT_ROUTER_OPTIONS } from '../src/types.js';

const MIN_NODE_SPACING = DEFAULT_ROUTER_OPTIONS.minNodeSpacing;

describe('enforceMinSpacing', () => {
  it('returns empty array for empty input', () => {
    expect(enforceMinSpacing([])).toHaveLength(0);
  });

  it('returns single rect unchanged', () => {
    const rect: NodeRect = { x: 100, y: 100, w: 50, h: 50 };
    const result = enforceMinSpacing([rect]);
    expect(result[0]).toEqual(rect);
  });

  it('pushes two overlapping nodes apart', () => {
    const a: NodeRect = { x: 0, y: 0, w: 100, h: 100 };
    const b: NodeRect = { x: 50, y: 0, w: 100, h: 100 };
    const result = enforceMinSpacing([a, b]);
    const [ra, rb] = result;
    const separated = (ra.x + ra.w + MIN_NODE_SPACING <= rb.x) || (rb.x + rb.w + MIN_NODE_SPACING <= ra.x);
    expect(separated).toBe(true);
  });

  it('does not move well-separated nodes', () => {
    const a: NodeRect = { x: 0, y: 0, w: 100, h: 100 };
    const b: NodeRect = { x: 500, y: 0, w: 100, h: 100 };
    const result = enforceMinSpacing([a, b]);
    expect(result[0].x).toBe(a.x);
    expect(result[1].x).toBe(b.x);
  });

  it('handles three overlapping nodes', () => {
    const rects: NodeRect[] = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 20, y: 0, w: 100, h: 100 },
      { x: 40, y: 0, w: 100, h: 100 },
    ];
    const result = enforceMinSpacing(rects);
    expect(result).toHaveLength(3);
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const ra = result[i];
        const rb = result[j];
        const separated =
          ra.x + ra.w + MIN_NODE_SPACING <= rb.x ||
          rb.x + rb.w + MIN_NODE_SPACING <= ra.x ||
          ra.y + ra.h + MIN_NODE_SPACING <= rb.y ||
          rb.y + rb.h + MIN_NODE_SPACING <= ra.y;
        expect(separated).toBe(true);
      }
    }
  });

  it('accepts custom minNodeSpacing option', () => {
    const a: NodeRect = { x: 0, y: 0, w: 100, h: 100 };
    const b: NodeRect = { x: 110, y: 0, w: 100, h: 100 };
    // With default spacing (48), these overlap. With spacing 5, they don't.
    const resultSmall = enforceMinSpacing([a, b], { minNodeSpacing: 5 });
    expect(resultSmall[0].x).toBe(0);
    expect(resultSmall[1].x).toBe(110);
  });
});
