'use client'

import { cn } from '@/lib/utils'
import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

const borderColors: Record<ToastType, string> = {
  success: 'border-l-success',
  error: 'border-l-brand-red',
  warning: 'border-l-warning',
  info: 'border-l-info',
}

interface ToastProps {
  message: string
  type?: ToastType
  visible: boolean
  onDismiss: () => void
  duration?: number
}

export function Toast({
  message,
  type = 'success',
  visible,
  onDismiss,
  duration = 3000,
}: ToastProps) {
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [visible, duration, onDismiss])

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed top-4 left-1/2 z-50 w-[calc(100%-32px)] max-w-[396px] -translate-x-1/2 rounded-[10px] border-l-[3px] bg-surface px-4 py-3 text-[13px] text-text-primary shadow-lg',
        borderColors[type]
      )}
    >
      {message}
    </div>
  )
}
