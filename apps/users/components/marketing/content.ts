/**
 * Everything the homepage says, in one place.
 *
 * Copy and media live here rather than in the section components so marketing
 * can change a headline, swap a photo or add a review without touching layout.
 *
 * ── Message ────────────────────────────────────────────────────────────────
 * Detlio is one app for all car care — at the garage, at your door, and soon
 * pickup & drop — with a team that knows its garages and steps in when
 * something is not right. Every section should leave that idea behind.
 *
 * ── Voice ──────────────────────────────────────────────────────────────────
 * Written to the brand guideline (Figma: Detlio Brand Guideline, ch. 02):
 * short declarative sentences, precise service language, no hype. Avoid:
 * cheap, miracle, instant perfection, ultimate luxury, guaranteed flawless —
 * and no "certified", "guaranteed" or "lifetime" claim until operations and
 * legal have signed it off (ch. 02.06). Every claim here must stay true of
 * how the product behaves today; anything planned carries `comingSoon` and is
 * worded in the future tense.
 *
 * ── Samples ────────────────────────────────────────────────────────────────
 * Results, videos and testimonials need real material: photos and clips of
 * real jobs, quotes from real customers. Until marketing supplies them, the entries below are
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

import { SUPPORT_PHONE_DISPLAY } from '@repo/core/support'
import type { ServiceCategory } from '@repo/core/types'

export interface Cta {
  label: string
  href: string
}

/** The three ways a job gets done — the brand's "three service models". */
export type ServiceMode = 'garage' | 'doorstep' | 'pickup'

export const META = {
  title: 'Detlio — One app for all your car care in Chennai',
  description:
    'Book car wash, detailing, coating and scratch removal from verified Chennai garages, at the garage or at your door. Prices before you book. Pickup & drop coming soon.',
}

/**
 * The first screen: what Detlio is, said once and large, over the car — then
 * the three ways directly beneath it.
 */
export const HERO = {
  /** Replaced by "Now booking in <city>" when the live listing has one city. */
  status: 'Now booking',
  /** Two lines, rendered large; the brand's red period follows the second. */
  title: ['All your car care needs,', 'in one app'] as const,
  body: 'Premium car care from verified specialists, with clear prices, live updates and a team on your side for every booking.',
  primaryCta: { label: 'Book a service', href: '/home' } satisfies Cta,
  secondaryCta: { label: 'How it works', href: '#how-it-works' } satisfies Cta,
  image: {
    src: '/onboarding-car.jpg',
    alt: 'A black sports car under a single overhead light in a dark studio',
  },
  waysKicker: 'One app. Three ways.',
}

/**
 * The tag hanging in the top corner of the first screen. It must name an offer
 * a customer can actually get: today that is promo codes at checkout. Replace
 * with a specific live offer (code and amount, as set up in admin → Discounts)
 * when marketing runs one — a named offer convinces more than a general one.
 */
export const OFFER_TAG = {
  label: 'Offers',
  title: 'Save at checkout',
  detail: 'Promo codes on Detlio',
  href: '#perks',
}

/**
 * The app section. The native apps are planned, not published, so the stores
 * are named in plain text on Detlio's own tiles: the official badges may only
 * link to a live listing, and neither Apple's logo nor Google Play's may be
 * used outside them. Switch to the official badges, linked, at launch.
 *
 * The screenshot is the customer app as it runs today (apps/users /home at
 * 390×844, 2×), so the phone shows the real product. No readable number
 * plates or faces (brand ch. 09) — blur them. Retake it when the home screen,
 * or a pictured garage's listing or price, changes.
 */
export const APPS = {
  kicker: 'The Detlio app',
  title: 'Detlio, in your pocket.',
  body: 'Book from your phone today at detlio.com. The app for iPhone and Android is coming soon.',
  label: 'Coming soon',
  stores: [
    { key: 'app-store', name: 'the App Store' },
    { key: 'google-play', name: 'Google Play' },
  ] as const,
  web: { label: 'Book on the web today', href: '/home' } satisfies Cta,
  screenshot: {
    src: '/marketing/app-home.jpg',
    alt: 'The Detlio home screen, listing garages near you with prices',
  },
}

