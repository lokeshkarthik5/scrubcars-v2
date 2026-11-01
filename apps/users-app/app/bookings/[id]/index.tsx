import { getBooking } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { invalidateHome } from '@repo/core/api/hooks/use-home';
import { invalidateRewards } from '@repo/core/api/hooks/use-rewards';
import { slotKeys } from '@repo/core/api/hooks/use-slots';
import { useTravelTime } from '@repo/core/api/hooks/use-travel-time';
import { createPaymentOrder, verifyPayment } from '@repo/core/api/payments';
import { bookAgainPath, canBookAgain, matchSavedAddress } from '@repo/core/book-again';
import { BOOKING_TYPE_LABELS, bookingReference, CONFIRMED_CHANGE_CUTOFF_MINS } from '@repo/core/booking-types';
import { googleMapsLink, telHref, whatsAppHref } from '@repo/core/contact-links';
import { contactWindowState } from '@repo/core/contact-window';
import { formatWhen } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { finalBillMayChange, formatStepTime } from '@repo/core/job-records';
import { confirmPayment, FALLBACK_REFUND_MESSAGE, realClock } from '@repo/core/payment-confirmation';
import { carWithGarage } from '@repo/core/pickup';
import { customerRefundLine } from '@repo/core/refunds';
import { customerWaitingNote } from '@repo/core/response-deadline';
import { useBookingsStore } from '@repo/core/stores/bookings-store';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Booking } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { AddOnMark } from '@repo/native-ui/chip';
import { IconArrowUpRight, IconChevronRight, IconNavigation, IconRepeat } from '@repo/native-ui/icons';
import { ScInput } from '@repo/native-ui/inputs';
import { HubCard, ScCard, Skeleton, Spinner, Stars } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarConditionCard } from '@/components/booking/car-condition-card';
import { BookingDirectionsSheet, describeDrive } from '@/components/booking/directions-sheet';
import { ExtraWorkCard } from '@/components/booking/extra-work-card';
import { type BillPayment, FinalBillCard } from '@/components/booking/final-bill-card';
import { BookingHelpSheet } from '@/components/booking/help-sheet';
import { JobPhotosCard } from '@/components/booking/job-photos-card';
import { OtherGaragesCard } from '@/components/booking/other-garages-card';
import { PickupCodeCard, PickupTimeline, StatusStepper } from '@/components/booking/progress';
import { BypassReportLine } from '@/components/booking/report-bypass';
import { SuccessBurst } from '@/components/booking/success-burst';
import { TimeProposalCard } from '@/components/booking/time-proposal-card';
import { PaymentReceivedPanel } from '@/components/checkout/payment-received-panel';
import { WhenPicker } from '@/components/checkout/when-picker';
import { PageHeader } from '@/components/page-header';
import { bookingHeadline, STATUS_STEPS } from '@/lib/booking-status';
import { cancelledPanel, cancelRefundNote, paymentRowLabel } from '@/lib/booking-detail';
import { openCheckout } from '@/lib/checkout';
import { errorText } from '@/lib/error-text';
import { coarse, isStale, useLocationStore } from '@/lib/location';
import { openLink } from '@/lib/open-link';
import { pendingPayment, setPaymentFlowOnScreen } from '@/lib/pending-payment';
import { money } from '@/lib/price';

const OPEN_STATUSES: ReadonlySet<Booking['status']> = new Set(['pending', 'confirmed', 'in_progress']);

