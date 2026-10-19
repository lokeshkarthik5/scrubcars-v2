'use client'

import { useAdminMe } from '@repo/core/api/hooks/use-admin-logins'
import { cn } from '@repo/core/utils'

/**
 * "Signed as Raga": where a dialog used to ask for a name. Since personal
 * logins (0058) the server signs every admin action with the signed-in
 * admin's name, so the panel says whose name it will be instead of asking.
 */
export function SignedAs({ className }: { className?: string }) {
  const { data: me } = useAdminMe()
  if (!me) return null
  return (
    <p className={cn('text-[12px] text-text-secondary', className)}>
      Signed as {me.name}
    </p>
  )
}
