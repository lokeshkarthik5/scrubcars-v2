import type { OpeningDay } from '@repo/core/opening-hours';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import { getMyVendor, getVendorClosures, getVendorWorkingHours, getWorkingHours } from './garage-api';
import type { CalendarClosure, GarageRoom } from './jobs';
import { getMyClosures } from './vendor-api';

/**
 * apps/vendors/lib/use-garage-calendar.ts: what the Bookings calendar needs
 * besides the jobs. The owner's own hours and time off; an operator reads the
 * garage page's public copies instead (hours, and holidays without reasons),
 * and with neither the calendar draws 9 to 6 and calls no day closed. The room
 * (bays, the daily cap, a pause) comes from /vendors/me, which every seat can read.
 * Read again every time the calendar opens, as on the web: Settings doesn't touch
 * these keys when it saves hours, time off or a pause.
 */
/** Until /vendors/me is in: one bay, no cap, not paused. */
const NO_ROOM_READ: GarageRoom = { bays: null, jobsPerDay: null, paused: false };

export function useGarageCalendar(from: string) {
  const vendorId = useAuth((s) => s.vendor?.id ?? null);

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
      ]);
      const room: GarageRoom = {
        bays: vendor?.bays ?? null,
        jobsPerDay: vendor?.jobsPerDay ?? null,
        paused: Boolean(vendor?.bookingsPausedAt),
      };
      return { hours: hours as OpeningDay[], room };
    },
  });

  const closures = useQuery({
    queryKey: ['garage-calendar-closures', vendorId, from],
    enabled: Boolean(vendorId),
    staleTime: 0,
    refetchOnMount: 'always',
    // Paging to another month keeps the last list until the new one is in.
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<CalendarClosure[]> => {
      try {
        const mine = await getMyClosures(from);
        return mine.map(({ date, reason }) => ({ date, reason }));
      } catch {
        const dates = await getVendorClosures(vendorId!).catch(() => [] as string[]);
        return dates.map((date) => ({ date, reason: null }));
      }
    },
  });

  return {
    hours: setup.data?.hours ?? [],
    room: setup.data?.room ?? NO_ROOM_READ,
    closures: closures.data ?? [],
  };
}
