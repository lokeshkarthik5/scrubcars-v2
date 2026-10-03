import { Space_Grotesk } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import {
  IconApps,
  IconArrowRight,
  IconArrowUpRight,
  IconArrowsExchange,
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconBuildingStore,
  IconCar,
  IconCoins,
  IconDiscount,
  IconGift,
  IconHeadset,
  IconHome,
  IconReceipt,
  IconRoute,
  IconUserCheck,
  IconChevronDown,
  IconCircleCheck,
  IconDroplet,
  IconMail,
  IconPackage,
  IconPhone,
  IconShieldCheck,
  IconSparkles,
  IconStarFilled,
  IconWand,
} from '@tabler/icons-react'
import type { ApiVendorListItem } from '@repo/core/api/types'
import type { ServiceCategory } from '@repo/core/types'
import { CATEGORY_LABELS } from '@repo/core/categories'
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_TEL_HREF,
  SUPPORT_WHATSAPP_HREF,
} from '@repo/core/support'
import { cn } from '@repo/core/utils'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { BeforeAfter } from './before-after'
import {
  type Cta,
  type Result,
  type ServiceMode,
  type Testimonial,
  FAQS,
  FINAL_CTA,
  FOOTER,
  GARAGES_INTRO,
  HERO,
  MODES,
  MODES_INTRO,
  PERKS,
  PERKS_INTRO,
  PROMISE_INTRO,
  PROMISES,
  type PerkIcon,
  type PromiseIcon,
  RESULTS_INTRO,
  SERVICES,
  SERVICES_INTRO,
  STEPS,
  STEPS_INTRO,
  TESTIMONIALS_INTRO,
  TRUST_POINTS,
} from './content'

/**
 * The homepage, section by section. Server components throughout — the only
 * client code on the page is the before/after slider — so the whole page
 * arrives as HTML.
 *
 * Unlike the rest of this app, which is a 428px phone column, the homepage is
 * a full-width responsive site: it is what a visitor on a laptop sees first.
 *
 * Built to the brand guideline (Figma: Detlio Brand Guideline, ch. 03–11):
 *   · Red is the signal — the primary action, the terminal period on the two
 *     hero-level headlines, the status dot and the pillar markers. Nothing else.
 *   · Inter throughout; Space Grotesk only for prices.
 *   · Borders over shadows; 8px buttons, 12px cards, 4px tags.
 *   · No decorative motion — colour transitions on hover only.
 *   · Margins 16 / 32 / 64 / 80px at the mobile / tablet / desktop / wide
 *     breakpoints; section padding on the 8px scale (64 → 96).
 */

/** Numerals only — the guideline keeps it off headings, body and controls. */
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'] })

const CONTAINER = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-16 xl:px-20'

const SECTION_Y = 'py-16 sm:py-24'

/** The brand's terminal period: a red full stop on hero-level headlines. */
function RedPeriod() {
  return <span className="text-brand-red">.</span>
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-white'

function CtaLink({
  cta,
  variant = 'primary',
  size = 'md',
  className,
}: {
  cta: Cta
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
}) {
  const className_ = cn(
    'press inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors',
    size === 'md' ? 'h-12 px-7 text-[15px]' : 'h-10 px-5 text-[14px]',
    variant === 'primary'
      ? 'bg-brand-red text-brand-white hover:bg-brand-red-hover'
      : 'border border-white/20 text-brand-white hover:bg-white/[0.06]',
    FOCUS_RING,
    className
  )
  const content = (
    <>
      {cta.label}
      {variant === 'primary' && size === 'md' && (
        <IconArrowRight size={18} stroke={2} aria-hidden />
      )}
    </>
  )

  // In-page anchors stay plain links: native fragment navigation moves the
  // keyboard's starting point to the section, where next/link leaves focus on
  // the button the visitor just pressed.
  return cta.href.startsWith('#') ? (
    <a href={cta.href} className={className_}>
      {content}
    </a>
  ) : (
    <Link href={cta.href} className={className_}>
      {content}
    </Link>
  )
}

function SectionIntro({
  kicker,
  title,
  body,
  className,
}: {
  kicker: string
  title: string
  body?: string
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <p className="text-[11px] font-medium uppercase leading-4 tracking-[0.16em] text-brand-red">
        {kicker}
      </p>
      <h2 className="mt-3 text-balance text-[30px] font-bold leading-[1.12] tracking-[-0.03em] sm:text-[44px]">
        {title}
      </h2>
      {body && (
        <p className="mt-4 text-pretty text-[16px] leading-relaxed text-text-secondary">
          {body}
        </p>
      )}
    </div>
  )
}

/** Marks placeholder material so nobody mistakes it for the real thing. */
function SampleTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-white/20 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
      Sample
    </span>
  )
}

