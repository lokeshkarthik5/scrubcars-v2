import type { PricingType, ServiceCategory } from '@repo/core/types';

import { DAYS, MAX_BAYS, SLOT_INTERVALS } from './settings-logic';

/**
 * The pure parts of the first-garage wizard (apps/vendors/app/onboarding/step-1..4, the draft in
 * packages/core/src/stores/vendor-onboarding-store.ts, and submitVendorOnboarding in
 * packages/core/src/api/vendors.ts): the draft's shape, each step's rules and request bodies,
 * and which step a person may be on. Kept free of react-native so `bun test` can load it.
 */
export { DAYS, MAX_BAYS, SLOT_INTERVALS };

export type OnboardingStep = 1 | 2 | 3 | 4;
export const STEPS: OnboardingStep[] = [1, 2, 3, 4];
export const stepPath = (step: OnboardingStep) => `/onboarding/step-${step}` as const;

/** The route's `step` param ("step-3") as a step, or null for anything else. */
export function parseStep(param: string | string[] | undefined): OnboardingStep | null {
  const value = Array.isArray(param) ? param[0] : param;
  const match = /^step-([1-4])$/.exec(value ?? '');
  return match ? (Number(match[1]) as OnboardingStep) : null;
}

/** One progress step is a quarter of the bar. */
export const progressFor = (step: OnboardingStep) => step * 25;

export const YEARS_OPTIONS = ['Under 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years'];

// The server's bounds (1 to 300 km since the 30 km top was lifted), from the
// shared twin so the app, the portal and the API never disagree.
export { MIN_DOORSTEP_RADIUS_KM as MIN_RADIUS_KM, MAX_DOORSTEP_RADIUS_KM as MAX_RADIUS_KM } from '@repo/core/doorstep';
import { MAX_DOORSTEP_RADIUS_KM as MAX_RADIUS_KM, MIN_DOORSTEP_RADIUS_KM as MIN_RADIUS_KM } from '@repo/core/doorstep';

export interface OnboardingDraft {
  businessName: string;
  ownerName: string;
  city: string;
  /** The verified number, 10 digits. Whose draft this is. */
  phone: string;
  whatsapp: string;
  email: string;
  yearsInOperation: string;
  address: string;
  pincode: string;
  mapsUrl: string;
  /** Null until the owner pins the garage on the map in step 2. */
  lat: number | null;
  lng: number | null;
  geoSource: 'gps' | 'map_pin';
  /** The garage step 2 made, so a retry after a failed reload never makes a second one. */
  vendorId: string | null;
  dropin: boolean;
  doorstep: boolean;
  /** How far the garage travels for doorstep jobs, as typed. Empty means the default. */
  doorstepRadiusKm: string;
  /** "All over <city>" (0069), chosen instead of a radius. */
  doorstepWholeCity?: boolean;
  bays: string;
  jobsPerDay: string;
  slotInterval: 30 | 45 | 60;
  workingDays: number[];
  openTime: string;
  closeTime: string;
  vehicleTypes: string[];
}

export const EMPTY_DRAFT: OnboardingDraft = {
  businessName: '',
  ownerName: '',
  city: '',
  phone: '',
  whatsapp: '',
  email: '',
  yearsInOperation: '',
  address: '',
  pincode: '',
  mapsUrl: '',
  lat: null,
  lng: null,
  geoSource: 'map_pin',
  vendorId: null,
  dropin: true,
  doorstep: false,
  doorstepRadiusKm: '',
  bays: '',
  jobsPerDay: '',
  slotInterval: 30,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  openTime: '09:00',
  closeTime: '18:00',
  vehicleTypes: [],
};

/** The 10 digits of the signed-in number, however the account holds it ("+919000000098" too). */
export function phoneDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** A draft belongs to the number that started it; another number starts empty. */
export function draftFor(draft: OnboardingDraft, phone: string): OnboardingDraft {
  return draft.phone && phone && draft.phone !== phone ? { ...EMPTY_DRAFT } : draft;
}

/* ---------- Step 1: business info ---------- */

export const step1Complete = (d: Pick<OnboardingDraft, 'businessName' | 'ownerName' | 'city'>) =>
  d.businessName.trim() !== '' && d.ownerName.trim() !== '' && d.city.trim() !== '';

