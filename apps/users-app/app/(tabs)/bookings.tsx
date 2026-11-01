import { getUpdates } from '@repo/core/api/home';
import { homeKeys } from '@repo/core/api/hooks/use-home';
import { bookAgainPath, matchSavedAddress } from '@repo/core/book-again';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatWhen } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { type BookingListTab, DEFAULT_BOOKING_LIST_TAB, parseBookingListTab, splitBookingList } from '@repo/core/my-bookings';
import { PICKUP_STAGE_NOW, pickupStageOf } from '@repo/core/pickup';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Address, Booking } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconArrowUpRight, IconRepeat } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, ScCard, ScSegmented, Skeleton, StatusChip } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { actionsByBooking, answersByLine, customerStatusChip } from '@/lib/booking-status';
import { money } from '@/lib/price';

function pickupLine(booking: Booking): string | null {
  if (booking.bookingType !== 'pickup') return null;
  const live = ['pending', 'confirmed', 'in_progress'].includes(booking.status);
  const stage = live
    ? pickupStageOf({
        status: booking.status,
        pickedUpAt: booking.pickup?.pickedUpAtIso,
        atGarageAt: booking.pickup?.atGarageAtIso,
        startedAt: booking.startedAtIso,
        outForDeliveryAt: booking.pickup?.outForDeliveryAtIso,
        deliveredAt: booking.pickup?.deliveredAtIso,
      })
    : 'booked';
  return stage === 'booked' ? BOOKING_TYPE_LABELS.pickup : `${BOOKING_TYPE_LABELS.pickup} · ${PICKUP_STAGE_NOW[stage]}`;
}

/** BookingCard (apps/users/app/bookings/page.tsx). */
function BookingCard({ booking, tab, addresses, action, now }: { booking: Booking; tab: BookingListTab; addresses: Address[]; action: string | null; now: number }) {
  const colors = useColors();
  const styles = useStyles();
  const chip = customerStatusChip(booking.status);
  const refunded = booking.status === 'cancelled' && booking.refund.status === 'refunded';
  const pickup = pickupLine(booking);
  const unpaid = booking.paymentMethod === 'online' && booking.paymentStatus === 'pending' && booking.status === 'pending';
  const needs = action ?? (unpaid ? 'Pay to hold your slot' : null);
  const waitingUntil =
    !needs && booking.status === 'pending' && booking.responseDeadline && Date.parse(booking.responseDeadline.respondBy) > now
      ? answersByLine(booking.responseDeadline.respondBy, now)
      : null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${booking.serviceSummary} at ${booking.vendorName}, ${chip.label}${refunded ? ', Refunded' : ''}${needs ? `, ${needs}` : ''}`}
      onPress={() => router.push(`/bookings/${booking.id}` as Href)}
    >
      <ScCard style={[styles.card, needs ? styles.cardNeeds : null]}>
        <View style={styles.top}>
          <T size={17} lh={22} style={styles.grow}>
            {booking.serviceSummary}
          </T>
          <View style={styles.chips}>
            {refunded ? <StatusChip tone="done">Refunded</StatusChip> : null}
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
          </View>
        </View>
        <T size={13} lh={18} color={colors.dim}>
          {[booking.vendorName, booking.vehicle?.model, formatWhen(booking.scheduledAtIso, now)].filter(Boolean).join(' · ')}
        </T>
        {pickup ? (
          <T size={13} lh={18} color={colors.dim}>
            {pickup}
          </T>
        ) : null}
        <View style={styles.bottom}>
          {needs ? (
            <View style={styles.needs}>
              <View style={styles.dot} />
              <T size={13} lh={18} style={styles.grow}>
                {needs}
              </T>
            </View>
          ) : (
            <T size={13} lh={18} color={colors.dim} style={styles.grow}>
              {waitingUntil ?? (booking.paymentStatus === 'paid' ? 'Paid' : booking.paymentStatus === 'refunded' ? 'Paid · refunded' : '')}
            </T>
          )}
          <View style={styles.price}>
            {booking.discountAmount > 0 ? (
              <T num size={13} lh={18} color={colors.textMuted} style={styles.struck}>
                {money(booking.subtotalPrice)}
              </T>
            ) : null}
            <T num size={15} lh={20}>
              {money(booking.servicePrice)}
            </T>
          </View>
        </View>
        {tab === 'past' ? (
          <View style={styles.againRow}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Book again: ${booking.serviceSummary} at ${booking.vendorName}`}
              onPress={() => router.push(bookAgainPath(booking, matchSavedAddress(booking, addresses)) as Href)}
              style={styles.again}
            >
              <IconRepeat size={15} />
              <T size={13} weight={500} lh={18}>
                Book again
              </T>
            </Pressable>
          </View>
        ) : null}
      </ScCard>
    </Pressable>
  );
}

