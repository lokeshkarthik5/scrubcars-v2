/**
 * Everything the homepage says, in one place.
 *
 * Copy and media live here rather than in the section components so marketing
 * can change a headline, swap a photo or add a review without touching layout.
 *
 * ── Voice ──────────────────────────────────────────────────────────────────
 * Written to the brand guideline (Figma: Detlio Brand Guideline, ch. 02):
 * short declarative sentences, precise service language, no hype. Headlines
 * come from its "Copy in Practice" list. Avoid: cheap, miracle, instant
 * perfection, ultimate luxury, guaranteed flawless — and no "certified",
 * "guaranteed" or "lifetime" claim until operations and legal have signed it
 * off (ch. 02.06). Every claim here must stay true of how the product behaves.
 *
 * ── Samples ────────────────────────────────────────────────────────────────
 * Results and testimonials need real material: photos of real jobs, quotes
 * from real customers. Until marketing supplies them, the entries below are
 * marked `sample: true`. Samples render with a "Sample" tag in development and
 * on Vercel preview deployments, so the layout can be reviewed, and are
 * dropped from production — a section with nothing real in it disappears
 * rather than putting invented reviews on the live site.
 *
 * To publish real material: add an entry without `sample`, put any media in
 * apps/users/public/marketing/, and delete the samples. Before/after pairs
 * should share the same angle, crop and grade (brand ch. 09: cool,
 * desaturated, no faces, no flash).
 */

import type { ServiceCategory } from '@repo/core/types'

export interface Cta {
  label: string
  href: string
}

export const HERO = {
  /** Replaced by "Now booking in <city>" when the live listing has one city. */
  status: 'Now booking',
  /** Rendered with the brand's red terminal period. */
  title: 'Keep it in pristine condition',
  body: 'Find a verified specialist near you. Book a slot at the garage or at your door. Follow every stage until your car is ready.',
  primaryCta: { label: 'Book a service', href: '/home' } satisfies Cta,
  secondaryCta: { label: 'How it works', href: '#how-it-works' } satisfies Cta,
  image: {
    src: '/onboarding-car.jpg',
    alt: 'A black sports car under a single overhead light in a dark studio',
  },
}

/** Short proof points under the hero. Each must stay true of the product. */
export const TRUST_POINTS = [
  'Verified garages',
  'Prices before you book',
  'Secure online payment',
  'Live booking status',
]

export const SERVICES_INTRO = {
  kicker: 'Services',
  title: 'Know exactly what your car needs.',
  body: 'Washing, detailing, coating and correction from specialists near you. Every price is shown before you book.',
}

/** Each card opens the garage search filtered to its category. */
export const SERVICES: Array<{
  category: ServiceCategory
  title: string
  body: string
}> = [
  {
    category: 'car_wash',
    title: 'Car wash',
    body: 'From an exterior foam wash to a full interior clean. Often priced by the size of your car.',
  },
  {
    category: 'detailing',
    title: 'Detailing',
    body: 'Machine polishing, decontamination and interior deep cleaning by detailing specialists.',
  },
  {
    category: 'coating',
    title: 'Coating',
    body: 'Protective coatings that preserve the finish and make maintenance washes easier.',
  },
  {
    category: 'scratch_removal',
    title: 'Scratch removal',
    body: 'Swirl marks, scuffs and light scratches corrected before they set in.',
  },
  {
    category: 'package',
    title: 'Packages',
    body: 'Services bundled together, with any saving against booking them separately shown before you book.',
  },
]

export const STEPS_INTRO = {
  kicker: 'How it works',
  title: 'Precision at every stage.',
}

export const STEPS = [
  {
    title: 'Find a specialist',
    body: 'Browse garages near you by service, price and distance. Use the list or the map.',
  },
  {
    title: 'Choose a slot',
    body: 'Pick a time. Drop the car at the garage, or book doorstep service where the garage offers it.',
  },
  {
    title: 'Pay securely',
    body: 'Pay online at checkout through Razorpay. Apply a promo code if you have one.',
  },
  {
    title: 'Track every stage',
    body: 'Follow the booking from confirmed to in progress to completed. Leave a review when it is done.',
  },
]

/** The brand pillars (guideline ch. 01.06), written for car owners. */
export const PILLARS_INTRO = {
  kicker: 'Why Detlio',
  title: 'Care without compromise.',
}

export const PILLARS = [
  {
    title: 'Precision',
    body: 'Exact standards and clean execution. Every garage is reviewed before it is listed, and every price is shown before you book.',
  },
  {
    title: 'Preservation',
    body: 'Care that protects your car’s finish, and its value, for as long as you own it.',
  },
  {
    title: 'Pride',
    body: 'The satisfaction of a car maintained to a mirror-like standard.',
  },
]

// ─── Results ────────────────────────────────────────────────────────────────

