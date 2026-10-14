import { VendorShellHeader } from '@repo/ui/features/vendor-shell-header'
import { cn } from '@repo/core/utils'
import { BottomNav, type NavType } from './bottom-nav'
import { BrandMark } from './brand-mark'

interface AppShellProps {
  children: React.ReactNode
  showNav?: boolean
  navType?: NavType
  /** Renders the Detlio wordmark top-left, above the page's own header. */
  showBrand?: boolean
  /** Content for the right of the brand row. Requires showBrand. */
  brandRight?: React.ReactNode
  className?: string
  /** Passed to the customer BottomNav: whether its Home tab also lights on /garages. */
  garagesUnderHome?: boolean
}

export function AppShell({
  children,
  showNav = false,
  navType = 'customer',
  showBrand = false,
  brandRight,
  className,
  garagesUnderHome,
}: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black">
      <main
        className={cn('flex flex-1 flex-col px-4', className)}
        style={showNav ? { paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' } : undefined}
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
      {showNav && <BottomNav type={navType} garagesUnderHome={garagesUnderHome} />}
    </div>
  )
}
