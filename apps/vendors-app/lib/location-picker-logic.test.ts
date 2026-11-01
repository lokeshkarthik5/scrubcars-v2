/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  flyZoom,
  isSearchable,
  LINK_WARNINGS,
  linkMatchesCity,
  linkOutcome,
  longitudeDeltaFor,
  makeSessionToken,
  regionFor,
  suggestionsVisible,
  withTimeout,
  zoomFor,
} from './location-picker-logic';

const link = (over: Partial<Parameters<typeof linkOutcome>[0]> = {}) => ({
  lat: 13.0043,
  lng: 80.2554,
  address: 'Adyar, Chennai, Tamil Nadu',
  warning: null,
  source: 'link' as const,
  ...over,
});

test('search starts at three letters, ignoring spaces', () => {
  expect(isSearchable('ad')).toBe(false);
  expect(isSearchable('  ad ')).toBe(false);
  expect(isSearchable('ady')).toBe(true);
});

test('suggestions hide for the label just picked, and for short text', () => {
  expect(suggestionsVisible('Adyar', 3, null)).toBe(true);
  expect(suggestionsVisible('Adyar', 0, null)).toBe(false);
  expect(suggestionsVisible('Ad', 3, null)).toBe(false);
  expect(suggestionsVisible('Adyar, Chennai', 3, 'Adyar, Chennai')).toBe(false);
  expect(suggestionsVisible('Adyar, Chennai 6', 3, 'Adyar, Chennai')).toBe(true);
});

test('a session token is text, and differs between pickers', () => {
  const a = makeSessionToken();
  const b = makeSessionToken();
  expect(a.length).toBeGreaterThan(10);
  expect(a.length).toBeLessThanOrEqual(100);
  expect(a).not.toBe(b);
});

test('a link with no coordinates says so with the warning it carries', () => {
  expect(linkOutcome(link({ lat: null, lng: null }))).toEqual({
    point: null,
    notice: LINK_WARNINGS.no_location_found,
  });
  expect(linkOutcome(link({ lat: null, lng: null, warning: 'unreachable' })).notice).toBe(LINK_WARNINGS.unreachable);
});

test('a clean link in the right city places the pin with no note', () => {
  expect(linkOutcome(link(), 'Chennai')).toEqual({ point: { lat: 13.0043, lng: 80.2554 }, notice: null });
  expect(linkOutcome(link(), '')).toEqual({ point: { lat: 13.0043, lng: 80.2554 }, notice: null });
});

test('a place-share or directions link places the pin and warns', () => {
  const share = linkOutcome(link({ warning: 'place_share_link', source: 'geocoded' }), 'Chennai');
  expect(share.point).not.toBeNull();
  expect(share.notice).toContain(LINK_WARNINGS.place_share_link);
  expect(share.notice).toContain('Pin placed from the link’s address');
  expect(linkOutcome(link({ warning: 'directions_link' })).notice).toBe(LINK_WARNINGS.directions_link);
});

test('a link to another city warns, and the geocoded note is dropped', () => {
  const far = linkOutcome(link({ address: 'Sivakasi, Virudhunagar, Tamil Nadu', source: 'geocoded' }), 'Chennai');
  expect(far.point).not.toBeNull();
  expect(far.notice).toBe(
    'This link points to “Sivakasi, Virudhunagar, Tamil Nadu”, which does not look like Chennai. Check the pin.'
  );
  expect(linkMatchesCity('adyar, CHENNAI', ' chennai ')).toBe(true);
  expect(linkMatchesCity(null, 'Chennai')).toBe(true);
});

test('the zoom maths round-trips and never zooms out', () => {
  const delta = longitudeDeltaFor(16, 360);
  expect(zoomFor(delta, 360)).toBeCloseTo(16, 6);
  expect(regionFor({ lat: 13, lng: 80 }, 16, 360, 224)).toMatchObject({ latitude: 13, longitude: 80 });
  expect(regionFor({ lat: 13, lng: 80 }, 16, 360, 180).latitudeDelta).toBeCloseTo(delta / 2, 9);
  expect(flyZoom(null, 16)).toBe(16);
  expect(flyZoom(11, 16)).toBe(16);
  expect(flyZoom(18, 16)).toBe(18);
});

test('withTimeout resolves, rejects, and gives up', async () => {
  expect(await withTimeout(Promise.resolve(1), 50)).toBe(1);
  await expect(withTimeout(Promise.reject(new Error('x')), 50)).rejects.toThrow('x');
  await expect(withTimeout(new Promise(() => undefined), 10)).rejects.toThrow('timeout');
});