/* ---------- Step 2: garage location ---------- */

export const pincodeValid = (pincode: string) => /^\d{6}$/.test(pincode);

export const NO_PIN_TOAST = 'Set your garage location on the map';
export const BAD_PINCODE_TOAST = 'Enter a valid 6-digit pincode';

/** What stops Continue on step 2, in the toast's words, or null. */
export function step2Problem(input: { hasPin: boolean; pincode: string }): string | null {
  if (!input.hasPin) return NO_PIN_TOAST;
  if (!pincodeValid(input.pincode)) return BAD_PINCODE_TOAST;
  return null;
}

/** Continue on step 2 needs the pin, an address, a city and a 6-digit pincode. */
export const step2Ready = (input: { hasPin: boolean; address: string; city: string; pincode: string }) =>
  input.hasPin && input.address.trim() !== '' && input.city.trim() !== '' && pincodeValid(input.pincode);

/** The map's placement prefills the form: the address only where empty, the city and pincode where it found one. */
export function prefillFromPin(
  current: { address: string; pincode: string; city: string },
  picked: { address: string; pincode: string; city: string }
) {
  return {
    address: picked.address && !current.address.trim() ? picked.address : current.address,
    pincode: picked.pincode || current.pincode,
    city: picked.city || current.city,
  };
}

/** POST /vendors: empty optional fields are left out, as submitVendorOnboarding(2) does. */
export function createVendorBody(draft: OnboardingDraft & { lat: number; lng: number }) {
  return {
    businessName: draft.businessName,
    phone: draft.phone,
    address: draft.address,
    city: draft.city,
    pincode: draft.pincode,
    lat: draft.lat,
    lng: draft.lng,
    geoSource: draft.geoSource,
    whatsapp: draft.whatsapp || undefined,
    email: draft.email || undefined,
    yearsInOperation: draft.yearsInOperation || undefined,
    mapsUrl: draft.mapsUrl || undefined,
  };
}

/* ---------- Step 3: garage setup ---------- */

export type ServiceMode = 'garage' | 'doorstep';

export const radiusProblem = (doorstep: boolean, radiusKm: string): string | null => {
  if (!doorstep || radiusKm.trim() === '') return null;
  const radius = Number(radiusKm);
  return !Number.isFinite(radius) || radius < MIN_RADIUS_KM || radius > MAX_RADIUS_KM
    ? `Enter how far you'll go, from ${MIN_RADIUS_KM} to ${MAX_RADIUS_KM} km, or leave it empty.`
    : null;
};

export const baysProblem = (bays: string): string | null => {
  if (bays.trim() === '') return null;
  const count = Number(bays);
  return !Number.isInteger(count) || count < 1 || count > MAX_BAYS
    ? `Cars at the same time must be between 1 and ${MAX_BAYS}.`
    : null;
};

export const jobsProblem = (jobsPerDay: string): string | null => {
  if (jobsPerDay.trim() === '') return null;
  const jobs = Number(jobsPerDay);
  return !Number.isInteger(jobs) || jobs < 1 ? 'Jobs in a day must be 1 or more, or left blank.' : null;
};

/** Continue on step 3 is disabled while any of these shows. */
export const step3Problem = (d: Pick<OnboardingDraft, 'doorstep' | 'doorstepRadiusKm' | 'bays' | 'jobsPerDay'>) =>
  radiusProblem(d.doorstep, d.doorstepRadiusKm) ?? baysProblem(d.bays) ?? jobsProblem(d.jobsPerDay);

export const toggleDay = (days: number[], day: number) =>
  days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);

/** The doorstep radius as the API takes it: a number, or null for the default. */
export const doorstepRadius = (d: Pick<OnboardingDraft, 'doorstep' | 'doorstepRadiusKm'>): number | null =>
  d.doorstep && d.doorstepRadiusKm.trim() !== '' ? Number(d.doorstepRadiusKm) : null;

/**
 * PATCH /vendors/me/job-types: doorstep and its distance land in one call.
 * "All over <city>" (0069) is sent only when chosen, so an older API never
 * sees it; the radius then is not sent at all.
 */
