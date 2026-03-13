import { describe, it, expect } from 'vitest';
import { snapToGrid, toGrid, fromGrid } from '../src/grid.js';
import { DEFAULT_ROUTER_OPTIONS } from '../src/types.js';

describe('snapToGrid', () => {
  it('snaps 0 to 0', () => {
    expect(snapToGrid(0)).toBe(0);
  });

  it('snaps 5 to 8 (nearest multiple)', () => {
    expect(snapToGrid(5)).toBe(8);
  });

  it('snaps 12 to 16', () => {
    expect(snapToGrid(12)).toBe(16);
  });

  it('snaps -3 to 0 (nearest multiple)', () => {
    expect(snapToGrid(-3)).toEqual(0);
  });

  it('snaps 4 to 8 (rounds half up)', () => {
    expect(snapToGrid(4)).toBe(8);
  });

  it('snaps 100 to 104', () => {
    expect(snapToGrid(100)).toBe(104);
  });

  it('default gridSize is 8', () => {
    expect(DEFAULT_ROUTER_OPTIONS.gridSize).toBe(8);
  });

  it('accepts custom gridSize', () => {
    expect(snapToGrid(7, 10)).toBe(10);
    expect(snapToGrid(13, 10)).toBe(10);
    expect(snapToGrid(16, 10)).toBe(20);
  });

  it('snaps with gridSize 16', () => {
    expect(snapToGrid(9, 16)).toBe(16);
    expect(snapToGrid(24, 16)).toBe(32);
  });
});

describe('toGrid', () => {
  it('converts pixel to grid coordinates', () => {
    const gp = toGrid(16, 24);
    expect(gp.gx).toBe(2);
    expect(gp.gy).toBe(3);
  });

  it('rounds to nearest grid cell', () => {
    const gp = toGrid(13, 19);
    expect(gp.gx).toBe(2); // 13/8 = 1.625 rounds to 2
    expect(gp.gy).toBe(2); // 19/8 = 2.375 rounds to 2
  });

  it('accepts custom gridSize', () => {
    const gp = toGrid(30, 45, 10);
    expect(gp.gx).toBe(3);
    expect(gp.gy).toBe(5); // 45/10 = 4.5, rounds to 5 (Math.round rounds half up)
  });
});

describe('fromGrid', () => {
  it('converts grid to pixel coordinates', () => {
    const px = fromGrid(2, 3);
    expect(px.x).toBe(16);
    expect(px.y).toBe(24);
  });

  it('accepts custom gridSize', () => {
    const px = fromGrid(2, 3, 10);
    expect(px.x).toBe(20);
    expect(px.y).toBe(30);
  });
});