function Row({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.detailRow, !last && styles.detailLine]}>
      <T size={15} lh={20} style={styles.rowLabel}>
        {label}
      </T>
      <View style={styles.rowValue}>
        {typeof children === 'string' ? (
          <T size={15} lh={20} color={colors.textSecondary} align="right">
            {children}
          </T>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

function Amount({ value, color }: { value: string; color?: string }) {
  const colors = useColors();
  return (
    <T num size={15} lh={20} color={color ?? colors.textSecondary} align="right">
      {value}
    </T>
  );
}

function ContactRow({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={[styles.contactRow, !last && styles.detailLine]}>
      <T size={15} lh={20} style={styles.grow}>
        {label}
      </T>
      <IconChevronRight size={16} stroke={1.5} color={colors.dim} />
    </Pressable>
  );
}

/** apps/users/app/bookings/[id]/page.tsx. The review, guarantee and scratch card come with the next stage. */
export default function BookingDetailScreen() {
  const params = useLocalSearchParams<{ id: string; celebrate?: string; then?: string; rate?: string }>();
  const id = String(params.id);
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((s) => s.profile);
  const fetchProfile = useUserStore((s) => s.fetchProfile);
  const addresses = useUserStore((s) => s.addresses);
  const fetchAddresses = useUserStore((s) => s.fetchAddresses);
  const cancelBooking = useBookingsStore((s) => s.cancelBooking);
  const rescheduleBooking = useBookingsStore((s) => s.rescheduleBooking);
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [arrival] = useState(() => {
    const then = params.then;
    return { then: then === 'pay' || then === 'reschedule' || then === 'help' || then === 'times' || then === 'extra' ? then : null };
  });
  const arrivalHandled = useRef(false);
  const [paying, setPaying] = useState(false);
  const paidRef = useRef(false);
  const [paid, setPaid] = useState<{ paymentId: string; phase: 'confirming' | 'booked' | 'unconfirmed' | 'failed'; refundMessage?: string } | null>(null);
  const [billPayments, setBillPayments] = useState<Record<string, BillPayment>>({});
  const recordBillPayment = (chargeId: string, payment: BillPayment) => setBillPayments((current) => ({ ...current, [chargeId]: payment }));
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showReschedule, setShowReschedule] = useState(arrival.then === 'reschedule');
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const [showHelp, setShowHelp] = useState(arrival.then === 'help');
  const storedLocation = useLocationStore((s) => s.location);
  const gpsHere = storedLocation?.source === 'gps' && !isStale(storedLocation) ? coarse(storedLocation) : null;
  const [celebrating, setCelebrating] = useState(() => params.celebrate === '1');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const cardY = useRef<Partial<Record<'bill' | 'extra' | 'times', number>>>({});

  const needsAddresses = !!booking && booking.bookingType !== 'dropin' && canBookAgain(booking) && addresses.length === 0;
  useEffect(() => {
    if (needsAddresses) void fetchAddresses().catch(() => undefined);
  }, [needsAddresses, fetchAddresses]);

  useEffect(() => {
    getBooking(id).then(
      (b) => (b ? setBooking(b) : setLoadError(true)),
      () => setLoadError(true)
    );
  }, [id]);

  useEffect(() => {
    if (!booking || arrivalHandled.current) return;
    arrivalHandled.current = true;
    const target =
      arrival.then === 'pay' && booking.finalBill?.status === 'due'
        ? 'bill'
        : arrival.then === 'times' && booking.timeProposal?.status === 'open'
          ? 'times'
          : arrival.then === 'extra' && booking.extraWork.some((work) => work.state === 'awaiting')
            ? 'extra'
            : null;
    if (target) {
      setTimeout(() => {
        const y = cardY.current[target];
        if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      }, 300);
    }
  }, [booking, arrival]);

  const bookingStatus = booking?.status;
  const watchingBill = booking ? finalBillMayChange(booking, now) : false;
  useEffect(() => {
    if (!bookingStatus) return;
    const terminal = bookingStatus === 'completed' || bookingStatus === 'cancelled' || bookingStatus === 'rescheduled';
    if (terminal && !watchingBill) return;
    const interval = setInterval(
      async () => {
        const fresh = await getBooking(id).catch(() => null);
        if (fresh) setBooking(fresh);
      },
      terminal ? 15_000 : 5000
    );
    return () => clearInterval(interval);
  }, [id, bookingStatus, watchingBill]);

  const bookingPaid = booking?.paymentStatus === 'paid';
  const paymentSettled = paid?.phase === 'booked' || (paid !== null && paid.phase !== 'confirming' && bookingPaid);
  const showPaymentPanel = !paymentSettled && (paid?.phase === 'unconfirmed' || paid?.phase === 'failed');

  const handlePayNow = async () => {
    if (!booking || paying || paidRef.current) return;
    setPaying(true);
    setPaymentFlowOnScreen(true);
    try {
      if (!profile) await fetchProfile();
      const order = await createPaymentOrder(booking.id);
      pendingPayment.write({ kind: 'booking', bookingId: booking.id, vendorName: booking.vendorName, startedAt: Date.now() });
      const result = await openCheckout(order, { description: `${booking.serviceSummary} at ${booking.vendorName}`, name: profile?.name, phone: profile?.phone });
      if (result.kind === 'cancelled') {
        pendingPayment.clear();
        toast.info('Payment cancelled. You can pay anytime from booking details.');
        return;
      }
      if (result.kind === 'failed') {
        pendingPayment.clear();
        toast.error(result.message);
        return;
      }
      paidRef.current = true;
      setPaid({ paymentId: result.paymentId, phase: 'confirming' });
      const outcome = await confirmPayment({
        verify: async () => {
          // No marketing data from the app.
          await verifyPayment({ bookingId: booking.id, razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature });
          return { bookingId: booking.id };
        },
        poll: async () => {
          const fresh = await getBooking(booking.id);
          if (fresh?.paymentStatus !== 'paid') return { kind: 'pending' };
          return fresh.status === 'cancelled' ? { kind: 'failed', message: fresh.cancellationReason ?? FALLBACK_REFUND_MESSAGE } : { kind: 'booked', bookingId: booking.id };
        },
        ...realClock,
      });
      if (outcome.kind !== 'unconfirmed') pendingPayment.clear();
      if (outcome.kind === 'booked') {
        const updated = await getBooking(booking.id);
        if (updated) setBooking(updated);
        setPaid({ paymentId: result.paymentId, phase: 'booked' });
        void invalidateHome(queryClient);
        toast.success('Payment successful');
      } else {
        setPaid({ paymentId: result.paymentId, phase: outcome.kind, refundMessage: outcome.kind === 'failed' ? outcome.message : undefined });
      }
    } catch (error) {
      toast.error(errorText(error, 'Could not start the payment. Please try again.'));
    } finally {
      setPaymentFlowOnScreen(false);
      setPaying(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!booking || cancelling) return;
    setCancelling(true);
    try {
      const updated = await cancelBooking(booking.id, cancelReason.trim() || undefined);
      setBooking(updated);
      setShowCancelConfirm(false);
      setCancelReason('');
      void invalidateHome(queryClient);
      void invalidateRewards(queryClient);
      toast.success('Booking cancelled');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CAR_WITH_GARAGE') {
        setShowCancelConfirm(false);
        const fresh = await getBooking(id).catch(() => null);
        if (fresh) setBooking(fresh);
        toast.error('The garage has already collected your car, so this booking can’t be cancelled here. Use Help with this booking.');
      } else {
        toast.error(errorText(error, 'Failed to cancel booking'));
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async () => {
    if (!booking || rescheduling || !rescheduleSlot) return;
    setRescheduling(true);
    try {
      const created = await rescheduleBooking(booking.id, rescheduleSlot);
      setShowReschedule(false);
      setRescheduleSlot(null);
      void invalidateHome(queryClient);
      toast.success(`New time sent to ${booking.vendorName}. Waiting for them to accept.`);
      router.replace(`/bookings/${created.id}` as Href);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === 'SLOT_TOO_SOON' || code === 'INVALID_SCHEDULED_AT' || code === 'SLOT_FULL' || code === 'GARAGE_CLOSED_THAT_DAY') {
        setRescheduleSlot(null);
        void queryClient.invalidateQueries({ queryKey: slotKeys.all });
      } else if (code === 'RESCHEDULE_WINDOW_PASSED' || code === 'RESCHEDULE_LIMIT_REACHED' || code === 'BOOKING_STATE_CHANGED' || code === 'INVALID_BOOKING_STATUS' || code === 'CAR_WITH_GARAGE') {
        setShowReschedule(false);
        const fresh = await getBooking(id).catch(() => null);
        if (fresh) setBooking(fresh);
      }
      toast.error(errorText(error, 'Failed to reschedule booking'));
    } finally {
      setRescheduling(false);
    }
  };

  const garage = booking?.garage;
  const findable = !!garage && ((garage.lat !== null && garage.lng !== null) || !!garage.address || !!googleMapsLink(garage.mapsUrl));
  const gettingThere = booking?.bookingType === 'dropin' && OPEN_STATUSES.has(booking.status) && findable ? garage : undefined;
  const travel = useTravelTime(gettingThere ? gpsHere : null, gettingThere ? { lat: gettingThere.lat, lng: gettingThere.lng } : null);

  if (loadError) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PageHeader title="Booking" backTo="/bookings" />
        <T size={15} lh={22} color={colors.textSecondary} style={styles.loadError}>
          Could not load this booking. It may have been removed or you may not have access.
        </T>
      </View>
    );
  }
  if (!booking) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PageHeader title="Booking" backTo="/bookings" />
        <View style={styles.loading}>
          <Skeleton height={132} />
          <Skeleton height={220} />
        </View>
      </View>
    );
  }

  const cancelled = booking.status === 'cancelled' ? cancelledPanel(booking) : null;
  const lockedIn = booking.status === 'confirmed' && new Date(booking.scheduledAtIso).getTime() - now < CONFIRMED_CHANGE_CUTOFF_MINS * 60_000;
  const awaitingGarage = booking.status === 'pending';
  const timeProposal = booking.timeProposal?.status === 'open' ? booking.timeProposal : null;
  const missedByGarage = booking.status === 'pending' && new Date(booking.scheduledAtIso).getTime() <= now && !timeProposal;
  const billDue =
    (booking.finalBill?.status === 'due' && booking.status !== 'cancelled') ||
    (['confirmed', 'in_progress'].includes(booking.status) && booking.extraWork.some((work) => work.state === 'awaiting')) ||
    timeProposal !== null;
  const unpaid = !paid && booking.paymentMethod === 'online' && booking.paymentStatus === 'pending' && booking.status !== 'cancelled';
  const stepTime = (iso: string | undefined) => (iso ? formatStepTime(iso, now) : undefined);
  const isPickup = booking.bookingType === 'pickup';
  const carAway = carWithGarage(booking);
  const canChange = ['pending', 'confirmed'].includes(booking.status) && !carAway && !timeProposal;
  const headline = bookingHeadline(booking, now);
  const statusTitle = cancelled ? cancelled.title : headline.title;
  const showProgress = booking.status !== 'rescheduled' && booking.status !== 'cancelled' && !missedByGarage;
  const contactGarage = booking.garage;
  // Numbers only when the API's window says so.
  const contactOpen = !['cancelled', 'rescheduled'].includes(booking.status) && contactWindowState(booking.contactWindow, now) === 'open';
  const garageCall = contactOpen ? telHref(contactGarage?.phone) : null;
  const garageMessage = `Hi, this is about my Detlio booking #${bookingReference(booking.id)} with you for ${booking.scheduledAt}.`;
  const garageWhatsApp = contactOpen ? (whatsAppHref(contactGarage?.whatsapp, garageMessage) ?? whatsAppHref(contactGarage?.phone, garageMessage)) : null;
  const finished = booking.status === 'completed';
  const waitingNote = awaitingGarage && booking.paymentStatus === 'paid' && !timeProposal && !missedByGarage ? customerWaitingNote(booking.responseDeadline, now) : null;
  const earlierRefund = !cancelled ? customerRefundLine(booking.refund, 'earlier_bill') : null;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={`Booking #${bookingReference(booking.id)}`} backTo="/bookings" />
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.status}>
          <T size={13} lh={18} color={colors.dim}>
            {[booking.vendorName, BOOKING_TYPE_LABELS[booking.bookingType], booking.vehicle?.model].filter(Boolean).join(' · ')}
          </T>
          <T accessibilityRole="header" size={28} weight={300} lh={32} tracking={-0.025}>
            {statusTitle}
          </T>
          {cancelled
            ? cancelled.lines.map((line) => (
                <T key={line} size={15} lh={22} color={colors.textSecondary}>
                  {line}
                </T>
              ))
            : headline.detail ? (
                <T size={15} lh={22} color={colors.textSecondary}>
                  {headline.detail}
                </T>
              ) : null}
          {waitingNote ? (
            <T size={13} lh={18} color={colors.dim}>
              {waitingNote}
            </T>
          ) : null}
          {missedByGarage ? (
            <T size={15} lh={22} color={colors.textSecondary}>
              {"Your booking time has passed without the garage accepting, so this booking won't go ahead. Cancel it or pick a new time below, or use Help with this booking about your payment."}
            </T>
          ) : null}
          {booking.status === 'rescheduled' ? (
            <T size={15} lh={22} color={colors.textSecondary}>
              This booking was moved to a new time. Open your bookings to see the new one and whether the garage has accepted it.
            </T>
          ) : null}
          {headline.step !== null && showProgress ? (
            <View style={styles.meter}>
              <View style={styles.bars}>
                {STATUS_STEPS.map((step, i) => (
                  <View key={step} style={[styles.bar, i <= headline.step! ? styles.barOn : styles.barOff]} />
                ))}
              </View>
              <View style={styles.bars}>
                {STATUS_STEPS.map((step, i) => (
                  <T key={step} size={12} lh={16} align={i === 3 ? 'right' : undefined} color={i === headline.step ? colors.textPrimary : colors.dim} style={styles.barLabel}>
                    {step}
                  </T>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {timeProposal ? (
          <View onLayout={(e) => (cardY.current.times = e.nativeEvent.layout.y)}>
            <TimeProposalCard
              key={timeProposal.id}
              booking={booking}
              proposal={timeProposal}
              onMoved={(moved) => {
                setBooking(moved);
                void invalidateHome(queryClient);
                router.replace(`/bookings/${moved.id}` as Href);
              }}
              onDeclined={(cancelledBooking) => {
                setBooking(cancelledBooking);
                void invalidateHome(queryClient);
              }}
              onStale={() => {
                void getBooking(booking.id).then((fresh) => fresh && setBooking(fresh));
              }}
            />
          </View>
        ) : null}

        {isPickup && !missedByGarage ? <PickupCodeCard booking={booking} /> : null}

        {Object.entries(billPayments)
          .filter(([chargeId, payment]) => chargeId !== booking.finalBill?.id && payment.phase !== 'paid')
          .map(([chargeId, payment]) => (
            <ScCard key={chargeId} style={styles.gap12}>
              <T size={17} weight={500} lh={24}>
                Your earlier bill payment
              </T>
              {payment.phase === 'confirming' ? (
                <View style={styles.confirming}>
                  <Spinner size={16} />
                  <T size={15} lh={20}>
                    Payment received — confirming…
                  </T>
                </View>
              ) : (
                <PaymentReceivedPanel paymentId={payment.paymentId} refundMessage={payment.phase === 'failed' ? payment.refundMessage : undefined} waitingOn="bill_not_marked_paid" />
              )}
            </ScCard>
          ))}

        {booking.finalBill && (booking.status !== 'cancelled' || booking.finalBill.status === 'paid') ? (
          <View onLayout={(e) => (cardY.current.bill = e.nativeEvent.layout.y)}>
            <FinalBillCard
              key={booking.finalBill.id}
              booking={booking}
              bill={booking.finalBill}
              payment={billPayments[booking.finalBill.id]}
              onPayment={recordBillPayment}
              onUpdated={(updated) => {
                setBooking(updated);
                void invalidateHome(queryClient);
              }}
              customer={{ name: profile?.name, phone: profile?.phone }}
            />
          </View>
        ) : null}

        {booking.extraWork.length > 0 ? (
          <View onLayout={(e) => (cardY.current.extra = e.nativeEvent.layout.y)}>
            <ExtraWorkCard
              booking={booking}
              onUpdated={(updated) => {
                setBooking(updated);
                void invalidateHome(queryClient);
              }}
              customer={{ name: profile?.name, phone: profile?.phone }}
            />
          </View>
        ) : null}

        {unpaid ? (
          <ScButton variant="hero" height={52} disabled={paying} onPress={() => void handlePayNow()}>
            <Label color={colors.white}>
              <Figures color={colors.white} size={15} weight={600} text={paying ? 'Opening payment...' : `Pay ${money(booking.servicePrice)}`} />
            </Label>
            {!paying ? <IconArrowUpRight size={17} stroke={1.5} color={colors.white} /> : null}
          </ScButton>
        ) : null}
        {paid?.phase === 'confirming' ? (
          <ScButton variant="quiet" height={52} disabled>
            <Spinner size={16} />
            <Label>Payment received — confirming your booking…</Label>
          </ScButton>
        ) : null}
        {showPaymentPanel && paid ? (
          <ScCard>
            <PaymentReceivedPanel paymentId={paid.paymentId} refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined} waitingOn="not_marked_paid" />
          </ScCard>
        ) : null}

        {finished && booking.review ? (
          <ScCard style={styles.gap8}>
            <T size={17} weight={500} lh={24}>
              Your review
            </T>
            <Stars rating={booking.review.rating} size={18} />
            <T size={15} lh={22} color={colors.textSecondary}>
              Thanks for your review.
            </T>
            {booking.review.comment ? (
              <T size={15} lh={22}>
                {booking.review.comment}
              </T>
            ) : null}
          </ScCard>
        ) : null}

        {finished && canBookAgain(booking) && !billDue ? (
          <ScButton variant="hero" onPress={() => router.push(bookAgainPath(booking, matchSavedAddress(booking, addresses)) as Href)}>
            <Label color={colors.white}>Book again</Label>
            <IconArrowUpRight size={17} stroke={1.5} color={colors.white} />
          </ScButton>
        ) : null}

        <JobPhotosCard photos={booking.jobPhotos} completed={finished} />
        <CarConditionCard
          booking={booking}
          onChanged={async () => {
            const fresh = await getBooking(booking.id).catch(() => null);
            if (fresh) setBooking(fresh);
          }}
        />

        <HubCard style={styles.details}>
          <Row label={booking.items.length > 1 ? 'Services' : (booking.items[0]?.name ?? 'Service')}>
            {booking.items.length > 1 ? (
              <View style={styles.itemList}>
                {booking.items.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <T size={15} lh={20} color={colors.textSecondary} align="right">
                      {`${item.name} `}
                      <T num size={15} lh={20} color={colors.textSecondary}>
                        {money(item.amount)}
                      </T>
                    </T>
                    {item.isAddon ? <AddOnMark /> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Amount value={money(booking.items[0]?.amount ?? booking.subtotalPrice)} />
            )}
          </Row>
          {(booking.travelFee ?? 0) > 0 ? (
            <Row label="Travel fee">
              <Amount value={money(booking.travelFee ?? 0)} />
            </Row>
          ) : null}
          {booking.discountAmount > 0 ? (
            <Row label={`Discount${booking.discountCode ? ` (${booking.discountCode})` : ''}`}>
              <Amount value={`−${money(booking.discountAmount)}`} color={colors.success} />
            </Row>
          ) : null}
          <Row label={paymentRowLabel(booking)}>
            <Amount value={money(booking.servicePrice)} />
          </Row>
          {(booking.creditPaid ?? 0) > 0 ? (
            <Row label="Paid with Detlio credit">
              <Amount value={money(booking.creditPaid ?? 0)} />
            </Row>
          ) : null}
          <Row label="When">{formatWhen(booking.scheduledAtIso, now)}</Row>
          <Row label={isPickup ? 'Collected from' : 'Where'}>
            {booking.jobLocation?.address ?? ([contactGarage?.address, contactGarage?.city].filter(Boolean).join(', ') || BOOKING_TYPE_LABELS[booking.bookingType])}
          </Row>
          {booking.vehicle ? <Row label="Car">{`${booking.vehicle.make} ${booking.vehicle.model}`}</Row> : null}
          <Row label="Receipt" last>
            {booking.receiptAvailable ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(`/bookings/${booking.id}/receipt` as Href)} style={styles.receiptLink}>
                <T size={15} lh={20}>
                  View receipt
                </T>
                <IconChevronRight size={16} stroke={1.5} color={colors.textPrimary} />
              </Pressable>
            ) : (
              <T size={15} lh={20} color={colors.dim} align="right">
                After payment
              </T>
            )}
          </Row>
        </HubCard>

        {gettingThere && !missedByGarage ? (
          <ScCard style={styles.getting}>
            <View style={styles.grow}>
              <T size={15} weight={500} lh={20}>
                Getting there
              </T>
              {gettingThere.address ? (
                <T size={13} lh={18} color={colors.textSecondary} style={styles.mt2}>
                  {[gettingThere.address, gettingThere.city].filter(Boolean).join(', ')}
                </T>
              ) : null}
              {travel.data ? (
                <T size={13} lh={18} color={colors.textSecondary} style={styles.mt4}>
                  {describeDrive(travel.data).atGarage ? (
                    "You're at the garage."
                  ) : (
                    <>
                      <T num size={13} lh={18}>
                        {describeDrive(travel.data).time}
                      </T>
                      {' drive from you'}
                    </>
                  )}
                </T>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" onPress={() => setShowDirections(true)} style={styles.directions}>
              <IconNavigation size={16} color={colors.textPrimary} />
              <T size={15} lh={20}>
                Directions
              </T>
            </Pressable>
          </ScCard>
        ) : null}

        <HubCard style={styles.details}>
          {garageCall ? <ContactRow label={`Call ${booking.vendorName}`} onPress={() => openLink(garageCall)} /> : null}
          {garageWhatsApp ? <ContactRow label="WhatsApp the garage" onPress={() => openLink(garageWhatsApp)} /> : null}
          <ContactRow label="Help with this booking" onPress={() => setShowHelp(true)} last />
        </HubCard>

        <BypassReportLine booking={booking} />

        {earlierRefund ? (
          <ScCard>
            <T size={15} weight={500} lh={20} style={styles.mb4}>
              Refund
            </T>
            <T size={15} lh={22} color={colors.textSecondary}>
              {earlierRefund}
            </T>
          </ScCard>
        ) : null}

        {booking.status === 'cancelled' && booking.notAcceptedInTime ? <OtherGaragesCard booking={booking} /> : null}

        {!finished && canBookAgain(booking) ? (
          <ScButton variant="outline" height={52} onPress={() => router.push(bookAgainPath(booking, matchSavedAddress(booking, addresses)) as Href)}>
            <IconRepeat size={18} color={colors.textPrimary} />
            <Label>Book again</Label>
          </ScButton>
        ) : null}

        {carAway && OPEN_STATUSES.has(booking.status) ? (
          <ScCard>
            <T size={15} weight={500} lh={20} style={styles.mb4}>
              Your car is with the garage
            </T>
            <T size={15} lh={22} color={colors.textSecondary}>
              {`${booking.vendorName} has collected your car, so this booking can't be cancelled or moved in the app. To change anything, or if something isn't right, use Help with this booking to reach the garage or our team, or raise a complaint there.`}
            </T>
          </ScCard>
        ) : null}

        {canChange ? (
          <HubCard style={styles.change}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {`${
                lockedIn
                  ? `Your slot is less than 2 hours away, so it can't be moved here. Use Help with this booking to reach ${booking.vendorName} or our team.`
                  : booking.status === 'confirmed'
                    ? `You can reschedule twice in all · ${booking.remainingReschedules} of 2 left. Your booking goes back to Requested until ${booking.vendorName} accepts the new time.`
                    : `You can reschedule twice in all · ${booking.remainingReschedules} of 2 left. ${booking.vendorName} will need to accept the new time.`
              }${isPickup && !lockedIn ? ' You can move it until the garage collects your car.' : ''}`}
            </T>
            <ScButton
              variant="outline"
              height={52}
              disabled={booking.remainingReschedules <= 0 || lockedIn}
              onPress={() => {
                setRescheduleSlot(null);
                setShowReschedule(true);
              }}
            >
              {booking.remainingReschedules <= 0 ? 'No reschedules left' : lockedIn ? 'Too close to your slot to move' : 'Reschedule'}
            </ScButton>
            {lockedIn ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                {`Your slot is less than 2 hours away and ${booking.vendorName} has accepted it, so it can't be cancelled here. Use Help with this booking to reach the garage or our team.`}
              </T>
            ) : showCancelConfirm ? (
              <View style={styles.cancelBox}>
                <T size={15} lh={22}>
                  {booking.status === 'pending' ? `${booking.vendorName} hasn't accepted yet, so you can cancel any time. This cannot be undone.` : 'Cancel this booking? This cannot be undone.'}
                </T>
                <ScInput placeholder="Reason (optional)" value={cancelReason} onChangeText={setCancelReason} />
                {booking.paymentMethod === 'online' && booking.paymentStatus === 'paid' ? (
                  <T size={13} lh={18} color={colors.textMuted}>
                    {cancelRefundNote(booking)}
                  </T>
                ) : null}
                <View style={styles.row8}>
                  <View style={styles.grow}>
                    <ScButton variant="outline" height={52} paddingX={8} disabled={cancelling} onPress={() => setShowCancelConfirm(false)}>
                      Keep booking
                    </ScButton>
                  </View>
                  <View style={styles.grow}>
                    <ScButton variant="danger-outline" height={52} paddingX={8} disabled={cancelling} onPress={() => void handleCancelBooking()}>
                      {cancelling ? 'Cancelling...' : 'Confirm cancel'}
                    </ScButton>
                  </View>
                </View>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setShowCancelConfirm(true)} style={styles.cancelLink}>
                <T size={15} weight={500} lh={20} color={colors.error} align="center">
                  Cancel booking
                </T>
              </Pressable>
            )}
          </HubCard>
        ) : null}

        {showProgress ? (
          <ScCard>
            <T size={15} weight={500} lh={20} style={styles.mb12}>
              Progress
            </T>
            {isPickup ? (
              <PickupTimeline booking={booking} now={now} />
            ) : (
              <StatusStepper
                status={booking.status}
                times={{
                  requested: stepTime(booking.requestedAtIso),
                  confirmed: stepTime(booking.acceptedAtIso),
                  in_progress: stepTime(booking.startedAtIso),
                  completed: stepTime(booking.completedAtIso),
                }}
              />
            )}
          </ScCard>
        ) : null}
      </ScrollView>

      {gettingThere ? <BookingDirectionsSheet open={showDirections} onClose={() => setShowDirections(false)} booking={booking} /> : null}
      {celebrating ? (
        <SuccessBurst
          title={awaitingGarage ? 'Booking requested' : 'Booking confirmed'}
          subtitle={awaitingGarage ? `Waiting for ${booking.vendorName} to accept your ${booking.scheduledAt} slot.` : `${booking.serviceSummary} at ${booking.vendorName} · ${booking.scheduledAt}`}
          onDone={() => setCelebrating(false)}
        />
      ) : null}
      <BookingHelpSheet open={showHelp} onClose={() => setShowHelp(false)} booking={booking} />

      <ScSheet
        horizontalPadding={16}
        open={showReschedule && canChange && booking.remainingReschedules > 0 && !lockedIn}
        onClose={() => setShowReschedule(false)}
        dismissible={!rescheduling}
        accessibilityLabel="Reschedule booking"
      >
        <T size={20} lh={28} tracking={-0.015}>
          Reschedule booking
        </T>
        <T size={13} lh={18} color={colors.textSecondary} style={styles.rescheduleSub}>
          {`You can reschedule only twice · ${booking.remainingReschedules} of 2 left. Pick a new time; ${booking.vendorName} will be asked to accept it.`}
        </T>
        <WhenPicker
          title="New time"
          vendorId={booking.vendorId}
          serviceIds={booking.items.map((item) => item.serviceId)}
          value={rescheduleSlot}
          onChange={setRescheduleSlot}
          onLapse={() => toast.info('That time is now too soon to book. Pick another time.')}
          bookingType={booking.bookingType}
          rescheduleOf={booking.id}
        />
        <View style={[styles.row8, styles.mt20]}>
          <View style={styles.grow}>
            <ScButton variant="outline" height={52} disabled={rescheduling} onPress={() => setShowReschedule(false)}>
              Cancel
            </ScButton>
          </View>
          <View style={styles.grow}>
            <ScButton variant={rescheduleSlot ? 'hero' : 'quiet'} height={52} paddingX={8} disabled={!rescheduleSlot || rescheduling} onPress={() => void handleReschedule()}>
              {rescheduling ? 'Rescheduling...' : 'Confirm reschedule'}
            </ScButton>
          </View>
        </View>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  loading: { paddingHorizontal: 16, gap: 12 },
  loadError: { paddingHorizontal: 16, paddingTop: 16 },
  status: { gap: 4, paddingBottom: 4 },
  meter: { marginTop: 12, gap: 6 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  barOn: { backgroundColor: c.textPrimary },
  barOff: { backgroundColor: c.meterOff },
  barLabel: { flex: 1 },
  gap12: { gap: 12 },
  gap8: { gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mb4: { marginBottom: 4 },
  mb12: { marginBottom: 12 },
  mt20: { marginTop: 20 },
  confirming: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  details: { paddingHorizontal: 20 },
  detailRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  detailLine: { borderBottomWidth: 1, borderBottomColor: c.line },
  rowLabel: { flexShrink: 0, maxWidth: '55%' },
  rowValue: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  itemList: { alignItems: 'flex-end', gap: 2 },
  item: { alignItems: 'flex-end', gap: 2 },
  receiptLink: { marginVertical: -8, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  getting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  directions: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c.stroke, paddingHorizontal: 16 },
  contactRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  change: { padding: 20, gap: 12 },
  cancelBox: { gap: 12, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 },
  row8: { flexDirection: 'row', gap: 8 },
  cancelLink: { minHeight: 44, justifyContent: 'center' },
  rescheduleSub: { marginTop: 4, marginBottom: 16 },
}));
