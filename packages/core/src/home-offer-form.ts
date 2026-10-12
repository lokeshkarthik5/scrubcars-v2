/**
 * The rules behind the discount form's "Show on Home" section that are worth
 * testing without a browser: which "Who sees it" options can be picked, and
 * where a refusal from the server is shown.
 *
 * The audiences and whether targeted ones can be saved come from the server
 * (`GET /admin/discounts/home-config`); this decides how the form presents
 * them. Display targeting only: none of it changes who may type the code at
 * checkout, so none of the copy says it does.
 */
import type { HomeAudience, HomeConfig } from './api/admin'
import { bannedPhraseIn } from './copy-rules'

/** The garage audiences: they need the code to be for one garage. */
export const GARAGE_AUDIENCES: readonly HomeAudience[] = ['booked_this_garage', 'near_this_garage']

/** The form's wording, as the approved design has it. */
export const AUDIENCE_LABELS: Record<HomeAudience, string> = {
  everyone: 'Everyone',
  new_customers: 'New customers (no paid booking yet)',
  booked_this_garage: 'Customers who booked this garage before',
  near_this_garage: 'Customers near this garage',
  wash_due: 'Customers whose wash is due or overdue',
  car_type: 'By car type',
}

export const CAR_TYPE_OPTIONS = [
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'sedan', label: 'Sedan' },
  // One pricing tier, one picture: "SUV / MUV" everywhere in the product.
  { value: 'suv', label: 'SUV / MUV' },
] as const

export type CarTypeValue = (typeof CAR_TYPE_OPTIONS)[number]['value']

export interface AudienceOption {
  value: HomeAudience
  label: string
  /** A line under the label, when there is something to say. */
  hint: string | null
  disabled: boolean
  /** 'targeting' while the server refuses targeted audiences; 'garage' with no garage picked. */
  disabledBy: 'targeting' | 'garage' | null
}

/**
 * "Who sees it", in the server's order. With targeting off every option but
 * Everyone is disabled (the form shows the server's note once, under the
 * list). The garage audiences are disabled until a garage is picked, and only
 * then say "Pick a garage above": while targeting is off, picking one changes
 * nothing, so the hint would send the admin the wrong way.
 */
export function audienceOptions(config: Pick<HomeConfig, 'audiences'>, vendorId: string): AudienceOption[] {
  return config.audiences.map((audience) => {
    const needsGarage = GARAGE_AUDIENCES.includes(audience.value)
    const disabledBy = !audience.enabled ? 'targeting' : needsGarage && !vendorId ? 'garage' : null
    let hint: string | null = null
    if (audience.value === 'everyone') {
      hint = "Every signed-in customer. A garage's offer only shows to customers with a car saved."
    } else if (disabledBy === 'garage') {
      hint = 'Pick a garage above'
    }
    return {
      value: audience.value,
      label: AUDIENCE_LABELS[audience.value] ?? audience.label,
      hint,
      disabled: disabledBy !== null,
      disabledBy,
    }
  })
}

/**
 * The audience the form can save as it stands, or a reason it cannot: a
 * garage audience with the garage cleared, or a targeted one chosen now
 * while targeting is off. A targeted audience saved earlier is kept (the
 * server allows sending it back unchanged), so editing its title still works.
 */
export function audienceProblem(input: {
  audience: HomeAudience
  storedAudience: HomeAudience | null
  vendorId: string
  targetingEnabled: boolean
  radiusKm: string
  maxRadiusKm: number
  vehicleTypes: readonly string[]
}): string | null {
  if (!input.targetingEnabled && input.audience !== 'everyone' && input.audience !== input.storedAudience) {
    return 'Only "Everyone" can be chosen while targeted offers are switched off.'
  }
  if (GARAGE_AUDIENCES.includes(input.audience) && !input.vendorId) {
    return 'Pick a garage above, or choose another audience.'
  }
  if (input.audience === 'near_this_garage') {
    const km = Number(input.radiusKm)
    if (!Number.isInteger(km) || km < 1 || km > input.maxRadiusKm) {
      return `Pick a distance from 1 to ${input.maxRadiusKm} km.`
    }
  }
  if (input.audience === 'car_type' && input.vehicleTypes.length === 0) {
    return 'Pick at least one car type.'
  }
  return null
}

/**
 * The title to send on save. While the code is shown on Home, the form blocks
 * a short or banned title before it gets here. While it is not, a title is
 * still stored for next time, but only one the server would accept: it checks
 * the words of any title, shown or not, and a refusal about a field that is
 * folded away would leave the admin with a Save that does nothing.
 */
export function homeTitleForSave(title: string, showOnHome: boolean): string | null {
  const trimmed = title.trim()
  if (trimmed.length < 3) return null
  if (!showOnHome && bannedPhraseIn(trimmed)) return null
  return trimmed
}

/** Where on the form a refusal is shown. */
export type HomeErrorTarget = 'title' | 'audience' | 'section'

/**
 * A save the server refused because of the Show on Home settings, placed
 * beside the field it is about. Null for any other error, which the form
 * shows by its Save button as before.
 */
export function homeFieldError(error: {
  code?: string
  message: string
}): { target: HomeErrorTarget; message: string } | null {
  switch (error.code) {
    case 'COPY_NOT_ALLOWED':
      // "Offer titles can't say "guaranteed". Describe what the code gives, plainly."
      return { target: 'title', message: error.message }
    case 'TARGETING_DISABLED':
      return {
        target: 'audience',
        message: `Only "Everyone" can be saved right now. ${error.message}`,
      }
    // DISCOUNT_INVALID is a CHECK the merged-row rules missed: still about
    // these settings, so it is shown with them.
    case 'DISCOUNT_HOME_INVALID':
    case 'DISCOUNT_INVALID':
      return { target: 'section', message: error.message }
    default:
      return null
  }
}

/**
 * Where a refused save is said, given whether the Show on Home section is
 * open. A refusal goes beside its field when that field is on screen, with a
 * short pointer by Save, which on a phone sits below the preview and well
 * away from it. When the field is folded away (the title and "Who sees it"
 * only render while the switch is on), the whole message goes by Save, so a
 * failed save is never silent. The section-wide slot is always drawn.
 */
export function homeErrorPlacement(
  placed: { target: HomeErrorTarget; message: string } | null,
  sectionOpen: boolean
): { inPlace: HomeErrorTarget | null; bySave: string | null } {
  if (!placed) return { inPlace: null, bySave: null }
  if (placed.target === 'section' || sectionOpen) {
    return { inPlace: placed.target, bySave: 'Not saved: see Show on Home above.' }
  }
  return { inPlace: null, bySave: placed.message }
}
