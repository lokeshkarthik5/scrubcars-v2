import type { ComponentProps } from 'react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { HubNav } from '@/components/home/hub-nav'
import { isHomeHubEnabled } from '@/lib/home-hub'

type CustomerShellProps = Omit<ComponentProps<typeof AppShell>, 'navType' | 'floatingNav'>

/**
 * AppShell for the customer app's own screens. With NEXT_PUBLIC_HOME_HUB on,
 * a screen that shows the nav gets the Home hub's floating pill (HubNav) and
 * the bottom padding that keeps content clear of it; with it off — production
 * until the owner signs off — this is AppShell exactly as before, flat bar and
 * all. The flag is read at build time, so a build is one or the other.
 *
 * Customer-only by construction: the vendor and admin apps never import it,
 * and AppShell draws their bars as it always has.
 */
export function CustomerShell(props: CustomerShellProps) {
  return <AppShell {...props} floatingNav={isHomeHubEnabled() ? <HubNav /> : undefined} />
}
