import { cn } from '@/lib/utils'
import { BottomNav, type NavType } from './bottom-nav'

interface AppShellProps {
  children: React.ReactNode
  showNav?: boolean
  navType?: NavType
  className?: string
}

export function AppShell({
  children,
  showNav = false,
  navType = 'customer',
  className,
}: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black">
      <main
        className={cn('flex flex-1 flex-col px-4', className)}
        style={showNav ? { paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' } : undefined}
      >
        {children}
      </main>
      {showNav && <BottomNav type={navType} />}
    </div>
  )
}
