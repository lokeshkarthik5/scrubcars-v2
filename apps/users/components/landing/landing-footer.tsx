import Link from 'next/link'
import { CookieSettingsButton } from '@/components/consent/cookie-settings-button'
import { OPERATED_BY } from '@/lib/legal/common'
import { LEGAL_PATHS } from '@/lib/legal/routes'

const LINKS = [
  { label: 'About', href: '/about' },
  { label: 'How it works', href: '/about#how-it-works' },
  { label: 'FAQ', href: '/about#faq' },
  { label: 'Terms', href: LEGAL_PATHS.terms },
  { label: 'Privacy', href: LEGAL_PATHS.privacy },
  { label: 'Contact', href: LEGAL_PATHS.contact },
] as const

const LINK =
  'inline-flex min-h-11 items-center text-[13px] text-text-secondary underline-offset-2 hover:text-text-primary hover:underline'

/**
 * The landing page's compact footer: the story (/about and its sections),
 * the legal pages, cookie settings and who runs Detlio (the E-Commerce
 * Rules want the business's name and address shown, as /about's footer
 * does).
 */
export function LandingFooter() {
  return (
    <footer className="mt-4 flex flex-col gap-2 border-t border-line pt-4 pb-2">
      <nav aria-label="Footer" className="flex flex-wrap gap-x-4">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={LINK}>
            {link.label}
          </Link>
        ))}
        <CookieSettingsButton className={LINK} />
      </nav>
      <p className="text-[12px] leading-relaxed text-text-muted">{OPERATED_BY}</p>
      <p className="text-[12px] text-text-muted">
        © {new Date().getFullYear()} Detlio. All rights reserved.
      </p>
    </footer>
  )
}
