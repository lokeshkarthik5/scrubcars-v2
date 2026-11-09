import { getUpdates } from '@repo/core/api/home';
import { homeKeys } from '@repo/core/api/hooks/use-home';
import { bookAgainPath, matchSavedAddress } from '@repo/core/book-again';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatClock, formatDay, formatWhen } from '@repo/core/format';
import { countdownBox, countdownParts, countdownWords } from '@repo/core/moments';
import { useNow } from '@repo/core/hooks/use-now';
import { type BookingListTab, DEFAULT_BOOKING_LIST_TAB, parseBookingListTab, splitBookingList } from '@repo/core/my-bookings';
import { PICKUP_STAGE_NOW, pickupStageOf, pickupTimeline } from '@repo/core/pickup';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Address, Booking } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconArrowUpRight, IconRepeat } from '@repo/native-ui/icons';
import { Edge, Recessed } from '@repo/native-ui/finish';
import { Rise } from '@repo/native-ui/motion';
import { EmptyState, ErrorState, ScCard, ScSegmented, Skeleton, StatusChip } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ProgressRoad, statusStops } from '@/components/moments/road';
import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { actionsByBooking, answersByLine, bookingHeadline, customerStatusChip, STATUS_STEPS } from '@/lib/booking-status';
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

/** What every card of a booking says: its chip, what it needs, and its whole name for a screen reader. */
function cardFacts(booking: Booking, action: string | null, now: number) {
  const chip = customerStatusChip(booking.status);
  const refunded = booking.status === 'cancelled' && booking.refund.status === 'refunded';
  const unpaid = booking.paymentMethod === 'online' && booking.paymentStatus === 'pending' && booking.status === 'pending';
  const needs = action ?? (unpaid ? 'Pay to hold your slot' : null);
  const waitingUntil =
    !needs && booking.status === 'pending' && booking.responseDeadline && Date.parse(booking.responseDeadline.respondBy) > now
      ? answersByLine(booking.responseDeadline.respondBy, now)
      : null;
  const label = `${booking.serviceSummary} at ${booking.vendorName}, ${chip.label}${refunded ? ', Refunded' : ''}${needs ? `, ${needs}` : ''}`;
  return { chip, refunded, needs, waitingUntil, label };
}

/**
 * The ticket card (moment 5; apps/users/app/bookings/page.tsx): the next booking at the
 * top of Upcoming, as a ticket with notched edges, a live countdown in days, hours and
 * minutes, and the small road for where it stands. The same link, words and actions as
 * every booking card; only the look is a ticket's. Rises in once.
 */
function TicketCard({ booking, action, now }: { booking: Booking; action: string | null; now: number }) {
  const colors = useColors();
  const styles = useStyles();
  const { fx } = useFinish();
  const { chip, needs, waitingUntil, label } = cardFacts(booking, action, now);
  const headline = bookingHeadline(booking, now);
  const pickup = booking.bookingType === 'pickup' ? pickupTimeline(booking) : null;
  const stops =
    headline.step === null
      ? null
      : pickup
        ? pickup.map((step) => ({ label: step.label, state: step.state }))
        : statusStops(STATUS_STEPS, headline.step, booking.status === 'completed');
  const parts = countdownParts(Date.parse(booking.scheduledAtIso), now);
  const boxes: [number, 'days' | 'hours' | 'minutes', string][] = [
    [parts.days, 'days', 'days'],
    [parts.hours, 'hours', 'hours'],
    [parts.minutes, 'minutes', 'min'],
  ];
  const carLine = [booking.vehicle?.model, pickupLine(booking)].filter(Boolean).join(' · ');
  return (
    <Rise>
      <Pressable accessibilityRole="link" accessibilityLabel={`${label}. Starts in ${countdownWords(parts)}`} onPress={() => router.push(`/bookings/${booking.id}` as Href)}>
        <Edge radius={22} style={[styles.ticket, needs ? styles.ticketNeeds : null]}>
          <T variant="over" color={fx.quiet}>
            Next booking
          </T>
          <T variant="t2" style={styles.ticketWhen}>
            {`${formatDay(booking.scheduledAtIso, now)} · `}
            <T num variant="t2">
              {formatClock(booking.scheduledAtIso)}
            </T>
          </T>
          <View style={styles.boxes}>
            {boxes.map(([value, unit, word]) => (
              <Recessed key={unit} radius={12} style={styles.box} innerStyle={styles.boxInner}>
                <T num size={20} weight={600} lh={22}>
                  {countdownBox(value, unit)}
                </T>
                <T size={10} weight={500} lh={12} color={fx.quiet}>
                  {word}
                </T>
              </Recessed>
            ))}
          </View>
          {/* The perforation, notched at both edges. */}
          <View style={styles.perf}>
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={[styles.perfLine, { borderColor: colors.scheme === 'light' ? colors.stroke : 'rgba(255,255,255,0.14)' }]} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>
          <View style={styles.ticketRow}>
            <T variant="t4" weight={400} color={fx.quietBright} style={styles.grow}>
              <T variant="t4" weight={600}>
                {booking.vendorName}
              </T>
              {` · ${booking.serviceSummary}`}
            </T>
            <StatusChip tone={chip.tone} dot={false}>
              {chip.label}
            </StatusChip>
          </View>
          {carLine ? (
            <T variant="t5" color={colors.dim} style={styles.mt4}>
              {carLine}
            </T>
          ) : null}
          {stops ? <ProgressRoad stops={stops} compact label="Where it stands" style={styles.ticketRoad} /> : null}
          <View style={styles.mt8}>
            {needs ? (
              <View style={styles.needs}>
                <View style={styles.dot} />
                <T variant="t4" weight={400} style={styles.grow}>
                  {needs}
                </T>
              </View>
            ) : (waitingUntil ?? (booking.paymentStatus === 'paid' ? 'Paid' : null)) ? (
              <T variant="t4" weight={400} color={colors.dim}>
                {waitingUntil ?? 'Paid'}
              </T>
            ) : null}
          </View>
        </Edge>
      </Pressable>
    </Rise>
  );
}

