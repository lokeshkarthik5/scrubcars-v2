'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  showBack?: boolean
  backHref?: string
  right?: React.ReactNode
  className?: string
}

export function TopBar({ title, showBack, backHref, right, className }: TopBarProps) {
  const router = useRouter()
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 py-3',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {showBack &&
          (backHref ? (
            <Link href={backHref} className="shrink-0 text-text-primary">
              <IconArrowLeft size={22} stroke={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              className="shrink-0 text-text-primary"
              aria-label="Go back"
            >
              <IconArrowLeft size={22} stroke={1.5} />
            </button>
          ))}
        {title && (
          <h1 className="truncate text-lg font-semibold text-text-primary">{title}</h1>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}