/**
 * `comingSoon` keeps a mode on the page, tagged, until it can be booked.
 * Pickup & drop is planned but not yet bookable — when it launches, drop the
 * flag and move its copy to the present tense (here, in STEPS, FAQS,
 * FINAL_CTA and FOOTER).
 */
export const MODES: Array<{
  key: ServiceMode
  title: string
  body: string
  comingSoon?: boolean
}> = [
  {
    key: 'garage',
    title: 'At the garage',
    body: 'Book a slot, drop your car at a verified garage, and collect it when it is ready.',
  },
  {
    key: 'doorstep',
    title: 'At your door',
    body: 'A specialist comes to your home or office, where the garage covers your address.',
  },
  {
    key: 'pickup',
    title: 'Pickup & drop',
    body: 'The garage will collect your car and bring it back when the work is done.',
    comingSoon: true,
  },
]

// ─── Services ───────────────────────────────────────────────────────────────

export const SERVICES_INTRO = {
  kicker: 'Services',
  title: 'Know exactly what your car needs.',
  body: 'Wash, detailing, coating and scratch removal from verified Chennai garages. You see the price, or the inspection fee, before you book.',
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
    body: 'Protective coatings that preserve the finish and make maintenance washes easier. Any inspection fee is shown before you book.',
  },
  {
    category: 'scratch_removal',
    title: 'Scratch removal',
    body: 'Swirl marks, scuffs and light scratches corrected before they set in.',
  },
  {
    category: 'package',
    title: 'Packages',
    body: 'Several services in one booking. Any saving against booking them separately is shown before you book.',
  },
]

// ─── Why Detlio ─────────────────────────────────────────────────────────────

export type PromiseIcon =
  'one-app' | 'known-garages' | 'support' | 'prices' | 'tracking' | 'rewards'

export const PROMISE_INTRO = {
  kicker: 'Why Detlio',
  title: 'Booked on Detlio. Looked after by Detlio.',
  body: 'Detlio is not a garage. We verify the garages, take your booking, and stay on your side until the job is done.',
}

/** The 'support' entry also renders the real call and WhatsApp buttons. */
export const PROMISES: Array<{
  icon: PromiseIcon
  title: string
  body: string
  comingSoon?: boolean
}> = [
  {
    icon: 'one-app',
    title: 'Every service, one app',
    body: 'Wash, detailing, coating, scratch removal and packages, at the garage or at your door. One account to book, pay and track them all.',
  },
  {
    icon: 'known-garages',
    title: 'Garages we know personally',
    body: 'Our team reviews every garage and marks it verified before it is listed. We know the people behind each one.',
  },
  {
    icon: 'support',
    title: 'Something not right? We step in',
    body: 'Tell our team by call or WhatsApp. We take it up with the garage directly, so you are not left chasing anyone.',
  },
  {
    icon: 'prices',
    title: 'Prices before you book',
    body: 'Each garage sets its own price, by car size where it applies. You see it before you book. Some work is quoted after a paid inspection.',
  },
  {
    icon: 'tracking',
    title: 'Every stage, on your phone',
    body: 'Follow your booking from confirmed to in progress to completed. You know where things stand without making a call.',
  },
  {
    icon: 'rewards',
    title: 'Rewards for regulars',
    body: 'A loyalty programme is on the way, with points on your bookings and a free service after five.',
    comingSoon: true,
  },
]

// ─── How it works ───────────────────────────────────────────────────────────

export const STEPS_INTRO = {
  kicker: 'How it works',
  title: 'Find, book, pay, track. All in Detlio.',
  body: 'No ringing around garages. No guessing the price.',
}

