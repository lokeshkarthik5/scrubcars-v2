import type { PricingType, ServiceCategory } from '@repo/core/types'

/**
 * Ready-made services for the admin garage editor's "Add from template".
 *
 * Most pilot garages sell the same handful of services, and typing the same
 * description for each one was the slowest part of setting a garage up. A
 * template is a draft row — name, category, a suggested duration, how it is
 * priced and a plain description — with no prices: every garage charges its
 * own, so the row arrives asking for them and cannot be saved without.
 *
 * The descriptions say what the service generally includes and nothing more:
 * no prices, no times (the duration is its own field), no claims the garage
 * may not live up to, and nothing a customer can't act on — they have no way
 * to reach a garage before booking, so never "ask the garage".
 * service-templates.test.ts holds every one to copy-rules, and the API's own
 * test holds them to the same rules as an AI-written description
 * (apps/server/src/lib/service-description.test.ts).
 *
 * In packages/core rather than the admin app so the garage onboarding's quick
 * picks can move onto the same list later. No imports beyond types, so the
 * server test can load this file directly.
 */
export interface ServiceTemplate {
  /** Stable, for React keys and tests. */
  key: string
  name: string
  category: Exclude<ServiceCategory, 'package'>
  /** What a typical garage takes; the admin changes it if theirs differs. */
  durationMins: number
  pricingType: PricingType
  description: string
}

export const SERVICE_TEMPLATES: readonly ServiceTemplate[] = [
  {
    key: 'foam-wash',
    name: 'Foam wash',
    category: 'car_wash',
    durationMins: 45,
    pricingType: 'per_vehicle',
    description:
      'Snow-foam pre-wash to lift road dirt, then a hand wash, wheels and tyres cleaned, and a microfibre dry. Exterior only.',
  },
  {
    key: 'body-wash',
    name: 'Body wash',
    category: 'car_wash',
    durationMins: 30,
    pricingType: 'per_vehicle',
    description:
      'Exterior rinse and shampoo wash, wheels and tyres cleaned, glass wiped and the body hand-dried. Interior not included.',
  },
  {
    key: 'full-wash',
    name: 'Full wash',
    category: 'car_wash',
    durationMins: 60,
    pricingType: 'per_vehicle',
    description:
      'Foam wash outside plus an interior clean: seats, mats and boot vacuumed, dashboard and door panels wiped, and glass cleaned inside and out.',
  },
  {
    key: 'interior-cleaning',
    name: 'Interior cleaning',
    // A wash-side service, as in the approved editor mockup: listed under
    // Car wash and found by customers there.
    category: 'car_wash',
    durationMins: 90,
    pricingType: 'per_vehicle',
    description:
      'Deep vacuum of seats, carpets, mats and boot, with the dashboard, console and door trims cleaned. Stain removal is not included.',
  },
  {
    key: 'ceramic-coating',
    name: 'Ceramic coating',
    category: 'coating',
    durationMins: 1440,
    pricingType: 'per_vehicle',
    description:
      'Paint washed, decontaminated and machine-polished, then a ceramic coating applied panel by panel and left to cure.',
  },
  {
    key: 'polishing',
    name: 'Polishing',
    category: 'detailing',
    durationMins: 180,
    pricingType: 'per_vehicle',
    description:
      'Machine polishing of the paint to reduce light swirl marks and dullness, finished with a coat of wax. Deep scratches may need more work.',
  },
  {
    key: 'engine-bay-cleaning',
    name: 'Engine bay cleaning',
    // Detailing since 16 Nov 2026 (was Others): degrease and dress is
    // detailing work, so its commission is detailing's.
    category: 'detailing',
    durationMins: 45,
    pricingType: 'flat',
    description:
      'Electrical parts covered, then the engine bay degreased and cleaned with low-pressure water, and the plastic and rubber parts dressed.',
  },
  {
    key: 'underbody-wash',
    name: 'Underbody wash',
    category: 'car_wash',
    durationMins: 30,
    pricingType: 'flat',
    description:
      'The underside of the car rinsed with high-pressure water to clear mud, sand and road grime from the chassis and wheel arches.',
  },
  {
    key: 'headlight-restoration',
    name: 'Headlight restoration',
    category: 'detailing',
    durationMins: 60,
    pricingType: 'flat',
    description:
      'Yellowed, hazy headlight lenses sanded, polished and sealed, so the lights look clearer.',
  },
  {
    key: 'bike-wash',
    name: 'Bike wash',
    category: 'others',
    durationMins: 30,
    pricingType: 'flat',
    description:
      'Two-wheeler foam wash with the body, wheels and chain area cleaned, then dried. The engine and electrics are not pressure-washed.',
  },
  // The mechanical and body work (0080, owner's screens 16 Nov 2026).
  {
    key: 'general-service',
    name: 'General service',
    category: 'general_service',
    durationMins: 180,
    pricingType: 'per_vehicle',
    description:
      'Engine oil and filter changed, fluids topped up, and the brakes, battery, tyres and lights checked.',
  },
  {
    key: 'oil-change',
    name: 'Oil change',
    category: 'general_service',
    durationMins: 45,
    pricingType: 'per_vehicle',
    description: 'Engine oil drained and refilled with the grade your car needs, and a new oil filter fitted.',
  },
  {
    key: 'wheel-alignment-balancing',
    name: 'Wheel alignment & balancing',
    category: 'general_service',
    durationMins: 45,
    pricingType: 'flat',
    description:
      'Wheel angles set on an alignment machine and each wheel balanced, so the car runs straight with less vibration.',
  },
  {
    key: 'brake-pads',
    name: 'Brake pads',
    category: 'repairs',
    durationMins: 60,
    pricingType: 'per_vehicle',
    description:
      'Worn front brake pads removed and new ones fitted, the discs and callipers checked, and the brakes tested before handover.',
  },
  {
    key: 'ac-service',
    name: 'AC service',
    category: 'repairs',
    durationMins: 90,
    pricingType: 'per_vehicle',
    description: 'AC gas checked and topped up, the cabin filter cleaned, and the cooling tested.',
  },
  {
    key: 'clutch-repair',
    name: 'Clutch repair',
    category: 'repairs',
    durationMins: 1440,
    pricingType: 'on_inspection',
    description:
      'The clutch inspected first, then the worn parts repaired or replaced as quoted, and the clutch tested on the road.',
  },
  {
    key: 'dent-repair',
    name: 'Dent repair',
    category: 'dent_paint',
    durationMins: 120,
    pricingType: 'on_inspection',
    description:
      'Dents pulled or beaten out and the panel smoothed. The work is quoted after the garage sees the car.',
  },
  {
    key: 'panel-painting',
    name: 'Panel painting',
    category: 'dent_paint',
    durationMins: 1440,
    pricingType: 'per_vehicle',
    description: 'One panel sanded, primed and painted to match the car, then clear-coated and polished.',
  },
]

/** A name as two services are compared: case, spacing and punctuation aside. */
export function serviceNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * The templates a garage does not already have, by name, in the list's
 * order. `names` should include its hidden services too: adding a second
 * "Foam wash" next to a hidden one is a duplicate, and Show again is the way
 * back for that one.
 */
export function templatesNotIn(names: readonly string[]): ServiceTemplate[] {
  const have = new Set(names.map(serviceNameKey).filter(Boolean))
  return SERVICE_TEMPLATES.filter((template) => !have.has(serviceNameKey(template.name)))
}
