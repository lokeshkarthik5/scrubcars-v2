import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatINR, formatWhen } from '@repo/core/format';
import type { Booking } from '@repo/core/types';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { useIsVendorAdmin } from '@/lib/auth';
import { changeStatusWithUndo, DEFERRED_WORDS, useDeferredStatus } from '@/lib/deferred-status';
import {
  customerNumberLine,
  distanceKm,
  jobPrice,
  proposalOpen,
  responseRunOut,
  servicesLine,
  slotPassed,
} from '@/lib/jobs';
import { colors } from '@/lib/theme';

import { AnswerDeadline } from './answer-deadline';
import { Label, ScButton } from './button';
import { IconCar, IconCheck, IconHome, IconMapPin, IconPhoneOff, IconRefresh } from './icons';
import { PressRow } from './primitives';
import { RejectBookingSheet } from './reject-booking';
import { SuggestTimes } from './suggest-times';
import { T } from './text';

/**
 * NewBookingCard (apps/vendors/components/new-booking-card.tsx): a new booking,
 * answered in one look and one tap. The same card on Home, Bookings › New and the
 * job page (`onPage`).
 */
export function NewBookingCard({
  booking: b,
  now,
  onChanged,
  onPage = false,
  onLayout,
}: {
  booking: Booking;
  now: number;
  onChanged: () => void;
  onPage?: boolean;
  /** Where the card sits, for a notification that scrolls to it. */
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const deferred = useDeferredStatus(b.id);
  const accepting = deferred === 'confirmed';
  const who = b.customerName || 'the customer';
  const passed = slotPassed(b, now);
  const lost = responseRunOut(b, now);
  const waitingOnCustomer = proposalOpen(b);
  const numberLine = customerNumberLine(b, now);
  const km = distanceKm(b);
  const price = jobPrice(b);
  const isVendorAdmin = useIsVendorAdmin();

  const accept = () => changeStatusWithUndo(b.id, 'confirmed');
  const TypeIcon = b.bookingType === 'doorstep' ? IconHome : b.bookingType === 'pickup' ? IconCar : IconMapPin;

  const cantDo = (
    <ScButton
      variant="outline"
      accessibilityLabel={`Can't do: reject booking for ${who}`}
      onPress={() => setRejecting(true)}
    >
      {"Can't do"}
    </ScButton>
  );
  const secondRow = (
    <View style={styles.two}>
      {b.canSuggestTimes ? (
        <View style={styles.half}>
          <SuggestTimes booking={b} onChanged={onChanged} />
        </View>
      ) : null}
      <View style={styles.half}>{cantDo}</View>
    </View>
  );

  return (
    <View accessibilityLabel={`New booking from ${who}`} onLayout={onLayout} style={styles.card}>
      {b.responseDeadline && !waitingOnCustomer && (!passed || lost) ? (
        <AnswerDeadline deadline={b.responseDeadline} />
      ) : null}

      <View style={styles.inner}>
        {!onPage ? (
          <PressRow
            accessibilityLabel={`Details of the booking for ${who}`}
            onPress={() => router.push(`/bookings/${b.id}` as Href)}
            style={styles.details}
          >
            <T num size={24} weight={700} lh={30} tracking={-0.025}>
              {formatWhen(b.scheduledAtIso, now)}
            </T>
            <T size={17} weight={500}>
              {servicesLine(b)}
            </T>
            {b.vehicle ? (
              <T size={16} color={colors.textSecondary}>
                {`${b.vehicle.make} ${b.vehicle.model} · `}
                <T num size={16} tracking={0.025}>
                  {b.vehicle.plate}
                </T>
              </T>
            ) : null}
            <View style={styles.nameRow}>
              <T size={16} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
                {who}
              </T>
              {b.customerBadge ? (
                <View style={styles.badge}>
                  <T size={12} weight={500} lh={16} tracking={0.025} uppercase color={colors.textSecondary}>
                    {b.customerBadge}
                  </T>
                </View>
              ) : null}
            </View>
          </PressRow>
        ) : null}

        {b.guaranteeRedo ? (
          <View style={styles.redo}>
            <IconRefresh size={14} />
            <T size={13} weight={500}>
              Free redo · nothing to collect
            </T>
          </View>
        ) : null}

        <View style={[styles.where, !onPage && styles.whereRule]}>
          <View style={styles.whereText}>
            <View style={styles.whereIcon}>
              <TypeIcon size={18} color={colors.textSecondary} />
            </View>
            <T size={15} lh={22} color={colors.textSecondary} style={styles.shrink}>
              {BOOKING_TYPE_LABELS[b.bookingType]}
              {b.jobLocation && !onPage ? ` · ${b.jobLocation.address}` : ''}
              {km !== null ? (
                <T num size={15} lh={22} color={colors.textSecondary}>
                  {` · ${km} km`}
                </T>
              ) : null}
            </T>
          </View>
          {isVendorAdmin ? (
            <T num size={24} weight={700} lh={24} tracking={-0.025}>
              {formatINR(price)}
            </T>
          ) : null}
        </View>

        {b.rescheduledFromId && !passed ? (
          <T size={15} color={colors.textSecondary}>
            The customer moved this booking to a new time. Accept it if you can do it.
          </T>
        ) : null}

        {accepting ? (
          <View accessibilityLiveRegion="polite" style={styles.accepting}>
            <T size={16} weight={500}>
              {DEFERRED_WORDS.confirmed}
            </T>
          </View>
        ) : waitingOnCustomer ? (
          <SuggestTimes booking={b} onChanged={onChanged} />
        ) : lost ? null : passed ? (
          <View style={styles.passed}>
            <T size={15} color={colors.textSecondary}>
              {"This slot's time has passed without being accepted. Reject it so the customer can be refunded."}
            </T>
            {secondRow}
          </View>
        ) : (
          <View style={styles.actions}>
            <ScButton variant="main" size="lg" accessibilityLabel={`Accept booking for ${who}`} onPress={accept}>
              <IconCheck size={22} stroke={2.4} color={colors.white} />
              <Label color={colors.white}>Accept</Label>
            </ScButton>
            {secondRow}
          </View>
        )}

        {numberLine && !onPage ? (
          <View style={styles.numberLine}>
            <IconPhoneOff size={15} color={colors.textSecondary} />
            <T size={13} color={colors.textSecondary} align="center" style={styles.shrink}>
              {numberLine}
            </T>
          </View>
        ) : null}
      </View>

      <RejectBookingSheet booking={b} open={rejecting} onClose={() => setRejecting(false)} onDone={onChanged} />
    </View>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1, minWidth: 0 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  inner: { padding: 20, gap: 16 },
  details: { margin: -8, padding: 8, borderRadius: 14, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  badge: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  redo: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  where: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  whereRule: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  whereText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  whereIcon: { marginTop: 2 },
  accepting: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  passed: { gap: 12 },
  actions: { gap: 8 },
  two: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  numberLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
