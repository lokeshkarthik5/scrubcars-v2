import { VendorShellHeader } from '@repo/ui/features/vendor-shell-header'
import { cn } from '@repo/core/utils'
import { BottomNav, type NavType } from './bottom-nav'
import { BrandMark } from './brand-mark'
import { GarageBar } from './nav-slot'

/**
 * How far a page's content stops above the bottom edge when a floating nav
 * sits over it: the customer app's pill or the garage's (64pt tall, 20pt off
 * the bottom, with its scrim) plus room to spare, so the last card can always
 * be scrolled clear of it and is never read through the blur.
 */
export const FLOATING_NAV_CLEARANCE = 'calc(112px + env(safe-area-inset-bottom))'

interface AppShellProps {
  children: React.ReactNode
  showNav?: boolean
  navType?: NavType
  /** Renders the Detlio wordmark top-left, above the page's own header. */
  showBrand?: boolean
  /** Content for the right of the brand row. Requires showBrand. */
  brandRight?: React.ReactNode
  className?: string
  /**
   * A nav of the app's own, drawn in place of the flat BottomNav while showNav
   * is on: the customer app's floating pill while the Home hub is on
   * (NEXT_PUBLIC_HOME_HUB, apps/users CustomerShell). It floats over the page
   * rather than sitting under it, so the page clears FLOATING_NAV_CLEARANCE.
   * The garage portal (navType="vendor") always floats its own: GarageNav,
   * or Garage Book's bar while the book is on (GarageBar, nav-slot.tsx);
   * unset for admin and customers with the hub off, the flat bar stays.
   */
  floatingNav?: React.ReactNode
}

export function AppShell({
  children,
  showNav = false,
  navType = 'customer',
  showBrand = false,
  brandRight,
  className,
  floatingNav,
}: AppShellProps) {
  // The garage's bar floats in the customer app's look (owner, 10 Nov 2026).
  const floating = floatingNav || (navType === 'vendor' ? <GarageBar /> : null)
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black">
      <main
        className={cn('flex flex-1 flex-col px-4', className)}
        style={
          showNav
            ? {
                paddingBottom: floating
                  ? FLOATING_NAV_CLEARANCE
                  : 'calc(5rem + env(safe-area-inset-bottom))',
              }
            : undefined
        }
      >
        {navType === 'vendor' && <VendorShellHeader />}
        {showBrand && (
          <div className="flex items-center justify-between gap-3">
            <BrandMark height={32} priority />
            {brandRight && <div className="min-w-0 text-right">{brandRight}</div>}
          </div>
        )}
        {children}
      </main>
      {/* Truthiness, not ??: a caller's `flag && <Nav />` passes false when
          off, and that must still mean the flat bar, as the padding above does. */}
      {showNav && (floating || <BottomNav type={navType} />)}
    </div>
  )
}