export interface Media {
  src: string
  alt: string
  /**
   * CSS filter applied to the image. Exists only so the samples can fake a
   * "before" from a single photo — real before/after pairs should not need it.
   */
  filter?: string
}

export type Result =
  | {
      kind: 'compare'
      sample?: boolean
      title: string
      detail: string
      before: Media
      after: Media
    }
  | {
      kind: 'video'
      sample?: boolean
      title: string
      detail: string
      /** An .mp4 in apps/users/public/marketing/, e.g. '/marketing/coating.mp4'. */
      src: string
      poster: string
    }

export const RESULTS_INTRO = {
  kicker: 'Results',
  title: 'The work, before and after.',
  body: 'Drag across a photo to compare the same car before and after.',
}

const SAMPLE_BEFORE_FILTER =
  'grayscale(0.75) sepia(0.35) brightness(0.55) contrast(0.8) blur(0.6px)'

export const RESULTS: Result[] = [
  {
    kind: 'compare',
    sample: true,
    title: 'Exterior detail',
    detail: 'Sample — replace with a real job',
    before: {
      src: '/onboarding-car.jpg',
      alt: 'Car before detailing',
      filter: SAMPLE_BEFORE_FILTER,
    },
    after: { src: '/onboarding-car.jpg', alt: 'Car after detailing' },
  },
  {
    kind: 'compare',
    sample: true,
    title: 'Paint correction',
    detail: 'Sample — replace with a real job',
    before: {
      src: '/onboarding-car.jpg',
      alt: 'Paint before correction',
      filter: SAMPLE_BEFORE_FILTER,
    },
    after: { src: '/onboarding-car.jpg', alt: 'Paint after correction' },
  },
]

// ─── Testimonials ───────────────────────────────────────────────────────────

export interface Testimonial {
  sample?: boolean
  quote: string
  /** First name or initials — no photos of faces (brand ch. 09.04). */
  name: string
  /** Car and service, e.g. 'Hyundai Creta · Ceramic coating'. */
  detail: string
  /** Whole stars, 1–5. */
  rating: number
}

export const TESTIMONIALS_INTRO = {
  kicker: 'Reviews',
  title: 'What car owners say.',
}

export const TESTIMONIALS: Testimonial[] = [
  {
    sample: true,
    quote:
      'Booked a wash on my lunch break. The car was ready at the time they gave me.',
    name: 'Sample customer',
    detail: 'Hatchback · Car wash',
    rating: 5,
  },
  {
    sample: true,
    quote:
      'I saw the price for my SUV before I booked, and followed the whole job on my phone.',
    name: 'Sample customer',
    detail: 'SUV · Detailing',
    rating: 5,
  },
  {
    sample: true,
    quote:
      'The team came to my apartment for the coating. They explained the curing time before they started.',
    name: 'Sample customer',
    detail: 'Sedan · Coating',
    rating: 5,
  },
]

// ─── Garages ────────────────────────────────────────────────────────────────

/** Live garages, fetched from the API — see live-garages.ts. */
export const GARAGES_INTRO = {
  kicker: 'On Detlio',
  title: 'Garages you can book today.',
  body: 'Every garage is verified by our team before it is listed.',
  cta: { label: 'See all garages', href: '/home' } satisfies Cta,
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

/** Answers must match how the product behaves — check before editing. */
export const FAQS = [
  {
    q: 'Where is Detlio available?',
    a: 'Detlio is live in Chennai.',
  },
  {
    q: 'How are garages chosen?',
    a: 'Every garage is reviewed and verified by the Detlio team before it appears on the platform.',
  },
  {
    q: 'Can someone come to my home?',
    a: 'Yes, where the garage offers it. Choose Doorstep, pick your address at checkout, and we check the garage covers it before you pay.',
  },
  {
    q: 'How much does it cost?',
    a: 'Each garage sets its own prices. You see them before you book, by car size where it applies.',
  },
  {
    q: 'How do I pay?',
    a: 'Online, when you confirm your booking, through Razorpay’s secure checkout.',
  },
  {
    q: 'Can I reschedule or cancel?',
    a: 'Yes. You can reschedule a booking up to twice, or cancel it, from the booking screen up to 2 hours before your slot.',
  },
]

export const FINAL_CTA = {
  /** Rendered with the brand's red terminal period. */
  title: 'Protect the finish',
  body: 'Find a verified specialist near you and book in minutes.',
  cta: { label: 'Book a service', href: '/home' } satisfies Cta,
}

export const FOOTER = {
  /** The brand promise (guideline ch. 01.03). */
  tagline:
    'Premium care, confidently discovered, booked, tracked and remembered.',
  links: [
    { label: 'Book a service', href: '/home' },
    { label: 'Find on a map', href: '/map' },
    { label: 'Sign in', href: '/login' },
  ] satisfies Cta[],
  /** Shown in the footer when filled in; leave empty to hide. */
  contact: {
    email: '',
    phone: '',
    instagram: '',
  },
}
