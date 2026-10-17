/**
 * Saving a garage while signed out: the heart sends the customer to sign in
 * with `next` set to the garage's page and `save=1`, and the garage page
 * saves it once they are back, then takes the flag out of the URL so a
 * reload or Back does not save it again.
 */

export const SAVE_PARAM = 'save'

/** Where sign-in returns to: the garage, asking for the heart to be saved. */
export function saveGarageReturnPath(vendorId: string): string {
  return `/garage/${vendorId}?${SAVE_PARAM}=1`
}

/**
 * The garage page's URL with the save flag taken out, everything else (the
 * mode, an offer code) kept. `search` is location.search.
 */
export function withoutSaveFlag(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete(SAVE_PARAM)
  const rest = params.toString()
  return rest ? `${pathname}?${rest}` : pathname
}