/**
 * Marks something the page describes but customers cannot book yet. A red
 * status dot, as the guideline's dot language allows (ch. 08, use C).
 */
function ComingSoonTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-white/20 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
      <span aria-hidden className="size-1.5 rounded-full bg-brand-red" />
      Coming soon
    </span>
  )
}

// ─── Header ─────────────────────────────────────────────────────────────────

export function SiteHeader({ links }: { links: Cta[] }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-brand-black/75 backdrop-blur-md">
      <div
        className={cn(
          CONTAINER,
          'flex h-16 items-center justify-between gap-6'
        )}
      >
        <Link
          href="/"
          aria-label="Detlio home"
          className={cn('rounded-sm', FOCUS_RING)}
        >
          {/* Guideline minimums: 80px wide on mobile, 120px in desktop nav. */}
          <BrandMark height={34} priority className="h-[23px]! sm:h-[34px]!" />
        </Link>
        <nav
          aria-label="Homepage sections"
          className="hidden items-center gap-8 lg:flex"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                'whitespace-nowrap rounded-sm text-[14px] text-text-secondary transition-colors hover:text-brand-white',
                FOCUS_RING
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(
              'hidden h-10 items-center whitespace-nowrap rounded-lg px-4 text-[14px] font-medium text-text-secondary transition-colors hover:text-brand-white sm:inline-flex',
              FOCUS_RING
            )}
          >
            Sign in
          </Link>
          <CtaLink cta={HERO.primaryCta} size="sm" />
        </div>
      </div>
    </header>
  )
}

// ─── Hero ───────────────────────────────────────────────────────────────────

