import { bookingReference, BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { telHref, whatsAppHref } from '@repo/core/contact-links';
import { contactWindowState } from '@repo/core/contact-window';
import { formatWhen } from '@repo/core/format';
import { useNow } from '@repo/core/hooks/use-now';
import { jobStepTimes } from '@repo/core/job-records';
import { pickupTimeline } from '@repo/core/pickup';
import { bookingStatusTone } from '@repo/core/status-tone';
import type { Booking } from '@repo/core/types';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { BeforeAfterCompare } from '@/components/before-after';
import { Label, ScButton } from '@/components/button';
import { CancelAcceptedBooking } from '@/components/cancel-accepted-booking';
import { ExtraWorkPanel } from '@/components/extra-work';
import { FinalBillPanel } from '@/components/final-bill';
import {
  IconArrowLeft,
  IconBrandWhatsapp,
  IconCheck,
  IconChevronDown,
  IconCircle,
  IconLock,
  IconPhone,
} from '@/components/icons';
import { JobContact } from '@/components/job-contact';
import { JobPhotos } from '@/components/job-photos';
import { NewBookingCard } from '@/components/new-booking-card';
import { PickupSteps } from '@/components/pickup-steps';
import { EmptyState, LoadError, SkeletonList, Stars, StatusChip } from '@/components/primitives';
import { T } from '@/components/text';
import { changeStatusWithUndo, DEFERRED_WORDS, useDeferredStatus } from '@/lib/deferred-status';
import {
  blockers,
  cancelledLabel,
  photoCount,
  photosOpen,
  photoStage,
  progressIndex,
  PROGRESS_STEPS,
  servicesLine,
  statusLabel,
} from '@/lib/jobs';
import { openLink } from '@/lib/open-link';
import { colors } from '@/lib/theme';
import { useVendorBookings } from '@/lib/use-vendor-bookings';

/** apps/vendors/app/bookings/[id]/page.tsx: one job, one screen, one next step. */
function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings();
  const now = useNow(10_000);
  const booking = bookings.find((b) => b.id === id);

  if (!booking) {
    return (
      <AppShell hasNav={false} gap={16}>
        <BackLink />
        {!loaded ? (
          <SkeletonList count={3} height={128} />
        ) : failed ? (
          <LoadError what="this job" onRetry={reload} retrying={retrying} />
        ) : (
          <EmptyState title="This job isn't on your list" subtitle="It may belong to another garage, or the link is old." />
        )}
      </AppShell>
    );
  }

  return <Job booking={booking} now={now} onChanged={reload} />;
}

function BackLink() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to bookings"
      onPress={() => router.navigate('/bookings' as Href)}
      style={styles.round}
    >
      <IconArrowLeft size={22} />
    </Pressable>
  );
}