/** A past booking in the compact list (moment 5): its service, the day and the garage, the price, and Book again. */
function PastRow({ booking, addresses, now, index }: { booking: Booking; addresses: Address[]; now: number; index: number }) {
  const colors = useColors();
  const styles = useStyles();
  const { fx } = useFinish();
  const { chip, refunded, label } = cardFacts(booking, null, now);
  return (
    <Rise index={index}>
      <View style={styles.past}>
        <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => router.push(`/bookings/${booking.id}` as Href)}>
          <View style={styles.top}>
            <T variant="t4" weight={600} numberOfLines={1} style={styles.grow}>
              {booking.serviceSummary}
            </T>
            <View style={styles.chips}>
              {refunded ? <StatusChip tone="done" dot={false}>Refunded</StatusChip> : null}
              <StatusChip tone={chip.tone} dot={false}>{chip.label}</StatusChip>
            </View>
          </View>
          <View style={[styles.top, styles.mt4]}>
            <T variant="t5" numberOfLines={1} color={fx.quiet} style={styles.grow}>
              {[formatWhen(booking.scheduledAtIso, now), booking.vendorName].join(' · ')}
            </T>
            <View style={styles.price}>
              {booking.discountAmount > 0 ? (
                <T num variant="t5" color={colors.textMuted} style={styles.struck}>
                  {money(booking.subtotalPrice)}
                </T>
              ) : null}
              <T num variant="t4" weight={600}>
                {money(booking.servicePrice)}
              </T>
            </View>
          </View>
        </Pressable>
        <View style={styles.pastAgain}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Book again: ${booking.serviceSummary} at ${booking.vendorName}`}
            onPress={() => router.push(bookAgainPath(booking, matchSavedAddress(booking, addresses)) as Href)}
            style={styles.again}
          >
            <IconRepeat size={14} />
            <T variant="t5" weight={600}>
              Book again
            </T>
          </Pressable>
        </View>
      </View>
    </Rise>
  );
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
            {refunded ? <StatusChip tone="done" dot={false}>Refunded</StatusChip> : null}
            <StatusChip tone={chip.tone} dot={false}>{chip.label}</StatusChip>
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
  const [refreshing, setRefreshing] = useState(false);
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
        <T accessibilityRole="header" variant="title">
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
  const [next, ...later] = list;

  // Pull the list down to ask again now (moment 6); it also refreshes on every visit, as before.
  const refresh = () => {
    setRefreshing(true);
    Promise.all([fetchCustomerBookings(), updates.refetch()])
      .then(
        () => setLoaded(true),
        () => undefined
      )
      .finally(() => setRefreshing(false));
  };

  return (
    <CustomerShell refreshing={refreshing} onRefresh={refresh}>
      <T accessibilityRole="header" variant="title">
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
        // Past: a compact list. Upcoming: the next booking as a ticket, the rest as cards under it.
        tab === 'past' ? (
          <View style={styles.pastList}>
            {list.map((booking, i) => (
              <PastRow key={booking.id} booking={booking} addresses={addresses} now={now} index={Math.min(i, 8)} />
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            <TicketCard booking={next} action={actions.get(next.id) ?? null} now={now} />
            {later.map((booking, i) => (
              <Rise key={booking.id} index={Math.min(i, 8)}>
                <BookingCard booking={booking} tab={tab} addresses={addresses} action={actions.get(booking.id) ?? null} now={now} />
              </Rise>
            ))}
          </View>
        )
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
  ticket: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 },
  ticketNeeds: { borderWidth: 1, borderColor: 'rgba(239,50,64,0.7)' },
  ticketWhen: { marginTop: 6 },
  boxes: { marginTop: 12, flexDirection: 'row', gap: 6 },
  box: { minWidth: 52 },
  boxInner: { alignItems: 'center', paddingVertical: 8 },
  perf: { marginHorizontal: -16, marginTop: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center' },
  perfLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', marginHorizontal: 8 },
  notch: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.canvas },
  notchLeft: { marginLeft: -10 },
  notchRight: { marginRight: -10 },
  ticketRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  ticketRoad: { marginTop: 20, marginBottom: 6 },
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  pastList: { gap: 6 },
  past: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.scheme === 'light' ? c.border : 'rgba(255,255,255,0.06)',
    backgroundColor: c.scheme === 'light' ? c.surface : '#111114',
    paddingTop: 12,
    paddingLeft: 14,
    paddingRight: 12,
  },
  pastAgain: { marginBottom: -2, flexDirection: 'row', justifyContent: 'flex-end' },
  againRow: { marginBottom: -12, marginTop: 4, flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: c.line, paddingTop: 2 },
  again: { marginRight: -8, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
}));
