/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  addedText,
  baysProblem,
  createVendorBody,
  doorstepRadius,
  draftFor,
  EMPTY_DRAFT,
  jobsProblem,
  parseStep,
  phoneDigits,
  pricingComplete,
  progressFor,
  radiusProblem,
  serviceBody,
  serviceReady,
  step1Complete,
  step2Problem,
  step2Ready,
  step3JobTypes,
  step3Problem,
  step3Settings,
  stepGuard,
  SERVICE_PRESETS,
  toggleDay,
  toggleVehicleType,
  prefillFromPin,
} from './onboarding-logic';

const filled = { ...EMPTY_DRAFT, businessName: 'Om Auto', ownerName: 'Om', city: 'Chennai' };

test('the route param is a step 1 to 4, and nothing else', () => {
  expect(parseStep('step-1')).toBe(1);
  expect(parseStep(['step-4'])).toBe(4);
  expect(parseStep('step-5')).toBeNull();
  expect(parseStep('step-0')).toBeNull();
  expect(parseStep('1')).toBeNull();
  expect(parseStep(undefined)).toBeNull();
  expect([1, 2, 3, 4].map((s) => progressFor(s as 1 | 2 | 3 | 4))).toEqual([25, 50, 75, 100]);
});

test('the verified number is its ten digits', () => {
  expect(phoneDigits('9000000098')).toBe('9000000098');
  expect(phoneDigits('+91 90000 00098')).toBe('9000000098');
  expect(phoneDigits(null)).toBe('');
});

test("another number's draft is not carried over", () => {
  const mine = { ...filled, phone: '9000000098' };
  expect(draftFor(mine, '9000000098')).toBe(mine);
  expect(draftFor(mine, '9000000097')).toEqual(EMPTY_DRAFT);
  expect(draftFor(EMPTY_DRAFT, '9000000097')).toBe(EMPTY_DRAFT);
});

test('step 1 needs business name, owner name and city', () => {
  expect(step1Complete(filled)).toBe(true);
  expect(step1Complete({ ...filled, city: '  ' })).toBe(false);
  expect(step1Complete({ ...filled, ownerName: '' })).toBe(false);
  expect(step1Complete(EMPTY_DRAFT)).toBe(false);
});

test('step 2 says what is missing in the web toast words', () => {
  expect(step2Problem({ hasPin: false, pincode: '600001' })).toBe('Set your garage location on the map');
  expect(step2Problem({ hasPin: true, pincode: '6000' })).toBe('Enter a valid 6-digit pincode');
  expect(step2Problem({ hasPin: true, pincode: '60000a' })).toBe('Enter a valid 6-digit pincode');
  expect(step2Problem({ hasPin: true, pincode: '600001' })).toBeNull();
  const ok = { hasPin: true, address: '1 Main St', city: 'Chennai', pincode: '600001' };
  expect(step2Ready(ok)).toBe(true);
  expect(step2Ready({ ...ok, address: ' ' })).toBe(false);
  expect(step2Ready({ ...ok, hasPin: false })).toBe(false);
});

test('a pin fills the address only where it is empty, and the city and pincode where it found one', () => {
  const picked = { address: 'Found St', pincode: '600020', city: 'Chennai' };
  expect(prefillFromPin({ address: '', pincode: '', city: '' }, picked)).toEqual(picked);
  expect(prefillFromPin({ address: 'Mine', pincode: '600001', city: 'Adyar' }, picked)).toEqual({
    address: 'Mine',
    pincode: '600020',
    city: 'Chennai',
  });
  expect(prefillFromPin({ address: 'Mine', pincode: '600001', city: 'Adyar' }, { address: '', pincode: '', city: '' })).toEqual({
    address: 'Mine',
    pincode: '600001',
    city: 'Adyar',
  });
});

