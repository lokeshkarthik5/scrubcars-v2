import { cn } from '@/lib/utils'
import { BottomNav } from './bottom-nav'

interface AppShellProps {
  children: React.ReactNode
  showNav?: boolean
  navType?: 'customer' | 'vendor'
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
        className={cn(
          'flex flex-1 flex-col px-4',
          showNav && 'pb-20',
          className
        )}
      >
        {children}
      </main>
      {showNav && <BottomNav type={navType} />}
    </div>
  )
}
