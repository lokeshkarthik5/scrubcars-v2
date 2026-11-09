'use client'

import { useQuery } from '@tanstack/react-query'
import { getMyVendor } from '@repo/core/api/vendors'
import { useAuthStore } from '@repo/core/stores/auth-store'

/**
 * Whether Garage Book is on for this garage: the portal's switch
 * (NEXT_PUBLIC_GARAGE_BOOK=on) and the server's (GARAGE_BOOK, read from
 * GET /vendors/me's `garageBook.enabled`). Off either way, the portal is
 * exactly as it was: today's five tabs and screens.
 *
 * The last answer for each garage is kept on this device, so the bar does
 * not flash from the old one to the new on every page load.
 */
export const GARAGE_BOOK_BUILD_ON = process.env.NEXT_PUBLIC_GARAGE_BOOK === 'on'

const REMEMBER = 'detlio.garageBook.'

function remembered(vendorId: string | null): boolean {
  if (!vendorId || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(REMEMBER + vendorId) === '1'
  } catch {
    return false
  }
}

export function useGarageBookOn(): { on: boolean; known: boolean } {
  const vendorId = useAuthStore((s) => s.activeVendorId)
  const query = useQuery({
    queryKey: ['vendor', 'me', 'garage-book', vendorId ?? 'none'],
    queryFn: getMyVendor,
    enabled: GARAGE_BOOK_BUILD_ON && Boolean(vendorId),
    staleTime: 5 * 60_000,
  })
  if (!GARAGE_BOOK_BUILD_ON) return { on: false, known: true }
  if (query.data) {
    const on = query.data.garageBook?.enabled === true
    try {
      if (vendorId) window.localStorage.setItem(REMEMBER + vendorId, on ? '1' : '0')
    } catch {
      // Not remembered; asked again next time.
    }
    return { on, known: true }
  }
  return { on: remembered(vendorId), known: query.isError }
}