test('the garage is created with the optional fields left out when empty', () => {
  const body = createVendorBody({
    ...filled,
    phone: '9000000098',
    address: '1 Main St',
    pincode: '600001',
    lat: 13,
    lng: 80,
    geoSource: 'gps',
    mapsUrl: 'https://maps.app.goo.gl/x',
  });
  expect(body).toEqual({
    businessName: 'Om Auto',
    phone: '9000000098',
    address: '1 Main St',
    city: 'Chennai',
    pincode: '600001',
    lat: 13,
    lng: 80,
    geoSource: 'gps',
    whatsapp: undefined,
    email: undefined,
    yearsInOperation: undefined,
    mapsUrl: 'https://maps.app.goo.gl/x',
  });
});

test('step 3: the radius is 1 to 300 km or empty, only when doorstep is on', () => {
  expect(radiusProblem(false, '999')).toBeNull();
  expect(radiusProblem(true, '')).toBeNull();
  expect(radiusProblem(true, '15')).toBeNull();
  // The 30 km top was lifted (10 Nov 2026).
  expect(radiusProblem(true, '45')).toBeNull();
  expect(radiusProblem(true, '0.5')).toContain('from 1 to 300 km');
  expect(radiusProblem(true, '301')).not.toBeNull();
  expect(radiusProblem(true, 'x')).not.toBeNull();
});

test('step 3: bays 1 to 20, jobs a whole number from 1, both may be blank', () => {
  expect(baysProblem('')).toBeNull();
  expect(baysProblem('20')).toBeNull();
  expect(baysProblem('21')).toBe('Cars at the same time must be between 1 and 20.');
  expect(baysProblem('0')).not.toBeNull();
  expect(baysProblem('2.5')).not.toBeNull();
  expect(jobsProblem('')).toBeNull();
  expect(jobsProblem('40')).toBeNull();
  expect(jobsProblem('0')).toBe('Jobs in a day must be 1 or more, or left blank.');
  expect(step3Problem({ doorstep: true, doorstepRadiusKm: '500', bays: '', jobsPerDay: '' })).toContain('1 to 300');
  expect(step3Problem({ doorstep: true, doorstepRadiusKm: '50', bays: '', jobsPerDay: '' })).toBeNull();
  expect(step3Problem({ doorstep: false, doorstepRadiusKm: '500', bays: '', jobsPerDay: '' })).toBeNull();
});

test('step 3: working days toggle in order', () => {
  expect(toggleDay([0, 1, 2], 1)).toEqual([0, 2]);
  expect(toggleDay([0, 2], 1)).toEqual([0, 1, 2]);
  expect(toggleDay([], 6)).toEqual([6]);
});

test('step 3: the job-types call carries the radius only for doorstep with one given', () => {
  expect(step3JobTypes({ doorstep: false, doorstepRadiusKm: '12' })).toEqual({
    dropinEnabled: true,
    doorstepEnabled: false,
  });
  expect(step3JobTypes({ doorstep: true, doorstepRadiusKm: '' })).toEqual({ dropinEnabled: true, doorstepEnabled: true });
  expect(step3JobTypes({ doorstep: true, doorstepRadiusKm: '12' })).toEqual({
    dropinEnabled: true,
    doorstepEnabled: true,
    doorstepRadiusKm: 12,
  });
  expect(doorstepRadius({ doorstep: true, doorstepRadiusKm: ' ' })).toBeNull();
});

test('step 3: "All over <city>" goes instead of the radius, and only for doorstep (0069)', () => {
  expect(step3JobTypes({ doorstep: true, doorstepRadiusKm: '12', doorstepWholeCity: true })).toEqual({
    dropinEnabled: true,
    doorstepEnabled: true,
    doorstepWholeCity: true,
  });
  expect(step3JobTypes({ doorstep: false, doorstepRadiusKm: '', doorstepWholeCity: true })).toEqual({
    dropinEnabled: true,
    doorstepEnabled: false,
  });
});

test('step 3: capacity is sent only when something was typed', () => {
  expect(step3Settings({ bays: '', jobsPerDay: '' })).toBeNull();
  expect(step3Settings({ bays: '3', jobsPerDay: '' })).toEqual({ bays: 3 });
  expect(step3Settings({ bays: '', jobsPerDay: '25' })).toEqual({ jobsPerDay: 25 });
  expect(step3Settings({ bays: '3', jobsPerDay: '25' })).toEqual({ bays: 3, jobsPerDay: 25 });
});

