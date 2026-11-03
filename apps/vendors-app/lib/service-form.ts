import { effectiveDurationMins } from '@repo/core/service-duration';
import type { PricingType, Service, ServiceCategory, ServicePackage } from '@repo/core/types';

/**
 * The service and package forms of apps/vendors/app/services (page.tsx and
 * packages-panel.tsx), as plain data: what the boxes hold, when "Add service" is
 * allowed, what is sent and what the live package preview says. Pure, so each rule
 * is a test. Every figure is text while it is typed, as on the web.
 */

export interface PricingFields {
  pricingType: PricingType;
  price: string;
  priceHatchback: string;
  priceSedan: string;
  priceSuv: string;
  durationMins: string;
}

export interface ServiceForm extends PricingFields {
  name: string;
  description: string;
  category: ServiceCategory;
}

export interface PackageForm extends PricingFields {
  name: string;
  description: string;
  serviceIds: string[];
}

export const emptyServiceForm: ServiceForm = {
  name: '',
  description: '',
  category: 'car_wash',
  pricingType: 'flat',
  price: '',
  priceHatchback: '',
  priceSedan: '',
  priceSuv: '',
  durationMins: '30',
};

export const emptyPackageForm: PackageForm = {
  name: '',
  description: '',
  pricingType: 'flat',
  price: '',
  priceHatchback: '',
  priceSedan: '',
  priceSuv: '',
  durationMins: '60',
  serviceIds: [],
};

/**
 * A form's pricing block is valid to submit when the right price(s) are present for
 * the chosen pricing type. Per vehicle needs every tier, matching the server: a gap
 * would leave that vehicle unable to book (refinePricing in vendors.validation.ts).
 */
export function hasValidPricing(form: PricingFields): boolean {
  if (form.pricingType === 'per_vehicle') {
    return [form.priceHatchback, form.priceSedan, form.priceSuv].every((p) => Number(p) > 0);
  }
  return Number(form.price) > 0;
}

/** "Add service" / "Update service": a name and valid pricing (the web checks no more). */
export function canSubmitService(form: ServiceForm): boolean {
  return Boolean(form.name) && hasValidPricing(form);
}

/** "Create package" / "Update package". */
export function canSubmitPackage(form: PackageForm): boolean {
  return (
    form.name.trim().length > 0 &&
    form.serviceIds.length >= 2 &&
    hasValidPricing(form) &&
    Number(form.durationMins) > 0
  );
}

const positive = (value: string) => (Number(value) > 0 ? Number(value) : undefined);

export function servicePayload(form: ServiceForm) {
  return {
    name: form.name,
    description: form.description,
    category: form.category,
    pricingType: form.pricingType,
    price: positive(form.price),
    priceHatchback: positive(form.priceHatchback),
    priceSedan: positive(form.priceSedan),
    priceSuv: positive(form.priceSuv),
    durationMins: Number(form.durationMins),
  };
}

export function packagePayload(form: PackageForm) {
  return {
    name: form.name,
    description: form.description,
    pricingType: form.pricingType,
    price: positive(form.price),
    priceHatchback: positive(form.priceHatchback),
    priceSedan: positive(form.priceSedan),
    priceSuv: positive(form.priceSuv),
    durationMins: Number(form.durationMins),
    serviceIds: form.serviceIds,
  };
}

type Priced = Pick<
  Service,
  'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv' | 'durationMins' | 'name' | 'description'
>;

function pricingFrom(item: Priced): PricingFields {
  return {
    pricingType: item.pricingType,
    price: item.pricingType === 'flat' || item.pricingType === 'on_inspection' ? String(item.price) : '',
    priceHatchback: item.priceHatchback != null ? String(item.priceHatchback) : '',
    priceSedan: item.priceSedan != null ? String(item.priceSedan) : '',
    priceSuv: item.priceSuv != null ? String(item.priceSuv) : '',
    // Admin may leave a duration unset (0064): the box starts empty.
    durationMins: item.durationMins != null ? String(item.durationMins) : '',
  };
}

export function formFromService(svc: Service): ServiceForm {
  return {
    name: svc.name,
    description: svc.description ?? '',
    category: svc.category,
    ...pricingFrom(svc),
  };
}

export function formFromPackage(pkg: ServicePackage): PackageForm {
  return {
    name: pkg.name,
    description: pkg.description ?? '',
    ...pricingFrom(pkg),
    serviceIds: pkg.items.map((item) => item.serviceId),
  };
}

/** The same service ids, ticked on or off. */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

export interface PackagePreview {
  itemsTotal: number;
  previewPrice: number;
  previewSavings: number;
  suggestedDuration: number;
}

/**
 * The live preview under the package builder, from the same base prices the server
 * uses so the badge here matches the badge there. A per-vehicle package is compared
 * at its cheapest tier. A member with no duration set holds the default 60 min (0064).
 */
export function packagePreview(selected: Service[], form: PricingFields): PackagePreview {
  const itemsTotal = selected.reduce((sum, s) => sum + s.price, 0);
  const previewPrice =
    form.pricingType === 'per_vehicle'
      ? Math.min(
          ...[form.priceHatchback, form.priceSedan, form.priceSuv]
            .map(Number)
            .filter((n) => n > 0)
        )
      : Number(form.price);
  const previewSavings = Number.isFinite(previewPrice) && previewPrice > 0 ? itemsTotal - previewPrice : 0;
  const suggestedDuration = selected.reduce((sum, s) => sum + effectiveDurationMins(s), 0);
  return { itemsTotal, previewPrice, previewSavings, suggestedDuration };
}

/** Only active services can be bundled: the server enforces it too. */
export function selectableServices(services: Service[]): Service[] {
  return services.filter((s) => s.isActive);
}

/** A price box on a phone keypad: digits and at most one point ("99,5" reads as "99.5"). */
export function sanitizeDecimal(text: string): string {
  const cleaned = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const point = cleaned.indexOf('.');
  return point === -1 ? cleaned : cleaned.slice(0, point + 1) + cleaned.slice(point + 1).replace(/\./g, '');
}

/** The duration box: whole minutes only. */
export function sanitizeDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * packages/ui/src/sc/figures.tsx: a label split into runs of words and runs of figures
 * ("from ₹599", "₹399–₹7999"), the figures set in the numeric face.
 */
const FIGURES = /(₹?\d[\d,.]*(?:\s?[–-]\s?₹?\d[\d,.]*)?)/;

export function splitFigures(text: string): { text: string; figure: boolean }[] {
  return text
    .split(FIGURES)
    .map((part, index) => ({ text: part, figure: index % 2 === 1 }))
    .filter((part) => part.text !== '');
}
