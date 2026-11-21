import type { GarageLuxury, LuxuryApplication, SendLuxuryApplication } from '@repo/core/api/luxury'
import { dateKeyLabel } from '@repo/core/certification'
import { msg } from '@repo/core/i18n/translate'
import {
  canSendApplication,
  garageLuxuryScreen,
  LUXURY_BRANDS,
  type GarageLuxuryScreen,
  type LuxuryBrand,
  type LuxuryPhoto,
} from '@repo/core/luxury'

/**
 * Settings → Luxury car specialist (0083): the form's state and the screen's
 * choices, pure, so both garage apps (apps/vendors, apps/vendors-app)
 * decide them the same way. Type-only imports from the API module, so the
 * phone never loads its web upload code.
 */

export interface LuxuryForm {
  brands: LuxuryBrand[]
  photos: LuxuryPhoto[]
  /** Null until Yes or No is pressed. */
  coveredBay: boolean | null
  products: string
  staff: string
}

export const EMPTY_LUXURY_FORM: LuxuryForm = { brands: [], photos: [], coveredBay: null, products: '', staff: '' }

/** The form filled in from what was sent ("Edit application", "Asked for more"), or empty. */
export function formFromApplication(app: LuxuryApplication | null | undefined): LuxuryForm {
  if (!app) return EMPTY_LUXURY_FORM
  return {
    brands: [...app.brands],
    photos: app.photos.map((photo) => ({ url: photo.url, caption: photo.caption })),
    coveredBay: app.coveredBay,
    products: app.products ?? '',
    staff: app.staff ?? '',
  }
}

/** A brand chip pressed: on or off, kept in the form's order. */
export function toggleBrand(form: LuxuryForm, brand: LuxuryBrand): LuxuryForm {
  const chosen = new Set(form.brands)
  if (chosen.has(brand)) chosen.delete(brand)
  else chosen.add(brand)
  return { ...form, brands: LUXURY_BRANDS.filter((b) => chosen.has(b)) }
}

/** What PUT /vendors/me/luxury is sent, or null while Send for review is still grey. */
export function formPayload(form: LuxuryForm): SendLuxuryApplication | null {
  if (!canSendApplication(form) || form.coveredBay === null) return null
  return {
    brands: form.brands,
    photos: form.photos.map((photo) => ({ url: photo.url, caption: photo.caption?.trim() || null })),
    coveredBay: form.coveredBay,
    products: form.products.trim() || null,
    staff: form.staff.trim() || null,
  }
}

/**
 * The screen shown: the API's state (garageLuxuryScreen), or the form while
 * the garage edits an application under review or applies again after a
 * removal.
 */
export function shownScreen(data: GarageLuxury, editing: boolean): GarageLuxuryScreen {
  const screen = garageLuxuryScreen({
    silverOrGold: data.silverOrGold,
    status: data.application?.status ?? null,
    reapplyOn: data.reapplyOn,
  })
  if (editing && (screen === 'review' || (screen === 'removed' && data.silverOrGold))) return 'form'
  return screen
}

/** The Settings row's line under "Luxury car specialist". */
export function luxuryRowLine(data: GarageLuxury | undefined): { line: string; locked: boolean } {
  if (!data) return { line: msg('Apply for the badge. For Silver and Gold garages'), locked: false }
  const screen = garageLuxuryScreen({
    silverOrGold: data.silverOrGold,
    status: data.application?.status ?? null,
    reapplyOn: data.reapplyOn,
  })
  switch (screen) {
    case 'locked':
      return { line: msg('Reach Silver to apply'), locked: true }
    case 'review':
      return { line: msg('Under review'), locked: false }
    case 'more':
      return { line: msg('Detlio asked for more'), locked: false }
    case 'approved':
      return { line: msg("You're a Luxury car specialist"), locked: false }
    case 'hidden':
      return { line: msg('Badge hidden until you’re Silver again'), locked: false }
    case 'declined':
      return { line: msg('Declined'), locked: false }
    default:
      return { line: msg('Apply for the badge. For Silver and Gold garages'), locked: false }
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_MS = 330 * 60 * 1000

/** "20 Nov": the IST day of a moment. */
export function istShortDay(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const day = new Date(time + IST_MS)
  return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

/** "21 Dec 2026" from the API's IST date key. */
export const reapplyLabel = (dateKey: string) => dateKeyLabel(dateKey)
