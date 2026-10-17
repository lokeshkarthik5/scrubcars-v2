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
    // "Wash and standard" and found by customers under Car Wash.
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
    category: 'others',
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
