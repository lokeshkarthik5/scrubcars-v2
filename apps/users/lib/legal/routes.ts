/**
 * The legal pages' paths and link labels: the footer, the profile's Legal
 * group, the checkout line and the route gate all read these.
 */
export const LEGAL_PATHS = {
  terms: '/terms',
  privacy: '/privacy',
  refunds: '/refund-policy',
  delivery: '/service-delivery',
  contact: '/contact',
} as const

export const LEGAL_LINKS = [
  { label: 'Terms of Use', href: LEGAL_PATHS.terms },
  { label: 'Privacy Policy', href: LEGAL_PATHS.privacy },
  { label: 'Cancellation & Refunds', href: LEGAL_PATHS.refunds },
  { label: 'Service delivery', href: LEGAL_PATHS.delivery },
  { label: 'Contact & grievances', href: LEGAL_PATHS.contact },
] as const

/** Every legal page's path, for the route gate. */
export const LEGAL_ROUTES: readonly string[] = Object.values(LEGAL_PATHS)
