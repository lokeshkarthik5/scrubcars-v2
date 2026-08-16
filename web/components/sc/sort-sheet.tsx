'use client'

import { useEffect } from 'react'
import { IconCircleX } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export type SortKey = 'relevance' | 'rating' | 'price_asc' | 'price_desc'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'price_asc', label: 'Cost: Low to High' },
  { value: 'price_desc', label: 'Cost: High to Low' },
]

export function sortLabel(value: SortKey) {
  return SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Relevance'
}

interface SortSheetProps {
  open: boolean
  value: SortKey
  onChange: (value: SortKey) => void
  onClose: () => void
}

export function SortSheet({ open, value, onChange, onClose }: SortSheetProps) {
  // The sheet blurs the page behind it, so stop the page scrolling underneath.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Sort by"
        className="w-full max-w-[428px] rounded-t-[22px] border-t border-border bg-brand-black pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center py-2.5">
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between border-b border-border px-5 pb-4 pt-1">
          <h2 className="text-[17px] font-semibold text-text-primary">Sort by</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <IconCircleX size={22} className="text-text-secondary" />
          </button>
        </div>

        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onChange(opt.value)
              onClose()
            }}
            className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-left last:border-b-0"
          >
            <span className="text-[15px] text-text-primary">{opt.label}</span>
            <span
              className={cn(
                'flex h-[18px] w-[18px] items-center justify-center rounded-full border-2',
                value === opt.value ? 'border-brand-red' : 'border-text-muted'
              )}
            >
              {value === opt.value && <span className="h-2.5 w-2.5 rounded-full bg-brand-red" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
