import type { Metadata, Viewport } from 'next'
import { RESULTS, TESTIMONIALS } from '@/components/marketing/content'
import { getLiveGarages } from '@/components/marketing/live-garages'
import {
  Faq,
  FinalCta,
  Garages,
  Hero,
  HowItWorks,
  Pillars,
  Results,
  Services,
  SiteFooter,
  SiteHeader,
  Testimonials,
} from '@/components/marketing/sections'

/**
 * The marketing homepage — what detlio.com shows a visitor who is not signed
 * in. Signed-in customers are sent on to the app: before paint by the script in
 * the root layout (see signed-in-landing.ts), or by AppProvider once the
 * session resolves.
 *
 * Server-rendered, so it is indexable and paints without waiting on the API.
 */

const TITLE = 'Detlio — Car wash & detailing from verified garages'
const DESCRIPTION =
  'Car wash, detailing and coating from verified garages near you. See the price before you book, and track every stage until your car is ready.'

export const metadata: Metadata = {
  metadataBase: new URL('https://detlio.com'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Detlio',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      { url: '/onboarding-car.jpg', width: 1170, height: 910, alt: 'Detlio' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/onboarding-car.jpg'],
  },
}

/**
 * The root layout pins maximumScale to 1 so iOS does not zoom into the app's
 * form fields. This page has no fields, and blocking pinch-zoom on a page
 * meant for reading fails WCAG 1.4.4 — so here it is allowed.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

/**
 * Placeholder results and reviews are for reviewing the layout: shown locally
 * and on Vercel preview deployments, never in production — where a section
 * with nothing real in it is left out. See content.ts.
 */
const SHOW_SAMPLES =
  process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'

export default async function HomePage() {
  const garages = await getLiveGarages()

  const results = RESULTS.filter((result) => SHOW_SAMPLES || !result.sample)
  const testimonials = TESTIMONIALS.filter(
    (testimonial) => SHOW_SAMPLES || !testimonial.sample
  )
  // A row of one or two looks like an empty shop window; wait for a fuller one.
  const showGarages = garages.featured.length >= 3

  const navLinks = [
    { label: 'Services', href: '#services' },
    { label: 'How it works', href: '#how-it-works' },
    ...(results.length ? [{ label: 'Results', href: '#results' }] : []),
    ...(showGarages ? [{ label: 'Garages', href: '#garages' }] : []),
    { label: 'FAQ', href: '#faq' },
  ]

  return (
    <>
      <SiteHeader links={navLinks} />
      <main data-marketing-home>
        <Hero
          city={garages.cities.length === 1 ? garages.cities[0] : null}
          startingPrice={garages.startingPrice}
        />
        <Services />
        <HowItWorks />
        {results.length > 0 && <Results results={results} />}
        {showGarages && <Garages garages={garages.featured} />}
        {testimonials.length > 0 && (
          <Testimonials testimonials={testimonials} />
        )}
        <Pillars />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
