import type { Metadata } from 'next'
import { GarageListScreen } from '@/components/garages/garage-list-screen'

const TITLE = 'Garages · Detlio'
const DESCRIPTION =
  'Car wash and detailing garages in Chennai, with their prices. Book at the garage or at your door.'

// Every link that means "the list of garages" opens here. It is public, like
// /home: a visitor can browse and pick a garage before signing in.
//
// The twitter title is set explicitly: the root layout's would otherwise win
// over openGraph, and a shared link would read just "Detlio".
//
// The share image is named here, unlike on the homepage. Next adds the image
// files (app/opengraph-image.png, twitter-image.png) only to the segment they
// sit in, and a page's own openGraph and twitter replace the root's whole. So
// without these, a /garages link shared on WhatsApp would show no picture and
// X would fall back to the small card. This is the URL the marketing CTAs open,
// so it is the one people share.
const SHARE_IMAGE = {
  url: '/opengraph-image.png',
  width: 1200,
  height: 630,
  alt: 'Detlio. Care without compromise.',
}

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/garages' },
  openGraph: {
    type: 'website',
    url: '/garages',
    siteName: 'Detlio',
    title: TITLE,
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SHARE_IMAGE],
  },
}

export default function GaragesPage() {
  return <GarageListScreen />
}