/** apps/users/app/bookings/page.tsx. */
export default function BookingsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<BookingListTab>(() => parseBookingListTab(params.tab ?? DEFAULT_BOOKING_LIST_TAB));
  const user = useAuth((s) => s.user);
  const customerBookings = useBookingsStore((s) => s.customerBookings);
  const fetchCustomerBookings = useBookingsStore((s) => s.fetchCustomerBookings);
  const addresses = useUserStore((s) => s.addresses);
  const fetchAddresses = useUserStore((s) => s.fetchAddresses);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const now = useNow(60_000);
  const updates = useQuery({ queryKey: homeKeys.updates(), queryFn: getUpdates, staleTime: 30_000, enabled: !!user });
  const actions = actionsByBooking(updates.data?.todo, money);
  const needsAddresses = addresses.length === 0 && customerBookings.some((b) => b.bookingType !== 'dropin');

  useEffect(() => {
    if (user && needsAddresses) void fetchAddresses().catch(() => undefined);
  }, [user, needsAddresses, fetchAddresses]);
  useEffect(() => {
    if (!user) return;
    fetchCustomerBookings().then(
      () => setLoaded(true),
      () => setLoadFailed(true)
    );
  }, [user, fetchCustomerBookings, attempt]);
  useFocusEffect(
    useCallback(() => {
      if (user) void fetchCustomerBookings().catch(() => undefined);
    }, [user, fetchCustomerBookings])
  );

  if (!user) {
    return (
      <CustomerShell>
        <T accessibilityRole="header" size={28} weight={300} lh={34} tracking={-0.025}>
          Bookings
        </T>
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            Login to view your bookings
          </T>
          <T size={13} align="center" color={colors.textSecondary}>
            Sign in to see your booking history
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push('/login?next=%2Fbookings' as Href)} style={styles.login}>
            Login
          </ScButton>
        </View>
      </CustomerShell>
    );
  }

  const lists = splitBookingList(customerBookings);
  const waiting = !loaded && customerBookings.length === 0;
  const list = lists[tab];

  return (
    <CustomerShell>
      <T accessibilityRole="header" size={28} weight={300} lh={34} tracking={-0.025}>
        Bookings
      </T>
      <ScSegmented
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
        value={tab}
        onChange={(value) => setTab(value as BookingListTab)}
      />
      {loadFailed && !loaded && customerBookings.length === 0 ? (
        <ErrorState
          message="Couldn't load your bookings. Check your connection."
          onRetry={() => {
            setLoadFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : waiting ? (
        <View style={styles.list}>
          <Skeleton height={132} />
          <Skeleton height={132} />
        </View>
      ) : list.length === 0 ? (
        tab === 'upcoming' ? (
          <View style={styles.none}>
            <T size={20} lh={28} tracking={-0.015} align="center">
              No upcoming bookings
            </T>
            <T size={15} lh={22} color={colors.textSecondary} align="center">
              Book a car wash or detailing at a garage near you.
            </T>
            <ScButton variant="main" fullWidth={false} onPress={() => router.push('/search' as Href)} style={styles.find}>
              <Label color={colors.white}>Find garages</Label>
              <IconArrowUpRight size={17} stroke={1.5} color={colors.white} />
            </ScButton>
          </View>
        ) : (
          <EmptyState title="No past bookings yet" subtitle="Bookings that are done or cancelled show here." />
        )
      ) : (
        <View style={styles.list}>
          {list.map((booking) => (
            <BookingCard key={booking.id} booking={booking} tab={tab} addresses={addresses} action={tab === 'upcoming' ? (actions.get(booking.id) ?? null) : null} now={now} />
          ))}
        </View>
      )}
    </CustomerShell>
  );
}

const useStyles = createStyles((c) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  login: { marginTop: 8 },
  list: { gap: 8 },
  none: { alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 56 },
  find: { marginTop: 16 },
  card: { gap: 6, padding: 20 },
  cardNeeds: { borderColor: c.redFill },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  needs: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: c.redFill },
  price: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  struck: { textDecorationLine: 'line-through' },
  againRow: { marginBottom: -12, marginTop: 4, flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: c.line, paddingTop: 2 },
  again: { marginRight: -8, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
}));