export function step3JobTypes(d: Pick<OnboardingDraft, 'doorstep' | 'doorstepRadiusKm' | 'doorstepWholeCity'>) {
  const wholeCity = d.doorstep && d.doorstepWholeCity === true;
  const radius = wholeCity ? null : doorstepRadius(d);
  return {
    dropinEnabled: true,
    doorstepEnabled: d.doorstep,
    ...(d.doorstep && radius != null ? { doorstepRadiusKm: radius } : {}),
    ...(wholeCity ? { doorstepWholeCity: true } : {}),
  };
}

/**
 * PATCH /vendors/me for capacity. PATCH /vendors/me rejects an empty body, so a blank pair of
 * boxes sends nothing at all (null here).
 */
export function step3Settings(d: Pick<OnboardingDraft, 'bays' | 'jobsPerDay'>) {
  const settings = {
    ...(d.bays.trim() !== '' ? { bays: Number(d.bays) } : {}),
    ...(d.jobsPerDay.trim() !== '' ? { jobsPerDay: Number(d.jobsPerDay) } : {}),
  };
  return Object.keys(settings).length > 0 ? settings : null;
}

/* ---------- Step 4: services and vehicles ---------- */

export const SERVICE_PRESETS: { name: string; category: ServiceCategory }[] = [
  { name: 'Exterior / foam wash', category: 'car_wash' },
  { name: 'Interior cleaning & vacuum', category: 'detailing' },
  { name: 'Full detailing', category: 'detailing' },
  { name: 'Ceramic / paint protection', category: 'coating' },
  { name: 'Polishing & buffing', category: 'detailing' },
  { name: 'Denting & painting', category: 'scratch_removal' },
  { name: 'General / periodic service', category: 'others' },
  { name: 'AC service & repair', category: 'others' },
  { name: 'Battery service', category: 'others' },
  { name: 'Windshield & glass', category: 'others' },
  { name: 'EV servicing', category: 'others' },
];

export const DURATIONS = [30, 45, 60, 90, 120, 180];

export interface ServiceFormInput {
  name: string;
  category: ServiceCategory;
  pricingType: PricingType;
  price: string;
  tiers: { hatchback: string; sedan: string; suv: string };
  duration: number;
}

export const EMPTY_TIERS = { hatchback: '', sedan: '', suv: '' };

/** Complete when the chosen pricing type has the price(s) it needs, the server's own rule. */
export const pricingComplete = (pricingType: PricingType, price: string, tiers: ServiceFormInput['tiers']) =>
  pricingType === 'per_vehicle'
    ? [tiers.hatchback, tiers.sedan, tiers.suv].every((p) => Number(p) > 0)
    : Number(price) > 0;

/** "Add service" is enabled with a name and the prices it needs. */
export const serviceReady = (form: ServiceFormInput) =>
  form.name !== '' && pricingComplete(form.pricingType, form.price, form.tiers);

/** The body of createService. */
export function serviceBody(form: ServiceFormInput) {
  return {
    name: form.name,
    category: form.category,
    pricingType: form.pricingType,
    durationMins: form.duration,
    ...(form.pricingType === 'per_vehicle'
      ? {
          priceHatchback: Number(form.tiers.hatchback),
          priceSedan: Number(form.tiers.sedan),
          priceSuv: Number(form.tiers.suv),
        }
      : { price: Number(form.price) }),
  };
}

export const toggleVehicleType = (types: string[], type: string) =>
  types.includes(type) ? types.filter((t) => t !== type) : [...types, type];

/** "3 services added." */
export const addedText = (count: number) => `${count} service${count === 1 ? '' : 's'} added.`;

/* ---------- Where a person may be ---------- */

/**
 * Which step a person is sent to instead, or null to stay. Step 2 needs step 1's answers (they
 * are the garage being made), and steps 3 and 4 need the garage step 2 made.
 */
export function stepGuard(
  step: OnboardingStep,
  state: { draft: Pick<OnboardingDraft, 'businessName' | 'ownerName' | 'city'>; hasGarage: boolean }
): OnboardingStep | null {
  if (step === 2 && !step1Complete(state.draft)) return 1;
  if ((step === 3 || step === 4) && !state.hasGarage) return step1Complete(state.draft) ? 2 : 1;
  return null;
}