test('step 4: eleven presets, and prices by pricing type', () => {
  expect(SERVICE_PRESETS).toHaveLength(11);
  const tiers = { hatchback: '300', sedan: '400', suv: '500' };
  expect(pricingComplete('flat', '300', { hatchback: '', sedan: '', suv: '' })).toBe(true);
  expect(pricingComplete('flat', '0', tiers)).toBe(false);
  expect(pricingComplete('per_vehicle', '', tiers)).toBe(true);
  expect(pricingComplete('per_vehicle', '300', { ...tiers, suv: '' })).toBe(false);
  expect(pricingComplete('on_inspection', '150', tiers)).toBe(true);
  // On inspection the fee is optional (0073); an approx price is empty or above ₹0.
  expect(pricingComplete('on_inspection', '', tiers)).toBe(true);
  expect(pricingComplete('on_inspection', '', tiers, '1500')).toBe(true);
  expect(pricingComplete('on_inspection', '', tiers, '0')).toBe(false);
});

test('step 4: an on-inspection service with no fee sends 0 and its approx price', () => {
  const form = {
    name: 'Denting',
    category: 'scratch_removal' as const,
    pricingType: 'on_inspection' as const,
    price: '',
    tiers: { hatchback: '', sedan: '', suv: '' },
    duration: 60,
    approx: '1500',
  };
  expect(serviceReady(form)).toBe(true);
  expect(serviceBody(form)).toEqual({
    name: 'Denting',
    category: 'scratch_removal',
    pricingType: 'on_inspection',
    durationMins: 60,
    price: 0,
    approxPrice: 1500,
  });
  expect(serviceBody({ ...form, price: '299', approx: '' })).toMatchObject({ price: 299, approxPrice: null });
});

test('step 4: the service body carries only the prices of its pricing type', () => {
  const form = {
    name: 'Full detailing',
    category: 'detailing' as const,
    pricingType: 'flat' as const,
    price: '1500',
    tiers: { hatchback: '1', sedan: '2', suv: '3' },
    duration: 90,
  };
  expect(serviceBody(form)).toEqual({
    name: 'Full detailing',
    category: 'detailing',
    pricingType: 'flat',
    durationMins: 90,
    price: 1500,
  });
  expect(serviceBody({ ...form, pricingType: 'per_vehicle', price: '' })).toEqual({
    name: 'Full detailing',
    category: 'detailing',
    pricingType: 'per_vehicle',
    durationMins: 90,
    priceHatchback: 1,
    priceSedan: 2,
    priceSuv: 3,
  });
  expect(serviceReady(form)).toBe(true);
  expect(serviceReady({ ...form, name: '' })).toBe(false);
  expect(serviceReady({ ...form, price: '' })).toBe(false);
});

test('step 4: vehicle types toggle, and the count reads right', () => {
  expect(toggleVehicleType(['Sedan'], 'SUV / MUV')).toEqual(['Sedan', 'SUV / MUV']);
  expect(toggleVehicleType(['Sedan'], 'Sedan')).toEqual([]);
  expect(addedText(1)).toBe('1 service added.');
  expect(addedText(2)).toBe('2 services added.');
});

test('step guards: step 2 needs step 1, steps 3 and 4 need the garage', () => {
  expect(stepGuard(1, { draft: EMPTY_DRAFT, hasGarage: false })).toBeNull();
  expect(stepGuard(2, { draft: EMPTY_DRAFT, hasGarage: false })).toBe(1);
  expect(stepGuard(2, { draft: filled, hasGarage: false })).toBeNull();
  expect(stepGuard(3, { draft: filled, hasGarage: false })).toBe(2);
  expect(stepGuard(4, { draft: EMPTY_DRAFT, hasGarage: false })).toBe(1);
  expect(stepGuard(3, { draft: EMPTY_DRAFT, hasGarage: true })).toBeNull();
  expect(stepGuard(4, { draft: EMPTY_DRAFT, hasGarage: true })).toBeNull();
});
