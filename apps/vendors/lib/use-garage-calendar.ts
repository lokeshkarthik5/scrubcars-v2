'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getMyClosures,
  getMyVendor,
  getVendorClosures,
  getVendorWorkingHours,
  getWorkingHours,
} from '@repo/core/api/vendors'
import type { OpeningDay } from '@repo/core/opening-hours'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { CalendarClosure, GarageRoom } from '@/lib/calendar'

/**
 * What the Bookings calendar needs besides the jobs (which come from the one
 * poller, useVendorBookings, already the garage's whole list): its weekly
 * hours, its room (bays, the daily cap, whether bookings are paused) and its
 * time off from `from` on.
 *
 * The owner reads its own settings. An operator can't (Settings is the
 * owner's), so it falls back to the garage page's public copies: the same
 * hours, and the upcoming holidays without their reasons; a garage that
 * isn't listed yet has no public copy, and the calendar then draws 9 to 6
 * and calls no day closed rather than guess. The room comes from
 * /vendors/me, which every seat can read.
 *
 * Read again every time the calendar opens (staleTime 0, refetchOnMount
 * 'always'): Settings saves hours, time off and a pause through plain calls
 * that don't touch these keys, and an owner who adds Friday off and comes
 * straight back must not see Friday open with Free time on it. What was read
 * last still shows while the new copy loads.
 */
/**
 * Until /vendors/me is in: one bay, no cap, not paused. Only the Free boxes
 * read the cap and the pause, and they wait for the hours, which come in the
 * same read.
 */
const NO_ROOM_READ: GarageRoom = { bays: null, jobsPerDay: null, paused: false }

export function useGarageCalendar(from: string) {
  const vendorId = useAuthStore((s) => s.vendor?.id ?? null)

  const setup = useQuery({
    queryKey: ['garage-calendar-setup', vendorId],
    enabled: Boolean(vendorId),
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const [hours, vendor] = await Promise.all([
        getWorkingHours()
          .catch(() => getVendorWorkingHours(vendorId!))
          .catch(() => [] as OpeningDay[]),
        getMyVendor().catch(() => null),
      ])
      const room: GarageRoom = {
        bays: vendor?.bays ?? null,
        jobsPerDay: vendor?.jobsPerDay ?? null,
        paused: Boolean(vendor?.bookingsPausedAt),
      }
      return { hours: hours as OpeningDay[], room }
    },
  })

  const closures = useQuery({
    queryKey: ['garage-calendar-closures', vendorId, from],
    enabled: Boolean(vendorId),
    staleTime: 0,
    refetchOnMount: 'always',
    // Paging to another month keeps the last list until the new one is in,
    // so the closed days don't blink off and on.
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<CalendarClosure[]> => {
      try {
        const mine = await getMyClosures(from)
        return mine.map(({ date, reason }) => ({ date, reason }))
      } catch {
        const dates = await getVendorClosures(vendorId!).catch(
          () => [] as string[]
        )
        return dates.map((date) => ({ date, reason: null }))
      }
    },
  })

  return {
    hours: setup.data?.hours ?? [],
    room: setup.data?.room ?? NO_ROOM_READ,
    closures: closures.data ?? [],
  }
}
