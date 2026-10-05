import type { Metadata, Viewport } from 'next'
import type { LegalDoc } from './doc-format'
import { LEGAL_DRAFT } from './details'

/**
 * A legal page's metadata: its own title and description, its canonical URL
 * on detlio.com (metadataBase is set in the root layout), and — while the
 * pages are drafts — a robots noindex, so a draft is never what a search
 * engine keeps.
 */
export function legalMetadata(doc: LegalDoc): Metadata {
  const title = `${doc.title} · Detlio`
  return {
    title,
    description: doc.description,
    alternates: { canonical: doc.path },
    robots: LEGAL_DRAFT ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      url: doc.path,
      siteName: 'Detlio',
      title,
      description: doc.description,
    },
    // Set explicitly: the root layout's twitter title would otherwise win
    // over openGraph, and a shared legal page would read just "Detlio".
    twitter: {
      title,
      description: doc.description,
    },
  }
}

/**
 * Pages meant for reading: pinch-zoom allowed, unlike the app's screens
 * (the root layout pins maximumScale to 1 for its form fields), because
 * blocking zoom on text fails WCAG 1.4.4.
 */
export const LEGAL_VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}
