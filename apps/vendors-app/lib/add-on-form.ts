import { ADD_ON_LIMITS } from '@repo/core/add-ons';
import type { AddOn, AddOnInput } from '@repo/core/api/add-ons';

/**
 * The add-on form (apps/vendors/app/services/add-on-sheet.tsx): the service form's labels, in a
 * sheet. No category, description, photos or On inspection. Pure, so each rule is a test.
 */
export interface AddOnForm {
  name: string;
  pricingType: 'flat' | 'per_vehicle';
  price: string;
  priceHatchback: string;
  priceSedan: string;
  priceSuv: string;
  extraMins: string;
  isActive: boolean;
}

export function formFromAddOn(addOn: AddOn | null): AddOnForm {
  const text = (value: number | null) => (value === null ? '' : String(value));
  return {
    name: addOn?.name ?? '',
    pricingType: addOn?.pricingType ?? 'flat',
    price: addOn?.pricingType === 'flat' ? String(addOn.price) : '',
    priceHatchback: text(addOn?.priceHatchback ?? null),
    priceSedan: text(addOn?.priceSedan ?? null),
    priceSuv: text(addOn?.priceSuv ?? null),
    // 0 is left empty: the form's own word for no extra time.
    extraMins: addOn && addOn.extraMins > 0 ? String(addOn.extraMins) : '',
    isActive: addOn?.isActive ?? true,
  };
}

export function addOnReady(form: AddOnForm): boolean {
  if (!form.name.trim()) return false;
  const mins = form.extraMins.trim();
  if (mins !== '' && !(Number.isInteger(Number(mins)) && Number(mins) >= 0 && Number(mins) <= ADD_ON_LIMITS.extraMins)) {
    return false;
  }
  return form.pricingType === 'per_vehicle'
    ? [form.priceHatchback, form.priceSedan, form.priceSuv].every((p) => Number(p) > 0)
    : Number(form.price) > 0;
}

export function addOnInput(form: AddOnForm): AddOnInput {
  return {
    name: form.name.trim(),
    pricingType: form.pricingType,
    ...(form.pricingType === 'flat'
      ? { price: Number(form.price) }
      : {
          priceHatchback: Number(form.priceHatchback),
          priceSedan: Number(form.priceSedan),
          priceSuv: Number(form.priceSuv),
        }),
    extraMins: form.extraMins.trim() === '' ? null : Number(form.extraMins),
    isActive: form.isActive,
  };
}

/** Whether a failed read means the server has no add-on routes at all (an older API): no section then. */
export const routesMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;

export const ADD_ONS_INTRO = "Small extras that go with any of your services. Customers can't book them alone.";
export const ADD_ON_DELETE_BODY =
  "Customers can't add it any more, and it can't be undone. Past bookings keep it. To stop it for a while, Disable it instead.";
