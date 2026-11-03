/// <reference types="bun" />
import { expect, test } from 'bun:test';

import type { Service, ServicePackage } from '@repo/core/types';

import {
  canSubmitPackage,
  canSubmitService,
  emptyPackageForm,
  emptyServiceForm,
  formFromPackage,
  formFromService,
  hasValidPricing,
  packagePayload,
  packagePreview,
  sanitizeDecimal,
  sanitizeDigits,
  selectableServices,
  servicePayload,
  splitFigures,
  toggleId,
} from './service-form';

const svc = (over: Partial<Service> = {}): Service => ({
  id: 's1',
  vendorId: 'v1',
  name: 'Wash',
  description: null,
  category: 'car_wash',
  pricingType: 'flat',
  price: 300,
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  durationMins: 30,
  isActive: true,
  images: [],
  media: [],
  ...over,
});

test('the forms start as the web starts them: 30 min for a service, 60 for a package, Flat, Car wash', () => {
  expect(emptyServiceForm).toMatchObject({ category: 'car_wash', pricingType: 'flat', durationMins: '30', price: '' });
  expect(emptyPackageForm).toMatchObject({ pricingType: 'flat', durationMins: '60', serviceIds: [] });
});

test('flat and on-inspection need one price above zero; per vehicle needs all three tiers', () => {
  expect(hasValidPricing({ ...emptyServiceForm, price: '' })).toBe(false);
  expect(hasValidPricing({ ...emptyServiceForm, price: '0' })).toBe(false);
  expect(hasValidPricing({ ...emptyServiceForm, price: '-5' })).toBe(false);
  expect(hasValidPricing({ ...emptyServiceForm, price: '300' })).toBe(true);
  expect(hasValidPricing({ ...emptyServiceForm, pricingType: 'on_inspection', price: '99.5' })).toBe(true);

  const perVehicle = { ...emptyServiceForm, pricingType: 'per_vehicle' as const };
  expect(hasValidPricing({ ...perVehicle, price: '300' })).toBe(false);
  expect(hasValidPricing({ ...perVehicle, priceHatchback: '300', priceSedan: '400' })).toBe(false);
  expect(hasValidPricing({ ...perVehicle, priceHatchback: '300', priceSedan: '400', priceSuv: '0' })).toBe(false);
  expect(hasValidPricing({ ...perVehicle, priceHatchback: '300', priceSedan: '400', priceSuv: '500' })).toBe(true);
});

test('Add service waits for a name and valid pricing, nothing else', () => {
  expect(canSubmitService({ ...emptyServiceForm, price: '300' })).toBe(false);
  expect(canSubmitService({ ...emptyServiceForm, name: 'Wash' })).toBe(false);
  expect(canSubmitService({ ...emptyServiceForm, name: 'Wash', price: '300' })).toBe(true);
  expect(canSubmitService({ ...emptyServiceForm, name: 'Wash', price: '300', durationMins: '' })).toBe(true);
});

test('Create package needs a name, two services, pricing and a duration', () => {
  const ok = { ...emptyPackageForm, name: 'Combo', serviceIds: ['a', 'b'], price: '500' };
  expect(canSubmitPackage(ok)).toBe(true);
  expect(canSubmitPackage({ ...ok, name: '   ' })).toBe(false);
  expect(canSubmitPackage({ ...ok, serviceIds: ['a'] })).toBe(false);
  expect(canSubmitPackage({ ...ok, price: '' })).toBe(false);
  expect(canSubmitPackage({ ...ok, durationMins: '' })).toBe(false);
  expect(canSubmitPackage({ ...ok, durationMins: '0' })).toBe(false);
});

test('payloads send positive prices only, as numbers', () => {
  const flat = servicePayload({ ...emptyServiceForm, name: 'Wash', price: '300', priceSedan: '0' });
  expect(flat).toMatchObject({ price: 300, priceSedan: undefined, priceHatchback: undefined, durationMins: 30 });
  const pkg = packagePayload({ ...emptyPackageForm, name: 'Combo', serviceIds: ['a', 'b'], price: '499.5' });
  expect(pkg).toMatchObject({ price: 499.5, durationMins: 60, serviceIds: ['a', 'b'] });
});

