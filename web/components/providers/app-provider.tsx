'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'

export function AppProvider({ children }: { children: React.ReactNode }) {
  const restoreSession = useAuthStore((s) => s.restoreSession)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const setHydrated = useAuthStore((s) => s.setHydrated)

  useEffect(() => {
    if (!isHydrated) {
      setHydrated()
    }
    void restoreSession()
  }, [isHydrated, restoreSession, setHydrated])

  return <>{children}</>
}
