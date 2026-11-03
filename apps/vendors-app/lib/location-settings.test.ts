/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { locationPayload, pinFromVendor, radiusInput, radiusText, radiusUnreadable } from './location-settings';

const vendor = { lat: 13.01, lng: 80.25, address: '1 Main St', city: 'Chennai', pincode: '600020', doorstepRadiusKm: null };

test('the tab opens on the saved pin, or on none', () => {
  expect(pinFromVendor(vendor)).toEqual({
    lat: 13.01,
    lng: 80.25,
    address: '1 Main St',
    city: 'Chennai',
    pincode: '600020',
    source: 'map_pin',
  });
  expect(pinFromVendor({ ...vendor, lat: null, lng: null })).toBeNull();
});

test('the radius box shows the saved radius, and takes digits and a dot', () => {
  expect(radiusText(vendor)).toBe('');
  expect(radiusText({ doorstepRadiusKm: 12.5 })).toBe('12.5');
  expect(radiusInput('1a2.5km,')).toBe('12.5');
});

test('save sends the pin, its source and the radius, or null when the box is empty', () => {
  const pin = { lat: 13, lng: 80, source: 'gps' as const };
  expect(locationPayload(pin, '15')).toEqual({ lat: 13, lng: 80, geoSource: 'gps', doorstepRadiusKm: 15 });
  expect(locationPayload(pin, '  ')).toEqual({ lat: 13, lng: 80, geoSource: 'gps', doorstepRadiusKm: null });
  expect(locationPayload(pin, '7.5').doorstepRadiusKm).toBe(7.5);
});

test('a radius that is not a number is caught before it is sent', () => {
  expect(radiusUnreadable('')).toBe(false);
  expect(radiusUnreadable('12')).toBe(false);
  expect(radiusUnreadable('.')).toBe(true);
  expect(radiusUnreadable('1.2.3')).toBe(true);
});