test('Edit fills the form from the row: the price box only for flat and on inspection, an unset duration stays empty', () => {
  expect(formFromService(svc({ description: 'Foam wash' }))).toMatchObject({
    name: 'Wash',
    description: 'Foam wash',
    price: '300',
    durationMins: '30',
  });
  const tiered = formFromService(
    svc({ pricingType: 'per_vehicle', price: 300, priceHatchback: 300, priceSedan: 400, priceSuv: 500, durationMins: null })
  );
  expect(tiered).toMatchObject({ price: '', priceHatchback: '300', priceSedan: '400', priceSuv: '500', durationMins: '' });

  const pkg = {
    ...svc({ id: 'p1', name: 'Combo', category: 'package' }),
    items: [
      { serviceId: 'a', name: 'A', price: 1, durationMins: 10, isActive: true },
      { serviceId: 'b', name: 'B', price: 2, durationMins: 10, isActive: true },
    ],
    itemsTotal: 3,
    savings: null,
    tierBreakdown: null,
    hasInactiveItems: false,
  } as ServicePackage;
  expect(formFromPackage(pkg).serviceIds).toEqual(['a', 'b']);
});

test('ticking a service twice unticks it', () => {
  expect(toggleId([], 'a')).toEqual(['a']);
  expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
});

test('only active services can go in a package', () => {
  expect(selectableServices([svc({ id: 'a' }), svc({ id: 'b', isActive: false })]).map((s) => s.id)).toEqual(['a']);
});

test('the package preview: bought separately, what customers save, and the minutes the services add up to', () => {
  const a = svc({ id: 'a', price: 300, durationMins: 30 });
  const b = svc({ id: 'b', price: 500, durationMins: null });
  const preview = packagePreview([a, b], { ...emptyPackageForm, price: '650' });
  expect(preview).toEqual({ itemsTotal: 800, previewPrice: 650, previewSavings: 150, suggestedDuration: 90 });
});

test('a package priced at or above the total shows no saving (the preview then asks for a lower price), and so does one with no price yet', () => {
  const a = svc({ id: 'a', price: 300 });
  const b = svc({ id: 'b', price: 500 });
  expect(packagePreview([a, b], { ...emptyPackageForm, price: '800' }).previewSavings).toBe(0);
  expect(packagePreview([a, b], { ...emptyPackageForm, price: '900' }).previewSavings).toBeLessThanOrEqual(0);
  expect(packagePreview([a, b], { ...emptyPackageForm, price: '' }).previewSavings).toBe(0);
});

test('a per-vehicle package is compared at its cheapest tier', () => {
  const a = svc({ id: 'a', price: 300 });
  const b = svc({ id: 'b', price: 500 });
  const form = { ...emptyPackageForm, pricingType: 'per_vehicle' as const, priceHatchback: '600', priceSedan: '700', priceSuv: '' };
  expect(packagePreview([a, b], form)).toMatchObject({ previewPrice: 600, previewSavings: 200 });
  const none = { ...emptyPackageForm, pricingType: 'per_vehicle' as const };
  expect(packagePreview([a, b], none).previewSavings).toBe(0);
});

test('keypad text: digits and one point; a comma decimal reads as a point', () => {
  expect(sanitizeDecimal('99,5')).toBe('99.5');
  expect(sanitizeDecimal('1.2.3')).toBe('1.23');
  expect(sanitizeDecimal('₹ 4a0')).toBe('40');
  expect(sanitizeDigits('4.5 min')).toBe('45');
});

test('price labels are split into words and figures, as the web sets them in the numeric face', () => {
  expect(splitFigures('₹599')).toEqual([{ text: '₹599', figure: true }]);
  expect(splitFigures('₹500 inspection')).toEqual([
    { text: '₹500', figure: true },
    { text: ' inspection', figure: false },
  ]);
  expect(splitFigures('from ₹599').map((p) => p.text)).toEqual(['from ', '₹599']);
  expect(splitFigures('₹300–₹500')).toEqual([{ text: '₹300–₹500', figure: true }]);
  expect(splitFigures('Price on request')).toEqual([{ text: 'Price on request', figure: false }]);
});
