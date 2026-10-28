import type { MetadataRoute } from 'next'
import { LEGAL_ROUTES } from '@/lib/legal/routes'

const SITE = 'https://detlio.com'

/**
 * The pages search engines should know about: the app landing (/), the
 * marketing page it used to be (/about, kept indexed: 0062), the garage
 * list and the legal pages. Garage pages are found through the list.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/about`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/garages`, changeFrequency: 'daily', priority: 0.8 },
    ...LEGAL_ROUTES.map((path) => ({
      url: `${SITE}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}
