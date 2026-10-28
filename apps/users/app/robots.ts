import type { MetadataRoute } from 'next'

/**
 * Everything may be crawled, as before this file existed (pages that must
 * not be indexed say so themselves: /c/<code>, /gift, /verify, /invite);
 * this only points crawlers at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://detlio.com/sitemap.xml',
  }
}
