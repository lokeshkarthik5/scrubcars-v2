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
  deleteAccount: '/delete-account',
} as const

export const LEGAL_LINKS = [
  { label: 'Terms of Use', href: LEGAL_PATHS.terms },
  { label: 'Privacy Policy', href: LEGAL_PATHS.privacy },
  { label: 'Cancellation & Refunds', href: LEGAL_PATHS.refunds },
  { label: 'Service delivery', href: LEGAL_PATHS.delivery },
  { label: 'Contact & grievances', href: LEGAL_PATHS.contact },
] as const

/**
 * Where the footers send someone to delete their account (Google Play wants a
 * public link that works without opening the app). Not in LEGAL_LINKS: the
 * Profile's Legal group has its own Delete account button.
 */
export const DELETE_ACCOUNT_LINK = { label: 'Delete your account', href: LEGAL_PATHS.deleteAccount } as const

/** The marketing footer's Legal column: the five pages and the way to delete an account. */
export const FOOTER_LEGAL_LINKS = [...LEGAL_LINKS, DELETE_ACCOUNT_LINK] as const

/** Every legal page's path, for the route gate. */
export const LEGAL_ROUTES: readonly string[] = Object.values(LEGAL_PATHS)