export function Hero({
  city,
  startingPrice,
}: {
  city: string | null
  startingPrice: number | null
}) {
  return (
    <section className="relative isolate overflow-hidden pt-16">
      {/* The photo is cropped below its light source; this carries the
          overhead spotlight up behind the headline. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(ellipse_32%_60%_at_50%_0%,rgba(255,255,255,0.09),transparent_75%)]"
      />
      <div
        className={cn(
          CONTAINER,
          'relative z-10 flex flex-col items-center pt-14 text-center sm:pt-20'
        )}
      >
        <p className="inline-flex items-center gap-2 text-[13px] font-medium text-text-secondary">
          <span aria-hidden className="size-1.5 rounded-full bg-brand-red" />
          {city ? `${HERO.status} in ${city}` : HERO.status}
        </p>
        <h1 className="mt-5 max-w-4xl text-balance text-[44px] font-bold leading-[1.04] tracking-[-0.035em] sm:text-[60px] lg:text-[72px]">
          {HERO.title}
          <RedPeriod />
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-text-secondary sm:text-[18px]">
          {HERO.body}
        </p>
        <ul
          aria-label="Ways to book"
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
        >
          {MODES.map((mode) => (
            <li
              key={mode.key}
              className="inline-flex items-center gap-1.5 rounded border border-white/15 px-2.5 py-1 text-[13px] font-medium text-brand-white"
            >
              {mode.title}
              {mode.comingSoon && (
                <span className="font-normal text-text-muted">· soon</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <CtaLink cta={HERO.primaryCta} className="w-full sm:w-auto" />
          <CtaLink
            cta={HERO.secondaryCta}
            variant="secondary"
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      {/* Cropped from the top: the frame above the car is empty studio, and
          showing it pushes the car below the fold on a laptop. */}
      <div className="relative mx-auto -mt-2 aspect-[1170/640] w-full max-w-[1170px] sm:-mt-10 lg:-mt-16">
        <Image
          src={HERO.image.src}
          alt={HERO.image.alt}
          fill
          priority
          sizes="(min-width: 1170px) 1170px, 100vw"
          className="object-cover object-bottom [mask-image:radial-gradient(ellipse_70%_78%_at_50%_58%,black_50%,transparent_100%)]"
        />
      </div>

      <ul
        className={cn(
          CONTAINER,
          'relative z-10 -mt-6 flex flex-wrap justify-center gap-x-7 gap-y-3 pb-6 sm:-mt-12'
        )}
      >
        {startingPrice != null && (
          <li className="flex items-center gap-2 text-[14px] text-text-secondary">
            <IconCircleCheck size={18} stroke={1.5} aria-hidden />
            Services from ₹{startingPrice}
          </li>
        )}
        {TRUST_POINTS.map((point) => (
          <li
            key={point}
            className="flex items-center gap-2 text-[14px] text-text-secondary"
          >
            <IconCircleCheck size={18} stroke={1.5} aria-hidden />
            {point}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Services ───────────────────────────────────────────────────────────────

const SERVICE_ICONS: Record<ServiceCategory, typeof IconDroplet> = {
  car_wash: IconDroplet,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch_removal: IconWand,
  package: IconPackage,
  others: IconCar,
}

export function Services() {
  return (
    <section
      id="services"
      className={cn('border-t border-white/[0.06]', SECTION_Y)}
    >
      <div className={CONTAINER}>
        <SectionIntro {...SERVICES_INTRO} />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {SERVICES.map((service, index) => {
            const Icon = SERVICE_ICONS[service.category]
            return (
              <li
                key={service.category}
                className={index < 2 ? 'lg:col-span-3' : 'lg:col-span-2'}
              >
                <Link
                  href={`/search?category=${service.category}`}
                  className={cn(
                    'flex h-full flex-col rounded-xl border border-white/[0.08] bg-brand-rich p-6 transition-colors hover:border-white/20 sm:p-8',
                    FOCUS_RING
                  )}
                >
                  <Icon
                    size={28}
                    stroke={1.75}
                    aria-hidden
                    className="text-brand-white"
                  />
                  <h3 className="mt-6 text-[20px] font-semibold tracking-[-0.01em]">
                    {service.title}
                  </h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-text-secondary">
                    {service.body}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-white">
                    Find garages
                    <IconArrowUpRight size={16} stroke={1.5} aria-hidden />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ─── How it works ───────────────────────────────────────────────────────────

export function HowItWorks() {
  return (
    <section id="how-it-works" className={SECTION_Y}>
      <div className={CONTAINER}>
        <SectionIntro {...STEPS_INTRO} />
        <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-4">
                <span className="text-[13px] font-medium tabular-nums tracking-[0.16em] text-text-muted">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span aria-hidden className="h-px flex-1 bg-white/10" />
              </div>
              <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.01em]">
                {step.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ─── Results ────────────────────────────────────────────────────────────────

export function Results({ results }: { results: Result[] }) {
  return (
    <section
      id="results"
      className={cn('border-t border-white/[0.06]', SECTION_Y)}
    >
      <div className={CONTAINER}>
        <SectionIntro {...RESULTS_INTRO} />
        <ul className="mt-12 grid gap-8 md:grid-cols-2">
          {results.map((result, index) => (
            <li key={`${result.title}-${index}`}>
              {result.kind === 'compare' ? (
                <BeforeAfter
                  before={result.before}
                  after={result.after}
                  label={result.title}
                />
              ) : (
                <video
                  src={result.src}
                  poster={result.poster}
                  controls
                  playsInline
                  preload="none"
                  className="aspect-[4/3] w-full rounded-xl bg-brand-rich object-cover"
                />
              )}
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[17px] font-semibold">{result.title}</h3>
                  <p className="mt-1 text-[14px] text-text-secondary">
                    {result.detail}
                  </p>
                </div>
                {result.sample && <SampleTag />}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ─── Live garages ───────────────────────────────────────────────────────────

/** "Others" says nothing about a garage, so it is left off the card. */
function garageTags(garage: ApiVendorListItem) {
  return garage.serviceTags
    .filter((tag) => tag !== CATEGORY_LABELS.others)
    .slice(0, 3)
}

export function Garages({ garages }: { garages: ApiVendorListItem[] }) {
  return (
    <section
      id="garages"
      className={cn('border-t border-white/[0.06]', SECTION_Y)}
    >
      <div className={CONTAINER}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionIntro
            kicker={GARAGES_INTRO.kicker}
            title={GARAGES_INTRO.title}
            body={GARAGES_INTRO.body}
          />
          <CtaLink
            cta={GARAGES_INTRO.cta}
            variant="secondary"
            size="sm"
            className="self-start sm:self-auto"
          />
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {garages.map((garage) => (
            <li key={garage.id}>
              <Link
                href={`/garage/${garage.id}`}
                className={cn(
                  'block overflow-hidden rounded-xl border border-white/[0.08] bg-brand-rich transition-colors hover:border-white/20',
                  FOCUS_RING
                )}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-brand-graphite">
                  <Image
                    src={garage.photos[0]}
                    alt={`${garage.businessName} — garage photo`}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    // The guideline's grade (ch. 09.02), approximated: garage
                    // photos arrive warm and saturated from phones.
                    className="object-cover [filter:saturate(0.7)_contrast(1.1)]"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[17px] font-semibold leading-snug">
                      {garage.businessName}
                    </h3>
                    {garage.startingPrice != null && (
                      <p className="shrink-0 text-[14px] text-text-secondary">
                        from{' '}
                        <span className={grotesk.className}>
                          ₹{garage.startingPrice}
                        </span>
                      </p>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] text-text-secondary">
                    {[
                      garage.city,
                      garage.doorstepEnabled && garage.lat != null
                        ? 'Doorstep available'
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {garageTags(garage).length > 0 && (
                    <p className="mt-3 flex flex-wrap gap-1.5">
                      {garageTags(garage).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-white/[0.06] px-2 py-1 text-[12px] text-text-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ─── Testimonials ───────────────────────────────────────────────────────────

export function Testimonials({
  testimonials,
}: {
  testimonials: Testimonial[]
}) {
  return (
    <section
      id="reviews"
      className={cn('border-t border-white/[0.06]', SECTION_Y)}
    >
      <div className={CONTAINER}>
        <SectionIntro {...TESTIMONIALS_INTRO} />
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <li key={`${testimonial.name}-${index}`}>
              <figure className="flex h-full flex-col rounded-xl border border-white/[0.08] bg-brand-rich p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <p
                    role="img"
                    className="flex gap-0.5 text-brand-white"
                    aria-label={`Rated ${testimonial.rating} out of 5`}
                  >
                    {Array.from({ length: testimonial.rating }, (_, star) => (
                      <IconStarFilled key={star} size={16} aria-hidden />
                    ))}
                  </p>
                  {testimonial.sample && <SampleTag />}
                </div>
                <blockquote className="mt-5 flex-1 text-[16px] leading-relaxed text-brand-white">
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className="mt-6 border-t border-white/[0.06] pt-4">
                  <p className="text-[14px] font-semibold">
                    {testimonial.name}
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-secondary">
                    {testimonial.detail}
                  </p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ─── Three ways ─────────────────────────────────────────────────────────────

const MODE_ICONS: Record<ServiceMode, typeof IconHome> = {
  garage: IconBuildingStore,
  doorstep: IconHome,
  pickup: IconArrowsExchange,
}

export function Modes() {
  return (
    <section id="ways" className={SECTION_Y}>
      <div className={CONTAINER}>
        <SectionIntro {...MODES_INTRO} />
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {MODES.map((mode) => {
            const Icon = MODE_ICONS[mode.key]
            return (
              <li
                key={mode.key}
                className="flex flex-col rounded-xl border border-white/[0.08] bg-brand-rich p-6 sm:p-8"
              >
                <div className="flex items-start justify-between gap-3">
                  <Icon
                    size={28}
                    stroke={1.75}
                    aria-hidden
                    className="text-brand-white"
                  />
                  {mode.comingSoon && <ComingSoonTag />}
                </div>
                <h3 className="mt-6 text-[20px] font-semibold tracking-[-0.01em]">
                  {mode.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                  {mode.body}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ─── Why Detlio ─────────────────────────────────────────────────────────────

const PROMISE_ICONS: Record<PromiseIcon, typeof IconHome> = {
  'one-app': IconApps,
  'known-garages': IconUserCheck,
  support: IconHeadset,
  prices: IconReceipt,
  tracking: IconRoute,
  rewards: IconGift,
}

export function Promises() {
  return (
    <section
      id="why"
      className={cn('border-y border-white/[0.06] bg-brand-rich', SECTION_Y)}
    >
      <div className={CONTAINER}>
        <SectionIntro {...PROMISE_INTRO} />
        <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-3">
          {PROMISES.map((promise) => {
            const Icon = PROMISE_ICONS[promise.icon]
            return (
              <li key={promise.title} className="bg-brand-rich p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <Icon
                    size={28}
                    stroke={1.75}
                    aria-hidden
                    className="text-brand-white"
                  />
                  {promise.comingSoon && <ComingSoonTag />}
                </div>
                <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.01em]">
                  {promise.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                  {promise.body}
                </p>
                {/* The support promise is only as good as the way to reach
                    it, so it carries the real line. */}
                {promise.icon === 'support' && (
                  <SupportLinks className="mt-5" />
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** The business support line, from @repo/core/support — the one the app uses. */
function SupportLinks({ className }: { className?: string }) {
  const link = cn(
    'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-white/20 px-4 text-[14px] font-medium text-brand-white transition-colors hover:bg-white/[0.06]',
    FOCUS_RING
  )
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <a href={SUPPORT_TEL_HREF} className={link}>
        <IconHeadset size={18} stroke={1.5} aria-hidden />
        {SUPPORT_PHONE_DISPLAY}
      </a>
      <a
        href={SUPPORT_WHATSAPP_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        <IconBrandWhatsapp size={18} stroke={1.5} aria-hidden />
        WhatsApp
      </a>
    </div>
  )
}

// ─── Offers & rewards ───────────────────────────────────────────────────────

const PERK_ICONS: Record<PerkIcon, typeof IconHome> = {
  promo: IconDiscount,
  package: IconPackage,
  free: IconGift,
  points: IconCoins,
}

export function Perks() {
  return (
    <section
      id="perks"
      className={cn('border-t border-white/[0.06]', SECTION_Y)}
    >
      <div className={CONTAINER}>
        <SectionIntro {...PERKS_INTRO} />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((perk) => {
            const Icon = PERK_ICONS[perk.icon]
            return (
              <li
                key={perk.title}
                className="flex flex-col rounded-xl border border-white/[0.08] bg-brand-rich p-6 sm:p-8"
              >
                <div className="flex items-start justify-between gap-3">
                  <Icon
                    size={28}
                    stroke={1.75}
                    aria-hidden
                    className="text-brand-white"
                  />
                  {perk.comingSoon && <ComingSoonTag />}
                </div>
                <h3 className="mt-6 text-[20px] font-semibold tracking-[-0.01em]">
                  {perk.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                  {perk.body}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

export function Faq() {
  return (
    <section id="faq" className={SECTION_Y}>
      <div
        className={cn(
          CONTAINER,
          'grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16'
        )}
      >
        <SectionIntro kicker="FAQ" title="Questions, answered." />
        <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group">
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-medium [&::-webkit-details-marker]:hidden',
                  FOCUS_RING
                )}
              >
                {faq.q}
                <IconChevronDown
                  size={20}
                  stroke={1.75}
                  aria-hidden
                  className="shrink-0 text-text-secondary transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 pr-10 text-[15px] leading-relaxed text-text-secondary">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Closing call to action ─────────────────────────────────────────────────

export function FinalCta() {
  return (
    <section className={cn(CONTAINER, 'pb-16 sm:pb-24')}>
      <div className="relative isolate overflow-hidden rounded-xl border border-white/[0.08] bg-brand-rich px-6 py-16 text-center sm:px-12 sm:py-24">
        {/* The hero's overhead spotlight, echoed. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_70%)]"
        />
        <h2 className="mx-auto max-w-2xl text-balance text-[34px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
          {FINAL_CTA.title}
          <RedPeriod />
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-text-secondary sm:text-[18px]">
          {FINAL_CTA.body}
        </p>
        <CtaLink cta={FINAL_CTA.cta} className="mt-9" />
      </div>
    </section>
  )
}

// ─── Footer ─────────────────────────────────────────────────────────────────

export function SiteFooter() {
  const { email, instagram } = FOOTER.contact
  const contact = [
    { href: SUPPORT_TEL_HREF, label: SUPPORT_PHONE_DISPLAY, Icon: IconPhone },
    { href: SUPPORT_WHATSAPP_HREF, label: 'WhatsApp', Icon: IconBrandWhatsapp },
    email && { href: `mailto:${email}`, label: email, Icon: IconMail },
    instagram && {
      href: `https://instagram.com/${instagram.replace(/^@/, '')}`,
      label: `@${instagram.replace(/^@/, '')}`,
      Icon: IconBrandInstagram,
    },
  ].filter(Boolean) as Array<{
    href: string
    label: string
    Icon: typeof IconMail
  }>

  return (
    <footer className="border-t border-white/[0.06]">
      <div
        className={cn(
          CONTAINER,
          'flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between'
        )}
      >
        <div>
          <BrandMark height={26} />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-text-secondary">
            {FOOTER.tagline}
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-3">
          {FOOTER.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-sm text-[14px] text-text-secondary transition-colors hover:text-brand-white',
                FOCUS_RING
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {contact.length > 0 && (
          <ul className="flex flex-col gap-3">
            {contact.map(({ href, label, Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-sm text-[14px] text-text-secondary transition-colors hover:text-brand-white',
                    FOCUS_RING
                  )}
                >
                  <Icon size={18} stroke={1.75} aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className={cn(
          CONTAINER,
          'border-t border-white/[0.06] py-6 text-[13px] text-text-muted'
        )}
      >
        © {new Date().getFullYear()} Detlio. All rights reserved.
      </div>
    </footer>
  )
}
