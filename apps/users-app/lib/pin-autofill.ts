/**
 * Refilling an address form from a map pin (apps/users/components/pin-autofill.ts): text the
 * previous pin filled in follows the new one; text the customer typed is theirs and stays.
 */
export interface PinText {
  address: string;
  city: string;
}

export const NO_PIN_TEXT: PinText = { address: '', city: '' };

export function refillFromPin<F extends PinText>(form: F, picked: PinText, previous: PinText): F {
  const untouched = (value: string, filled: string) => !value || value === filled;
  return {
    ...form,
    address: untouched(form.address, previous.address) ? picked.address : form.address,
    city: untouched(form.city, previous.city) ? picked.city : form.city,
  };
}
