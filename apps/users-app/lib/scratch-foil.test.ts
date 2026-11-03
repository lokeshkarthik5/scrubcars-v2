import { expect, test } from 'bun:test';

import { BRUSH, CELL, cellsUnder, clearedShare, CLEAR_AT, movedEnough, MIN_MOVE, strokeBetween } from './scratch-foil';

const size = { width: 400, height: 528 };

test('a touch clears cells around it, never outside the card', () => {
  const cells = cellsUnder(0, 0, size);
  expect(cells.length).toBeGreaterThan(0);
  for (const c of cells) {
    const [i, j] = c.split(':').map(Number);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThanOrEqual(0);
  }
});

test('one touch is not enough; a third of the card is', () => {
  const one = new Set(cellsUnder(200, 200, size));
  expect(clearedShare(one.size, size)).toBeLessThan(CLEAR_AT);
  const many = new Set<string>();
  for (let y = 0; y <= 200; y += CELL) for (let x = 0; x <= 400; x += CELL) cellsUnder(x, y, size).forEach((c) => many.add(c));
  expect(clearedShare(many.size, size)).toBeGreaterThanOrEqual(CLEAR_AT);
});

test('a fast stroke leaves no gaps', () => {
  const points = strokeBetween({ x: 0, y: 0 }, { x: 300, y: 0 });
  expect(points.at(-1)).toEqual({ x: 300, y: 0 });
  expect(points[1].x - points[0].x).toBeLessThan(BRUSH);
});

test('a resting finger adds no marks', () => {
  expect(movedEnough(null, { x: 1, y: 1 })).toBe(true);
  expect(movedEnough({ x: 10, y: 10 }, { x: 11, y: 11 })).toBe(false);
  expect(movedEnough({ x: 0, y: 0 }, { x: MIN_MOVE, y: 0 })).toBe(true);
});