export const STEPS = [
  {
    title: 'Choose your service',
    body: 'Wash, detailing, coating, scratch removal or a package. Compare verified garages near you on a list or a map.',
  },
  {
    title: 'Choose how and when',
    body: 'Pick a slot at least an hour ahead at the garage, or 3 hours ahead for doorstep. Visit the garage, or book doorstep service where the garage offers it. Pickup & drop is coming soon.',
  },
  {
    title: 'Pay securely',
    body: 'Pay online at checkout through Razorpay. Apply a promo code first if you have one.',
  },
  {
    title: 'Track every stage',
    body: 'Follow it from confirmed to in progress to completed. Something not right? Tell us, and we take it up with the garage.',
  },
]

// ─── Offers & rewards ───────────────────────────────────────────────────────

export type PerkIcon = 'promo' | 'package' | 'free' | 'points'

export const PERKS_INTRO = {
  kicker: 'Offers & rewards',
  title: 'Offers today. Rewards on the way.',
  body: 'Promo codes and package savings work now. A loyalty programme for regular Detlio customers is coming soon.',
}

/**
 * Promo codes and package savings are live. The loyalty programme is not
 * built yet — its terms are the business's to settle before the flag comes
 * off.
 */
export const PERKS: Array<{
  icon: PerkIcon
  title: string
  body: string
  comingSoon?: boolean
}> = [
  {
    icon: 'promo',
    title: 'Promo codes at checkout',
    body: 'Apply a Detlio promo code at checkout. The discount comes off before you pay.',
  },
  {
    icon: 'package',
    title: 'Package savings',
    body: 'Book a garage’s package and see any saving against booking each service separately, before you pay.',
  },
  {
    icon: 'free',
    title: 'Book 5, get 1 free',
    body: 'Complete five bookings through Detlio and your next service will be free. Full terms at launch.',
    comingSoon: true,
  },
  {
    icon: 'points',
    title: 'Loyalty points',
    body: 'You will earn points each time you book through Detlio, and can put them towards your next service.',
    comingSoon: true,
  },
]

// ─── Videos ─────────────────────────────────────────────────────────────────

/**
 * Short clips of real jobs — vertical, like Instagram reels. Put each .mp4
 * (H.264, ideally under 10 MB) and a poster .jpg in
 * apps/users/public/marketing/ and add an entry here. They play only when
 * tapped, so they cost nothing to visitors who do not.
 */
export interface Reel {
  sample?: boolean
  title: string
  detail: string
  /** e.g. '/marketing/foam-wash.mp4'. Samples have none. */
  src?: string
  /** e.g. '/marketing/foam-wash.jpg' — the frame shown before play. */
  poster?: string
}

export const VIDEOS_INTRO = {
  kicker: 'In motion',
  title: 'Watch the work.',
  body: 'Real jobs from garages on Detlio, from the first rinse to the final finish.',
}

export const VIDEOS: Reel[] = [
  {
    sample: true,
    title: 'Foam wash',
    detail: 'Sample — your video here',
  },
  {
    sample: true,
    title: 'Paint correction',
    detail: 'Sample — your video here',
  },
  {
    sample: true,
    title: 'Ceramic coating',
    detail: 'Sample — your video here',
  },
]

// ─── Instagram ──────────────────────────────────────────────────────────────

/**
 * The giveaway runs on Instagram, not in the product. Instagram's promotion
 * rules require each giveaway to state its own terms and that Instagram is
 * not involved — the fine print says both.
 */
export const INSTAGRAM = {
  handle: 'detlioapp',
  url: 'https://www.instagram.com/detlioapp/',
  kicker: 'Instagram',
  title: 'Follow along. Win promo codes.',
  body: 'Follow @detlioapp and join in on our posts. We pick lucky followers who engage and send them free Detlio promo codes.',
  fine: 'Giveaway terms are shared with each giveaway post. Instagram does not sponsor or run these giveaways.',
  cta: 'Follow @detlioapp',
}

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
  title: 'The finish, before and after.',
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
  title: 'What Chennai car owners say.',
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
  title: 'We know the garages. You know the price.',
  body: 'Every garage is reviewed and verified by our team before it is listed. Book any of them in the same app.',
  cta: { label: 'See all garages', href: '/home' } satisfies Cta,
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

