/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  addCorner,
  cornerMessage,
  cornersFromRing,
  isArea,
  mapCoordinates,
  saveBlocked,
  saveLabel,
  savedCornerCount,
  savedStatus,
  savedToast,
  savePayload,
  undoCorner,
  type Corners,
} from './coverage-area';

const a: [number, number] = [80.1, 13.0];
const b: [number, number] = [80.2, 13.0];
const c: [number, number] = [80.15, 13.1];

test('a saved ring opens without its closing repeat, and a too-short one opens empty', () => {
  expect(cornersFromRing([a, b, c, a])).toEqual([a, b, c]);
  expect(cornersFromRing([a, b, a])).toEqual([]);
  expect(cornersFromRing(null)).toEqual([]);
  expect(cornersFromRing(undefined)).toEqual([]);
});

test('a tap adds [lng, lat], and undo takes the last corner off', () => {
  const one = addCorner([], 13.0, 80.1);
  expect(one).toEqual([[80.1, 13.0]]);
  expect(undoCorner(addCorner(one, 13.1, 80.2))).toEqual(one);
  expect(undoCorner([])).toEqual([]);
});

test('the fill needs three corners, and one or two block saving', () => {
  expect(isArea([a, b])).toBe(false);
  expect(isArea([a, b, c])).toBe(true);
  expect(saveBlocked([])).toBe(false);
  expect(saveBlocked([a])).toBe(true);
  expect(saveBlocked([a, b])).toBe(true);
  expect(saveBlocked([a, b, c])).toBe(false);
});

test('the payload is the closed ring, or null to clear', () => {
  expect(savePayload([a, b, c])).toEqual([a, b, c, a]);
  expect(savePayload([])).toBeNull();
  expect(savePayload([a, b])).toBeNull();
  // Already closed stays as it is: the closing point is never doubled.
  expect(savePayload([a, b, c, a])).toEqual([a, b, c, a]);
});

test('a saved area opens, re-saves unchanged, and the ring stays closed', () => {
  const ring: Corners = [a, b, c, a];
  expect(savePayload(cornersFromRing(ring))).toEqual(ring);
});

test('the button and the toast say what the save will do', () => {
  expect(saveLabel([a, b, c], false)).toBe('Save coverage area');
  expect(saveLabel([], false)).toBe('Clear area and use radius');
  expect(saveLabel([a, b, c], true)).toBe('Saving…');
  expect(savedToast([a, b, c])).toBe('Coverage area saved');
  expect(savedToast([])).toBe('Coverage area cleared');
});

test('the corner message follows the web', () => {
  expect(cornerMessage(0, 12)).toBe(
    'Tap the map to draw the area you travel to. Until you do, your 12 km radius applies.'
  );
  expect(cornerMessage(0, null)).toBe(
    'Tap the map to draw the area you travel to. Until you do, the default 10 km radius applies.'
  );
  expect(cornerMessage(1)).toBe('1 of 3 corners — an area needs at least three.');
  expect(cornerMessage(2)).toBe('2 of 3 corners — an area needs at least three.');
  expect(cornerMessage(3)).toBe('3 corners. Tap to add more, or save.');
  expect(cornerMessage(7)).toBe('7 corners. Tap to add more, or save.');
});

test('corners go to the map as latitude and longitude', () => {
  expect(mapCoordinates([a])).toEqual([{ latitude: 13.0, longitude: 80.1 }]);
});

test('without a map the status counts the saved corners, or names the radius that applies', () => {
  expect(savedCornerCount([a, b, c, a])).toBe(3);
  expect(savedCornerCount(null)).toBe(0);
  expect(savedStatus(4)).toBe('A coverage area with 4 corners is saved.');
  expect(savedStatus(0, 8)).toBe('No coverage area is drawn. Your 8 km radius applies.');
  expect(savedStatus(0, null)).toBe('No coverage area is drawn. The default 10 km radius applies.');
});
