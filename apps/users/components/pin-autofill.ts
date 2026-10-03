/**
 * Refilling an address form from a map pin.
 *
 * Every pin placement is reverse-geocoded, and a short drag can land on a
 * different street — so the text the previous pin filled in must follow the
 * new one, or the saved address and its coordinates disagree. Text the
 * customer typed is theirs and stays: a field counts as untouched while it is
 * empty or still holds exactly what the previous pin put there.
 */
export interface PinText {
  address: string
  city: string
}

export const NO_PIN_TEXT: PinText = { address: '', city: '' }

export function refillFromPin<T extends PinText>(
  form: T,
  picked: PinText,
  previous: PinText
): T {
  const untouched = (value: string, filled: string) =>
    !value || value === filled
  return {
    ...form,
    address: untouched(form.address, previous.address)
      ? picked.address
      : form.address,
    city: untouched(form.city, previous.city) ? picked.city : form.city,
  }
}