function Job({ booking: b, now, onChanged }: { booking: Booking; now: number; onChanged: () => void }) {
  const deferred = useDeferredStatus(b.id);
  const [beforeOpen, setBeforeOpen] = useState(false);
  const who = b.customerName || 'the customer';
  const ended = b.status === 'cancelled' || b.status === 'rescheduled';
  const contactOpen = !ended && contactWindowState(b.contactWindow, now) === 'open';
  const callHref = contactOpen ? telHref(b.customerPhone) : null;
  const firstName = b.customerName?.trim().split(/\s+/)[0];
  const chatHref = contactOpen
    ? whatsAppHref(
        b.customerPhone,
        `Hi${firstName ? ` ${firstName}` : ''}, this is ${b.vendorName || 'your garage'} about your Detlio booking for ${b.scheduledAt}.`
      )
    : null;
  const working = b.status === 'confirmed' || b.status === 'in_progress';
  const stepTimes = b.status !== 'pending' ? jobStepTimes(b, now) : [];
  const stage = photoStage(b);
  const docked = working && !ended;
  // The web's `empty:hidden`: each panel draws nothing in these cases, and a card
  // with nothing in it must not show as a line.
  const showExtra = b.extraWork.length > 0 || working;
  const showBill =
    (b.status === 'in_progress' || b.status === 'completed' || Boolean(b.finalBill)) &&
    (Boolean(b.finalBill) || b.canRaiseFinalBill);
  const shownStatus: Booking['status'] =
    deferred === 'completed'
      ? 'completed'
      : deferred === 'in_progress'
        ? 'in_progress'
        : deferred === 'confirmed'
          ? 'confirmed'
          : b.status;

  return (
    <AppShell
      hasNav={false}
      footer={docked ? <DockedStep booking={b} deferred={deferred} onChanged={onChanged} /> : undefined}
    >
      <View style={styles.header}>
        <BackLink />
        <View style={styles.flex}>
          <T accessibilityRole="header" size={22} weight={600} lh={28} numberOfLines={2}>
            {who}
          </T>
          <T num size={15} color={colors.textSecondary}>
            {`${formatWhen(b.scheduledAtIso, now)} · #${bookingReference(b.id)}`}
          </T>
        </View>
        {callHref ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Call ${who}`}
            onPress={() => openLink(callHref)}
            style={styles.round}
          >
            <IconPhone size={22} />
          </Pressable>
        ) : null}
        {chatHref ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`WhatsApp ${who}`}
            onPress={() => openLink(chatHref)}
            style={styles.round}
          >
            <IconBrandWhatsapp size={22} color="#25D366" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.vehicle}>
        <View style={styles.vehicleRow}>
          {b.vehicle ? (
            <T size={20} weight={600} style={styles.flex}>
              {`${b.vehicle.make} ${b.vehicle.model} · `}
              <T num size={20} weight={600} tracking={0.025}>
                {b.vehicle.plate}
              </T>
            </T>
          ) : (
            <View style={styles.flex} />
          )}
          <StatusChip tone={bookingStatusTone(shownStatus)} size="md">
            {statusLabel({ ...b, status: shownStatus })}
          </StatusChip>
        </View>
        <T size={16} color={colors.textSecondary}>
          {`${servicesLine(b)} · ${BOOKING_TYPE_LABELS[b.bookingType]}`}
        </T>
        {stepTimes.length > 0 ? (
          <T num size={14} color={colors.textSecondary}>
            {stepTimes.join(' · ')}
          </T>
        ) : null}
      </View>

      {b.status === 'pending' ? <NewBookingCard booking={b} now={now} onChanged={onChanged} onPage /> : null}

      {working || b.status === 'completed' ? <Progress booking={b} deferred={deferred} /> : null}

      {working ? (
        <View style={styles.card}>
          <JobPhotos booking={b} stage={stage} onChanged={onChanged} readOnly={!photosOpen(b, stage, now)} />
          {b.photoStandard?.required && b.photoStandard.waived ? (
            <T size={13} color={colors.textSecondary} style={styles.waived}>
              {"Detlio waived the photos for this job: Start and Complete don't wait for them."}
            </T>
          ) : null}
          {stage === 'after' ? (
            <View style={styles.fold}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: beforeOpen }}
                onPress={() => setBeforeOpen((value) => !value)}
                style={styles.foldHead}
              >
                <T size={15} weight={500}>
                  {'Before photos · '}
                  <T num size={15} weight={500}>
                    {photoCount(b, 'before').have}
                  </T>
                </T>
                <IconChevronDown size={18} color={colors.textSecondary} />
              </Pressable>
              {beforeOpen ? (
                <JobPhotos booking={b} stage="before" onChanged={onChanged} readOnly={!photosOpen(b, 'before', now)} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {b.status === 'completed' ? (
        <View style={styles.completed}>
          <BeforeAfterCompare photos={b.jobPhotos} />
          {photosOpen(b, 'after', now) ? <JobPhotos booking={b} stage="after" onChanged={onChanged} /> : null}
        </View>
      ) : null}

      {showExtra || showBill ? (
        <View style={styles.rows}>
          {showExtra ? <ExtraWorkPanel booking={b} onChanged={onChanged} /> : null}
          {showBill ? (
            <View style={showExtra ? styles.rowDivider : undefined}>
              <FinalBillPanel booking={b} onChanged={onChanged} />
            </View>
          ) : null}
        </View>
      ) : null}

      {b.status === 'completed' && b.review ? (
        <View style={styles.card}>
          <View style={styles.review}>
            <Stars rating={b.review.rating} size={16} />
            <T num size={15} weight={600}>
              {b.review.rating}
            </T>
          </View>
          {b.review.comment ? (
            <T size={15} color={colors.textSecondary} style={styles.mt}>
              {b.review.comment}
            </T>
          ) : null}
        </View>
      ) : null}

      {ended ? (
        <View style={styles.card}>
          <T size={16} weight={500}>
            {cancelledLabel(b)}
          </T>
          {b.cancellationReason && !b.notAcceptedInTime ? (
            <T size={15} color={colors.textSecondary} style={styles.mt}>
              {b.cancellationReason}
            </T>
          ) : null}
        </View>
      ) : null}

      <JobContact booking={b} now={now} />

      {b.status === 'confirmed' && !deferred ? (
        <CancelAcceptedBooking booking={b} now={now} onChanged={onChanged} />
      ) : null}
    </AppShell>
  );
}

const STEP_STATE_WORDS = { done: 'done', current: 'now', upcoming: 'to come' } as const;

function Progress({
  booking: b,
  deferred,
}: {
  booking: Booking;
  deferred: ReturnType<typeof useDeferredStatus>;
}) {
  const pickup = b.bookingType === 'pickup' ? pickupTimeline(b) : null;
  const steps = pickup
    ? pickup.map((step) => ({ label: step.label, state: step.state }))
    : PROGRESS_STEPS.map((label, i) => {
        const current =
          deferred === 'completed' ? PROGRESS_STEPS.length : deferred === 'in_progress' ? 2 : (progressIndex(b) ?? 0);
        return { label, state: i < current ? 'done' : i === current ? 'current' : 'upcoming' } as const;
      });
  return (
    <View accessibilityLabel="Job progress" style={styles.progress}>
      {steps.map((step, i) => (
        <View
          key={step.label}
          accessible
          accessibilityLabel={`${step.label}: ${STEP_STATE_WORDS[step.state]}`}
          // Each step's line runs back under the dot before it, as the web's z-10.
          style={[styles.step, { zIndex: steps.length - i }]}
        >
          {i > 0 ? (
            <View
              style={[
                styles.stepLine,
                { backgroundColor: step.state === 'upcoming' ? colors.border : colors.textPrimary },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.stepDot,
              step.state === 'done'
                ? styles.stepDone
                : step.state === 'current'
                  ? styles.stepCurrent
                  : styles.stepUpcoming,
            ]}
          >
            {step.state === 'done' ? (
              <IconCheck size={16} stroke={3} color={colors.brandBlack} />
            ) : step.state === 'current' ? (
              <View style={styles.stepInner} />
            ) : null}
          </View>
          <T
            size={13}
            weight={step.state === 'upcoming' ? 400 : 500}
            lh={16}
            align="center"
            color={step.state === 'upcoming' ? colors.textSecondary : colors.textPrimary}
          >
            {step.label}
          </T>
        </View>
      ))}
    </View>
  );
}

function DockedStep({
  booking: b,
  deferred,
  onChanged,
}: {
  booking: Booking;
  deferred: ReturnType<typeof useDeferredStatus>;
  onChanged: () => void;
}) {
  const who = b.customerName || 'the customer';
  const action = b.status === 'confirmed' ? 'start' : 'complete';
  const missing = blockers(b, action);

  if (deferred) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.waiting}>
        <T size={16} weight={500}>
          {DEFERRED_WORDS[deferred]}
        </T>
      </View>
    );
  }
  if (b.bookingType === 'pickup') {
    return <PickupSteps booking={b} onStartWork={() => changeStatusWithUndo(b.id, 'in_progress')} onChanged={onChanged} />;
  }
  const blocked = missing.length > 0;
  return (
    <View style={styles.dock}>
      {blocked ? (
        <View accessibilityLabel="Still to do" style={styles.missing}>
          {missing.map((line) => (
            <View key={line} style={styles.missingRow}>
              <IconCircle size={22} stroke={2.2} color={colors.warning} />
              <T size={16} style={styles.flex}>
                {line}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      <ScButton
        variant="main"
        size="lg"
        disabled={blocked}
        accessibilityLabel={`${action === 'start' ? 'Start' : 'Complete'} job for ${who}`}
        onPress={() => changeStatusWithUndo(b.id, action === 'start' ? 'in_progress' : 'completed')}
      >
        {blocked ? <IconLock size={20} color={colors.textSecondary} /> : null}
        <Label color={blocked ? colors.textSecondary : colors.white}>{action === 'start' ? 'Start job' : 'Complete job'}</Label>
      </ScButton>
    </View>
  );
}

export default garageScreen(JobScreen);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  vehicle: { gap: 4 },
  vehicleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
  },
  waived: { marginTop: 12 },
  fold: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  foldHead: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completed: { gap: 16 },
  rows: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  review: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mt: { marginTop: 4 },
  progress: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepLine: { position: 'absolute', top: 15, right: '50%', width: '100%', height: 2 },
  stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.textPrimary },
  stepCurrent: { borderWidth: 2, borderColor: '#3B82F6', backgroundColor: colors.brandBlack },
  stepUpcoming: { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.brandBlack },
  stepInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3B82F6' },
  dock: { gap: 12 },
  waiting: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  missing: { gap: 8 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