/** Answers must match how the product behaves — check before editing. */
export const FAQS = [
  {
    q: 'What is Detlio?',
    a: 'One app for all your car care. Book wash, detailing, coating, scratch removal and packages from verified Chennai garages, at the garage or at your door, then track every stage.',
  },
  {
    q: 'Is there a Detlio app?',
    a: 'The Detlio app for iPhone and Android is coming soon. Until then, book on the web at detlio.com. It works on any phone.',
  },
  {
    q: 'Is Detlio a garage?',
    a: 'No. Verified partner garages do the work. Detlio finds them, takes your booking and payment, and stays on your side if anything needs following up.',
  },
  {
    q: 'What if something is not right with my service?',
    a: `Call or WhatsApp our team on ${SUPPORT_PHONE_DISPLAY}. The same line is in the Need help? card in your profile. We know our partner garages personally, and we take it up with the garage for you.`,
  },
  {
    q: 'How are garages chosen?',
    a: 'Our team reviews every garage and marks it verified before it is listed. We know the people behind each one, which is how we can step in for you.',
  },
  {
    q: 'Can someone come to my home?',
    a: 'Yes, where the garage offers doorstep service. Pick your address at checkout, and we check the garage covers it before you pay.',
  },
  {
    q: 'When will pickup & drop be available?',
    a: 'Pickup & drop is coming soon. The garage will collect your car and bring it back after the work. Until then, book at the garage or at your door.',
  },
  {
    q: 'Are there offers or rewards?',
    a: 'Promo codes can be applied at checkout today, and packages show any saving before you book. A loyalty programme, with points and a free service after five bookings, is coming soon.',
  },
  {
    q: 'How much does it cost?',
    a: 'Each garage sets its own prices, by car size where it applies. You see the price before you book. Some services charge an upfront inspection fee instead, and the final bill comes after the inspection.',
  },
  {
    q: 'How does inspection pricing work?',
    a: 'Some work can only be priced once the garage has seen the car. For these you pay the inspection fee when you book. If the work costs more, the garage sends the final bill in the app, showing what you already paid, and you pay the rest there. If it costs no more, there is nothing more to pay.',
  },
  {
    q: 'Where is Detlio available?',
    a: 'Detlio is live in Chennai.',
  },
  {
    q: 'Can I reschedule or cancel?',
    a: 'Yes, from the booking screen. Until the garage accepts, you can cancel any time. Once it has, you can cancel or reschedule up to 2 hours before your slot. You can reschedule up to twice; each new time goes back to the garage to accept. If you don’t turn up for an accepted booking, it isn’t refunded.',
  },
]

export const FINAL_CTA = {
  /** Rendered with the brand's red terminal period. */
  title: 'Care without compromise',
  body: 'At the garage or at your door today. Pickup & drop coming soon. And a team that knows every garage, on your side.',
  cta: { label: 'Book a service', href: '/home' } satisfies Cta,
}

export const FOOTER = {
  tagline:
    'One app for all your car care. At the garage, at your door, and soon, pickup & drop.',
  links: [
    { label: 'Book a service', href: '/home' },
    { label: 'Find on a map', href: '/map' },
    { label: 'Sign in', href: '/login' },
  ] satisfies Cta[],
  /**
   * Shown in the footer when filled in; leave empty to hide. The support
   * phone and WhatsApp always show — they come from @repo/core/support — and
   * so does the support email, from lib/legal/details.ts (BUSINESS.email).
   */
  contact: {
    instagram: 'detlioapp',
  },
}
